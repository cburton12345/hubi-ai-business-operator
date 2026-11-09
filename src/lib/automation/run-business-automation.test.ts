import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgres, getServiceGate } = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  getServiceGate: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));
vi.mock("@/lib/controls/service-gates", () => ({ getServiceGate }));

import { generateTenantDailyBrief, runBusinessAutomationLoop } from "@/lib/automation/run-business-automation";

describe("scheduled daily owner brief", () => {
  beforeEach(() => {
    queryPostgres.mockReset();
    getServiceGate.mockReset();
  });

  it("refreshes the brief on consecutive scheduled passes so changed business data is reflected", async () => {
    getServiceGate.mockResolvedValue({ enabled: true, mode: "included" });
    queryPostgres.mockResolvedValue({ rows: [{}] });

    await expect(generateTenantDailyBrief("tenant-1")).resolves.toMatchObject({
      tenantId: "tenant-1",
      status: "ready",
    });
    await expect(generateTenantDailyBrief("tenant-1")).resolves.toMatchObject({
      tenantId: "tenant-1",
      status: "ready",
    });

    expect(getServiceGate).toHaveBeenCalledTimes(2);
    const sqlCalls = queryPostgres.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.filter((sql) => sql.includes("from public.leads"))).toHaveLength(2);
    expect(sqlCalls.filter((sql) => sql.includes("insert into public.owner_daily_briefings"))).toHaveLength(2);
    expect(sqlCalls.filter((sql) => sql.includes("insert into public.owner_command_events"))).toHaveLength(2);
  });

  it("fails closed before global work when tenant discovery is unavailable", async () => {
    queryPostgres.mockImplementation(async (sql: string, values: unknown[] = []) => {
      const statement = String(sql);
      if (statement.includes("insert into public.platform_runtime_leases")) {
        return { rows: [{ holder_id: values[0] }] };
      }
      if (statement.includes("from public.tenants t")) return null;
      if (statement.includes("delete from public.platform_runtime_leases")) return { rows: [] };
      throw new Error(`Unexpected query after tenant discovery failure: ${statement.slice(0, 80)}`);
    });

    await expect(runBusinessAutomationLoop()).resolves.toMatchObject({
      ok: true,
      skipped: true,
      skipReason: "tenant_discovery_unavailable",
    });
    expect(queryPostgres).toHaveBeenCalledTimes(3);
  });
});
