import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import {
  MARKETPLACEPRO_DELIVERY_VERSION,
  receiveMarketplaceProDelivery,
  signMarketplaceProDelivery,
  type MarketplaceProDeliveryConnection,
  type MarketplaceProDeliveryDependencies,
  type MarketplaceProDeliveryEnvelope,
  type MarketplaceProDeliveryExecution,
} from "./marketplacepro-delivery";
import { updateMarketplaceProLeadStatus } from "./marketplacepro";
import { marketplaceProEventSchema } from "./marketplacepro";
import { readBoundedMarketplaceProBody } from "./marketplacepro-http";
import { receiveMarketplaceProLegacyDelivery } from "./marketplacepro-legacy-runtime";
import type { MarketplaceProQuery } from "./marketplacepro-delivery-store";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const SECRET = "test-only-owner-pilot-signing-secret";

function connection(overrides: Partial<MarketplaceProDeliveryConnection> = {}): MarketplaceProDeliveryConnection {
  return {
    id: "connection-a",
    tenantId: "tenant-a",
    brandId: "brand-a",
    sourceAccountId: "account-a",
    profileMode: "ferocity_connected",
    connectionStatus: "connected",
    syncStatus: "ready",
    pilotEnabled: true,
    contractVersion: MARKETPLACEPRO_DELIVERY_VERSION,
    credentialLabel: "owner_pilot_webhook_secret",
    ...overrides,
  };
}

function envelope(overrides: Partial<MarketplaceProDeliveryEnvelope> = {}): MarketplaceProDeliveryEnvelope {
  return {
    version: MARKETPLACEPRO_DELIVERY_VERSION,
    deliveryId: "delivery-0001",
    source: { accountId: "account-a" },
    occurredAt: new Date(NOW - 60_000).toISOString(),
    kind: "event",
    payload: { marketplaceTable: "offers", marketplaceObjectId: "shared-external-id" },
    ...overrides,
  };
}

class MemoryInbox {
  readonly rows = new Map<string, { digest: string; status: "processed" | "failed"; result?: Record<string, unknown> }>();
  readonly domainWrites: Array<Record<string, unknown>> = [];
  private readonly locks = new Map<string, Promise<void>>();

