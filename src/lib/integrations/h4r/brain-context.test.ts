import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), capture: vi.fn(),
  env: { H4R_CONTEXT_URL: "https://h4r.example.test/functions/v1/ferocity-brain-context", H4R_SMS_BRIDGE_SECRET: "a-secret-that-is-definitely-long-enough" },
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("./goal-observation", () => ({ captureH4rGoalObservation: mocks.capture }));

import { getLatestCompanionContextSummaryForAi, h4rBrainContextSchema, syncH4rBrainContextForTenant } from "./brain-context";

const context = {
  ok: true, mode: "read_only", schema_version: 1, product_key: "h4r",
  workspace_id: "11111111-1111-4111-8111-111111111111", generated_at: "2026-10-07T16:00:00+00:00",
  metrics: {
    activeProperties: 4, activeUnits: 12, activeTenants: 9, trackedLeases: 9, leasesNotFullySigned: 1,
    outstandingBalanceCents: 250000, pastDueUnits: 2, openCollectionCases: 1, collectionBalanceCents: 125000,
    openOwnerNotifications: 3, urgentOwnerNotifications: 1, activeDocuments: 18, providerIssues: 0,
  },
  domain_state: { portfolio: { activeProperties: 4 }, collections: { openCases: 1 } },
  authority_map: { payments: { authoritative: true } },
  capabilities: { aggregateContext: "read_ready", paymentLedgerMutation: "authoritative_h4r_only" },
  blind_spots: ["No tenant PII is included."],
} as const;

function hashFor(value: typeof context) {
  return crypto.createHash("sha256").update(JSON.stringify({
    schemaVersion: value.schema_version, workspaceId: value.workspace_id, metrics: value.metrics,
    domainState: value.domain_state, capabilities: value.capabilities, blindSpots: value.blind_spots,
  })).digest("hex");
}

describe("H4R brain context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReset();
    mocks.capture.mockResolvedValue({ captured: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(context), { status: 200, headers: { "content-type": "application/json" } })));
  });

  it("accepts only versioned, aggregate, read-only context", () => {
    expect(h4rBrainContextSchema.parse(context).mode).toBe("read_only");
    expect(h4rBrainContextSchema.safeParse({ ...context, mode: "execute" }).success).toBe(false);
    expect(h4rBrainContextSchema.safeParse({ ...context, metrics: { ...context.metrics, activeUnits: -1 } }).success).toBe(false);
  });

  it("captures a changed snapshot and routes material domains into existing H4R goals", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ h4r_workspace_id: context.workspace_id }] })
      .mockResolvedValueOnce({ rows: [{ source_hash: "0".repeat(64) }] })
      .mockResolvedValueOnce({ rows: [{ id: "22222222-2222-4222-8222-222222222222" }] });
    const result = await syncH4rBrainContextForTenant("33333333-3333-4333-8333-333333333333");
    expect(result).toMatchObject({ configured: true, mappingsChecked: 1, captured: 1, reused: 0, failed: 0, goalsObserved: 3 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("ferocity-brain-context"), expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ "x-h4r-signature": expect.stringMatching(/^sha256=/) }),
    }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "context.collections.attention", moneyCents: 250000,
      ownerAttention: false, status: "open",
      metadata: expect.objectContaining({ authoritativeSystem: "h4r", contextDomain: "collections" }),
    }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "context.owner_attention.attention", ownerAttention: true, status: "needs_owner",
    }));
  });

  it("does not store or re-observe an unchanged consecutive snapshot", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ h4r_workspace_id: context.workspace_id }] })
      .mockResolvedValueOnce({ rows: [{ source_hash: hashFor(context) }] });
    await expect(syncH4rBrainContextForTenant("33333333-3333-4333-8333-333333333333")).resolves.toMatchObject({ captured: 0, reused: 1, goalsObserved: 0 });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("isolates invalid provider context without copying partial records", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ h4r_workspace_id: context.workspace_id }] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...context, mode: "execute" }), { status: 200 }));
    await expect(syncH4rBrainContextForTenant("33333333-3333-4333-8333-333333333333")).resolves.toMatchObject({ failed: 1, captured: 0 });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("rejects oversized context responses before parsing or storing them", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ h4r_workspace_id: context.workspace_id }] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("x".repeat(262_145), { status: 200 }));
    await expect(syncH4rBrainContextForTenant("33333333-3333-4333-8333-333333333333"))
      .resolves.toMatchObject({ failed: 1, captured: 0, goalsObserved: 0 });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("gives Ask Ferocity aggregate context plus an explicit H4R authority boundary", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      product_key: "h4r", external_workspace_id: context.workspace_id,
      source_generated_at: new Date(context.generated_at), metrics_json: context.metrics,
      capabilities_json: context.capabilities, blind_spots_json: context.blind_spots,
    }] });
    const summary = await getLatestCompanionContextSummaryForAi("33333333-3333-4333-8333-333333333333");
    expect(summary).toContain("Homes4Rent authoritative context");
    expect(summary).toContain("H4R owns every underlying record");
    expect(summary).toContain("2 past-due units");
    expect(summary).not.toContain("tenant_name");
  });
});
