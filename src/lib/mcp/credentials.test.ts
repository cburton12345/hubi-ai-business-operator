import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: mocks.query,
  withPostgresTransactionResult: mocks.transaction,
}));

import { authenticateExternalAiBearer, createExternalAiCredential } from "@/lib/mcp/credentials";
import { EXTERNAL_AI_CONSENT_VERSION } from "@/lib/mcp/consent-policy";

describe("external AI bearer authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed tokens without touching the database", async () => {
    expect(await authenticateExternalAiBearer({ authorizationHeader: null })).toBeNull();
    expect(await authenticateExternalAiBearer({ authorizationHeader: "Basic abc" })).toBeNull();
    expect(await authenticateExternalAiBearer({ authorizationHeader: "Bearer short" })).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns a tenant-bound external principal from an active stored grant", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: "10000000-0000-4000-8000-000000000001",
        tenant_id: "20000000-0000-4000-8000-000000000002",
        authorized_user_id: "30000000-0000-4000-8000-000000000003",
        provider_key: "muse",
        label: "Muse",
        scopes: ["business:read"],
        daily_request_limit: 500,
        daily_record_limit: 2500,
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await authenticateExternalAiBearer({
      authorizationHeader: `Bearer fer_mcp_${"a".repeat(43)}`,
      userAgent: "Muse test client",
    });
    expect(result).toMatchObject({
      tenantId: "20000000-0000-4000-8000-000000000002",
      scopes: ["business:read"],
      dailyRequestLimit: 500,
      dailyRecordLimit: 2500,
      principal: {
        principalType: "external_agent",
        tenantId: "20000000-0000-4000-8000-000000000002",
        authorization: { source: "stored_agent_grant", verified: true },
      },
    });
    const lookupValues = mocks.query.mock.calls[0][1] as string[];
    expect(lookupValues[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(lookupValues[0]).not.toContain("fer_mcp_");
  });

  it("rejects revoked, expired, inactive-tenant, and removed-user credentials", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const result = await authenticateExternalAiBearer({ authorizationHeader: `Bearer fer_mcp_${"b".repeat(43)}` });
    expect(result).toBeNull();
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("credential.status='active'");
    expect(sql).toContain("credential.expires_at>now()");
    expect(sql).toContain("tenant.status in ('active','trial')");
    expect(sql).toContain("membership.status='active'");
  });

  it("refuses to create a new external credential without explicit consent", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] }) };
    mocks.transaction.mockImplementation(async (operation: (value: typeof client) => Promise<unknown>) => {
      try {
        return { ok: true, value: await operation(client) };
      } catch (error) {
        return { ok: false, error };
      }
    });
    await expect(createExternalAiCredential({
      tenantId: "20000000-0000-4000-8000-000000000002",
      authorizedUserId: "30000000-0000-4000-8000-000000000003",
      actorUserId: "30000000-0000-4000-8000-000000000003",
      label: "Unapproved assistant",
      scopes: ["business:read"],
    })).rejects.toThrow("Explicit external AI data-sharing consent is required");
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("persists the versioned consent receipt when creating a credential", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] })
      .mockResolvedValueOnce({ rows: [] }) };
    mocks.transaction.mockImplementation(async (operation: (value: typeof client) => Promise<unknown>) => ({ ok: true, value: await operation(client) }));
    const created = await createExternalAiCredential({
      tenantId: "20000000-0000-4000-8000-000000000002",
      authorizedUserId: "30000000-0000-4000-8000-000000000003",
      actorUserId: "30000000-0000-4000-8000-000000000003",
      label: "Approved assistant",
      scopes: ["business:read"],
      consentAcknowledged: true,
    });
    expect(created.token).toMatch(/^fer_mcp_/);
    expect(String(client.query.mock.calls[2][0])).toContain("consent_version,consented_at,consent_summary");
    expect(client.query.mock.calls[2][1]).toContain(EXTERNAL_AI_CONSENT_VERSION);
  });

  it("inherits the original consent receipt during same-scope rotation", async () => {
    const consentedAt = "2026-10-14T20:00:00.000Z";
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ id: "10000000-0000-4000-8000-000000000001", consent_version: "v-original", consented_at: consentedAt, consent_summary: "Original scope consent" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) };
    mocks.transaction.mockImplementation(async (operation: (value: typeof client) => Promise<unknown>) => ({ ok: true, value: await operation(client) }));
    await createExternalAiCredential({
      tenantId: "20000000-0000-4000-8000-000000000002",
      authorizedUserId: "30000000-0000-4000-8000-000000000003",
      actorUserId: "30000000-0000-4000-8000-000000000003",
      label: "Rotated assistant",
      scopes: ["business:read"],
      rotatedFromId: "10000000-0000-4000-8000-000000000001",
    });
    const insertValues = client.query.mock.calls[3][1] as unknown[];
    expect(insertValues).toContain("v-original");
    expect(insertValues).toContain(consentedAt);
    expect(insertValues).toContain("Original scope consent");
  });
});