  async execute(
    input: Parameters<MarketplaceProDeliveryDependencies["executeOnce"]>[0],
    apply: () => Promise<Record<string, unknown>>,
  ): Promise<MarketplaceProDeliveryExecution> {
    const key = `${input.connection.id}:${input.envelope.deliveryId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, previous.then(() => current));
    await previous;
    try {
      const existing = this.rows.get(key);
      if (existing?.digest !== undefined && existing.digest !== input.payloadDigest) return { state: "conflict" };
      if (existing?.status === "processed") return { state: "replayed", result: existing.result ?? {} };

      const before = this.domainWrites.map((row) => ({ ...row }));
      try {
        const result = await apply();
        this.rows.set(key, { digest: input.payloadDigest, status: "processed", result });
        return { state: "processed", result };
      } catch {
        this.domainWrites.splice(0, this.domainWrites.length, ...before);
        this.rows.set(key, { digest: input.payloadDigest, status: "failed" });
        return { state: "failed", retryable: true };
      }
    } finally {
      release();
    }
  }
}

function signedRequest(value: MarketplaceProDeliveryEnvelope, options: { secret?: string; timestamp?: number } = {}) {
  const rawBody = JSON.stringify(value);
  const timestamp = String(Math.floor((options.timestamp ?? NOW) / 1000));
  const signature = signMarketplaceProDelivery({
    envelope: value,
    rawBody,
    timestamp,
    secret: options.secret ?? SECRET,
  });
  return {
    rawBody,
    headers: new Headers({
      "x-marketplacepro-timestamp": timestamp,
      "x-marketplacepro-signature": signature,
    }),
    expectedKind: value.kind,
  };
}

function dependencies(input: {
  connections: MarketplaceProDeliveryConnection[];
  inbox: MemoryInbox;
  apply?: MarketplaceProDeliveryDependencies["apply"];
  executeOnce?: MarketplaceProDeliveryDependencies["executeOnce"];
  secrets?: Record<string, string>;
}): MarketplaceProDeliveryDependencies {
  return {
    now: () => NOW,
    findConnections: async (sourceAccountId) => input.connections.filter((row) => row.sourceAccountId === sourceAccountId),
    getSigningCredential: async (selected, label) => {
      const secret = input.secrets
        ? input.secrets[`${selected.id}:${label}`] ?? null
        : SECRET;
      return secret ? {
        id: `credential-${selected.id}`,
        secret,
        updatedAt: "2026-10-22T11:00:00.000Z",
      } : null;
    },
    executeOnce: input.executeOnce ?? ((claim, apply) => input.inbox.execute(claim, apply)),
    apply: input.apply ?? (async (selected, delivery) => {
      const payload = delivery.payload as { marketplaceObjectId?: string };
      input.inbox.domainWrites.push({ tenantId: selected.tenantId, externalId: payload.marketplaceObjectId });
      return { tenantId: selected.tenantId };
    }),
  };
}

describe("MarketplacePro owner-pilot delivery boundary", () => {
  it("isolates two tenants even when their payloads use the same external ID", async () => {
    const inbox = new MemoryInbox();
    const connections = [
      connection(),
      connection({ id: "connection-b", tenantId: "tenant-b", brandId: "brand-b", sourceAccountId: "account-b" }),
    ];
    const deps = dependencies({ connections, inbox });

    const first = await receiveMarketplaceProDelivery(signedRequest(envelope()), deps);
    const secondEnvelope = envelope({ deliveryId: "delivery-0002", source: { accountId: "account-b" } });
    const second = await receiveMarketplaceProDelivery(signedRequest(secondEnvelope), deps);

    expect([first.code, second.code]).toEqual(["processed", "processed"]);
    expect(inbox.domainWrites).toEqual([
      { tenantId: "tenant-a", externalId: "shared-external-id" },
      { tenantId: "tenant-b", externalId: "shared-external-id" },
    ]);
  });

  it("rejects omitted and ambiguous source account identity without choosing a tenant", async () => {
    const inbox = new MemoryInbox();
    const deps = dependencies({
      connections: [connection(), connection({ id: "connection-duplicate", tenantId: "tenant-b" })],
      inbox,
    });
    const omitted = JSON.stringify({
      version: MARKETPLACEPRO_DELIVERY_VERSION,
      deliveryId: "delivery-omitted",
      source: {},
      kind: "event",
      payload: {},
    });

    const omittedResult = await receiveMarketplaceProDelivery(
      { rawBody: omitted, headers: new Headers(), expectedKind: "event" },
      deps,
    );
    const ambiguousResult = await receiveMarketplaceProDelivery(signedRequest(envelope()), deps);

    expect(omittedResult).toMatchObject({ ok: false, status: 400, code: "invalid_envelope" });
    expect(ambiguousResult).toMatchObject({ ok: false, status: 401, code: "authentication_failed" });
    expect(inbox.domainWrites).toHaveLength(0);
  });

  it.each(["sync_paused", "revoked"])("rejects a %s connection", async (state) => {
    const inbox = new MemoryInbox();
    const selected = state === "sync_paused"
      ? connection({ connectionStatus: "sync_paused", syncStatus: "paused" })
      : connection({ connectionStatus: "revoked" });
    const result = await receiveMarketplaceProDelivery(
      signedRequest(envelope()),
      dependencies({ connections: [selected], inbox }),
    );

    expect(result).toMatchObject({ ok: false, status: 409, code: "connection_inactive" });
    expect(inbox.domainWrites).toHaveLength(0);
  });

  it("uses only the credential bound to the resolved connection and label", async () => {
    const inbox = new MemoryInbox();
    const selected = connection();
    const wrongLabel = connection({ credentialLabel: "different-label" });
    const bound = dependencies({
      connections: [selected],
      inbox,
      secrets: { [`${selected.id}:${selected.credentialLabel}`]: SECRET },
    });
    const accepted = await receiveMarketplaceProDelivery(signedRequest(envelope()), bound);
    const rejected = await receiveMarketplaceProDelivery(
      signedRequest(envelope({ deliveryId: "delivery-0002" })),
      dependencies({ connections: [wrongLabel], inbox, secrets: {} }),
    );

    expect(accepted.code).toBe("processed");
    expect(rejected).toMatchObject({ status: 401, code: "authentication_failed" });
  });

  it("keeps unknown and ambiguous account failures indistinguishable before authentication", async () => {
    const inbox = new MemoryInbox();
    const unknownEnvelope = envelope({ source: { accountId: "unknown-account" } });
    const unknown = await receiveMarketplaceProDelivery(
      signedRequest(unknownEnvelope),
      dependencies({ connections: [connection()], inbox }),
    );
    const ambiguous = await receiveMarketplaceProDelivery(
      signedRequest(envelope()),
      dependencies({
        connections: [connection(), connection({ id: "connection-duplicate", tenantId: "tenant-a" })],
        inbox,
      }),
    );

    expect(unknown).toEqual(ambiguous);
    expect(unknown).toMatchObject({ status: 401, code: "authentication_failed" });
  });

  it("fails closed when authorization changes after signature verification", async () => {
    const inbox = new MemoryInbox();
    let applied = false;
    const result = await receiveMarketplaceProDelivery(
      signedRequest(envelope()),
      dependencies({
        connections: [connection()],
        inbox,
        executeOnce: async () => ({ state: "authorization_changed" }),
        apply: async () => {
          applied = true;
          return {};
        },
      }),
    );

    expect(result).toMatchObject({ status: 409, code: "authorization_changed" });
    expect(applied).toBe(false);
  });

  it("treats in-progress claims as non-terminal receipts", async () => {
    const inbox = new MemoryInbox();
    const result = await receiveMarketplaceProDelivery(
      signedRequest(envelope()),
      dependencies({
        connections: [connection()],
        inbox,
        executeOnce: async () => ({ state: "in_progress" }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      status: 202,
      code: "in_progress",
      contractVersion: MARKETPLACEPRO_DELIVERY_VERSION,
      deliveryId: "delivery-0001",
      kind: "event",
      sourceAccountId: "account-a",
    });
    expect(result.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires active trusted enrollment after authenticating the connection", async () => {
    const inbox = new MemoryInbox();
    const result = await receiveMarketplaceProDelivery(
      signedRequest(envelope()),
      dependencies({ connections: [connection({ pilotEnabled: false })], inbox }),
    );
    expect(result).toMatchObject({ status: 403, code: "owner_pilot_disabled" });
    expect(inbox.domainWrites).toHaveLength(0);
  });

  it("rejects invalid and stale signatures", async () => {
    const inbox = new MemoryInbox();
    const deps = dependencies({ connections: [connection()], inbox });
    const invalidRequest = signedRequest(envelope(), { secret: "wrong-secret" });
    invalidRequest.headers.set("x-marketplacepro-token", SECRET);
    const invalid = await receiveMarketplaceProDelivery(invalidRequest, deps);
    const stale = await receiveMarketplaceProDelivery(
      signedRequest(envelope(), { timestamp: NOW - 5 * 60_000 - 1_000 }),
      deps,
    );

    expect(invalid).toMatchObject({ ok: false, status: 401, code: "authentication_failed" });
    expect(stale).toMatchObject({ ok: false, status: 401, code: "stale_signature" });
    expect(inbox.domainWrites).toHaveLength(0);
  });

  it("binds each endpoint to its declared delivery kind", async () => {
    const inbox = new MemoryInbox();
    const request = signedRequest(envelope());
    const result = await receiveMarketplaceProDelivery(
      { ...request, expectedKind: "lead" },
      dependencies({ connections: [connection()], inbox }),
    );
    expect(result).toMatchObject({ status: 400, code: "unexpected_delivery_kind" });
    expect(inbox.domainWrites).toHaveLength(0);
  });

  it("replays a completed delivery without repeating domain work", async () => {
    const inbox = new MemoryInbox();
    const deps = dependencies({ connections: [connection()], inbox });
    const request = signedRequest(envelope());

    const first = await receiveMarketplaceProDelivery(request, deps);
    const replay = await receiveMarketplaceProDelivery(request, deps);

    expect(first.code).toBe("processed");
    expect(replay.code).toBe("replayed");
    expect(inbox.domainWrites).toHaveLength(1);
    expect(first).toMatchObject({
      ok: true,
      status: 200,
      contractVersion: MARKETPLACEPRO_DELIVERY_VERSION,
      deliveryId: "delivery-0001",
      kind: "event",
      sourceAccountId: "account-a",
    });
    expect(first.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(replay).toMatchObject({
      ok: true,
      contractVersion: first.contractVersion,
      deliveryId: first.deliveryId,
      kind: first.kind,
      sourceAccountId: first.sourceAccountId,
      payloadDigest: first.payloadDigest,
    });
  });

  it("keeps the body, occurrence time, and delivery ID immutable while refreshing auth time", () => {
    const value = envelope();
    const first = signedRequest(value, { timestamp: NOW - 30_000 });
    const retry = signedRequest(value, { timestamp: NOW });

    expect(retry.rawBody).toBe(first.rawBody);
    expect(retry.headers.get("x-marketplacepro-signature")).not.toBe(first.headers.get("x-marketplacepro-signature"));
    expect(JSON.parse(retry.rawBody)).toMatchObject({
      deliveryId: value.deliveryId,
      occurredAt: value.occurredAt,
      kind: value.kind,
    });
  });

  it("rejects out-of-window event chronology", async () => {
    const inbox = new MemoryInbox();
    const tooOld = envelope({ occurredAt: new Date(NOW - 91 * 24 * 60 * 60_000).toISOString() });
    const result = await receiveMarketplaceProDelivery(
      signedRequest(tooOld),
      dependencies({ connections: [connection()], inbox }),
    );
    expect(result).toMatchObject({ status: 400, code: "invalid_occurrence_time" });
  });

  it("bounds request bytes and nested metadata", async () => {
    const oversized = new Request("https://example.invalid", {
      method: "POST",
      body: "x".repeat(33),
      headers: { "content-type": "application/json" },
    });
    const body = await readBoundedMarketplaceProBody(oversized, 32);
    expect(body).toMatchObject({ status: 413, code: "payload_too_large" });

    const deep = { value: "end" } as Record<string, unknown>;
    let nested = deep;
    for (let index = 0; index < 7; index += 1) nested = { nested };
    const parsed = marketplaceProEventSchema.safeParse({
      marketplaceTable: "offers",
      marketplaceObjectId: "object-a",
      payload: nested,
    });
    expect(parsed.success).toBe(false);
  });

  it("serializes concurrent copies of one delivery", async () => {
    const inbox = new MemoryInbox();
    let applies = 0;
    const deps = dependencies({
      connections: [connection()],
      inbox,
      apply: async (selected) => {
        applies += 1;
        await Promise.resolve();
        inbox.domainWrites.push({ tenantId: selected.tenantId });
        return { accepted: true };
      },
    });
    const request = signedRequest(envelope());

    const results = await Promise.all([
      receiveMarketplaceProDelivery(request, deps),
      receiveMarketplaceProDelivery(request, deps),
    ]);

    expect(results.map((row) => row.code).sort()).toEqual(["processed", "replayed"]);
    expect(applies).toBe(1);
    expect(inbox.domainWrites).toHaveLength(1);
  });

  it("rolls back partial work and retries the same delivery ID", async () => {
    const inbox = new MemoryInbox();
    let attempt = 0;
    const deps = dependencies({
      connections: [connection()],
      inbox,
      apply: async (selected) => {
        attempt += 1;
        inbox.domainWrites.push({ tenantId: selected.tenantId, attempt });
        if (attempt === 1) throw new Error("simulated partial failure");
        return { accepted: true };
      },
    });
    const request = signedRequest(envelope());

    const failed = await receiveMarketplaceProDelivery(request, deps);
    expect(failed).toMatchObject({ ok: false, status: 500, code: "delivery_failed" });
    expect(inbox.domainWrites).toHaveLength(0);

    const retried = await receiveMarketplaceProDelivery(request, deps);
    expect(retried.code).toBe("processed");
    expect(inbox.domainWrites).toEqual([{ tenantId: "tenant-a", attempt: 2 }]);
  });

  it("scopes lead-status lookup by the resolved tenant and connection", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const query = (async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("from public.marketplacepro_lead_links") && text.includes("select tenant_id")) {
        return {
          rows: [{ tenant_id: "tenant-a", brand_id: "brand-a", connection_id: "connection-a", lead_id: "lead-a" }],
        };
      }
      return { rows: [] };
    }) as MarketplaceProQuery;

    const result = await updateMarketplaceProLeadStatus(
      { marketplaceLeadId: "shared-external-id", status: "booked", metadata: {} },
      { connection: connection(), query },
    );

    expect(result).toMatchObject({ ok: true, updated: true, leadId: "lead-a" });
    expect(calls[0].text).toContain("where tenant_id = $1");
    expect(calls[0].text).toContain("and connection_id = $2");
    expect(calls[0].values).toEqual(["tenant-a", "connection-a", "shared-external-id"]);
  });
});

describe("MarketplacePro legacy compatibility boundary", () => {
  function legacyRequest(payload: Record<string, unknown>, token = SECRET) {
    return new Request("https://example.invalid/api/integrations/marketplacepro/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-marketplacepro-token": token },
      body: JSON.stringify(payload),
    }) as unknown as NextRequest;
  }

  function legacyDependencies(connections: MarketplaceProDeliveryConnection[]) {
    return {
      prepare: async (request: NextRequest) => ({ ok: true as const, rawBody: await request.text() }),
      findConnections: async (accountId: string) => connections.filter((row) => row.sourceAccountId === accountId),
      execute: async () => ({ ok: true as const, result: { accepted: true, status: 200 } }),
      primarySecret: SECRET,
      previousSecret: null,
      now: () => new Date(NOW),
    };
  }

  it("preserves token-authenticated legacy delivery only with one exact active account mapping", async () => {
    const payload = {
      marketplaceTable: "offers",
      marketplaceObjectId: "legacy-object",
      marketplaceAccountId: "account-a",
    };
    const accepted = await receiveMarketplaceProLegacyDelivery(
      legacyRequest(payload),
      "event",
      legacyDependencies([connection()]),
    );
    const ambiguous = await receiveMarketplaceProLegacyDelivery(
      legacyRequest(payload),
      "event",
      legacyDependencies([connection(), connection({ id: "connection-duplicate" })]),
    );
    const revoked = await receiveMarketplaceProLegacyDelivery(
      legacyRequest(payload),
      "event",
      legacyDependencies([connection({ connectionStatus: "revoked" })]),
    );

    expect(accepted).toMatchObject({ ok: true, status: 200, accepted: true });
    expect(ambiguous).toMatchObject({ status: 409, code: "connection_unavailable" });
    expect(revoked).toMatchObject({ status: 409, code: "connection_unavailable" });
  });

  it("requires account identity and never treats a v1-shaped token as legacy authorization", async () => {
    const missingAccount = await receiveMarketplaceProLegacyDelivery(
      legacyRequest({ marketplaceTable: "offers", marketplaceObjectId: "legacy-object" }),
      "event",
      legacyDependencies([connection()]),
    );
    const invalidToken = await receiveMarketplaceProLegacyDelivery(
      legacyRequest({
        marketplaceTable: "offers",
        marketplaceObjectId: "legacy-object",
        marketplaceAccountId: "account-a",
      }, "v1=not-the-shared-token"),
      "event",
      legacyDependencies([connection()]),
    );

    expect(missingAccount).toMatchObject({ status: 400, code: "invalid_payload" });
    expect(invalidToken).toMatchObject({ status: 401, code: "authentication_failed" });
  });
});
