import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  queryPostgresRequired: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  queryPostgres: mocks.queryPostgres,
  queryPostgresRequired: mocks.queryPostgresRequired
}));
vi.mock("server-only", () => ({}));

import { getWorkspaceAbuseControlSnapshot, reserveWorkspaceAbuseCapacity } from "./workspace-abuse-control";

describe("workspace abuse controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed when the atomic reservation is unavailable", async () => {
    mocks.queryPostgres.mockResolvedValue(null);
    await expect(reserveWorkspaceAbuseCapacity({
      tenantId: "00000000-0000-0000-0000-000000000001",
      surface: "public_chat_ai"
    })).resolves.toEqual({
      allowed: false,
      reason: "Workspace safety controls are unavailable; this request was blocked safely.",
      unavailable: true
    });
  });

  it("returns the database decision without accepting requester data", async () => {
    mocks.queryPostgres.mockResolvedValue({ rows: [{
      allowed: false,
      reason: "The workspace hourly safety budget was reached.",
      hourly_count: 120,
      hourly_limit: 120,
      daily_count: 200,
      daily_limit: 1000,
      tripped_until: "2026-11-22T20:00:00.000Z"
    }] });
    const result = await reserveWorkspaceAbuseCapacity({
      tenantId: "00000000-0000-0000-0000-000000000001",
      surface: "public_lead_intake"
    });
    expect(result.allowed).toBe(false);
    expect(mocks.queryPostgres.mock.calls[0][1]).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "public_lead_intake",
      1
    ]);
  });

  it("keeps owner telemetry tenant-scoped and aggregate-only", async () => {
    mocks.queryPostgresRequired.mockResolvedValue({ rows: [] });
    await getWorkspaceAbuseControlSnapshot("00000000-0000-0000-0000-000000000001");
    const [sql, values] = mocks.queryPostgresRequired.mock.calls[0];
    expect(sql).toContain("where c.tenant_id = $1");
    expect(sql).toContain("sum(r.event_count)");
    expect(sql).not.toContain("ip_address");
    expect(sql).not.toContain("requester_email");
    expect(values).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });
});

