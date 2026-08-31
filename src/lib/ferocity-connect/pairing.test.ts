import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, withPostgresTransactionMock } = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  withPostgresTransactionMock: vi.fn()
}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock, withPostgresTransaction: withPostgresTransactionMock }));
import { pairConnectDevice } from "./pairing";

describe("Ferocity Connect pairing", () => {
  beforeEach(() => { queryPostgresMock.mockReset(); withPostgresTransactionMock.mockReset(); });

  it("activates a device only when pairing discovers an available SIM", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = { query: vi.fn((sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("select p.id")) return Promise.resolve({ rows: [{ id: "pair", tenant_id: "tenant", display_name_hint: null }] });
      if (sql.includes("insert into public.ferocity_connect_devices")) return Promise.resolve({ rows: [{ id: "device" }] });
      if (sql.includes("insert into public.ferocity_connect_device_credentials")) return Promise.resolve({ rows: [{ id: "credential", expires_at: "2026-09-26T00:00:00Z" }] });
      return Promise.resolve({ rows: [] });
    }) };
    withPostgresTransactionMock.mockImplementation((operation: (database: typeof client) => unknown) => operation(client));

    const result = await pairConnectDevice({
      pairingToken: "fcp_test", displayName: "Phone", installationFingerprint: "fingerprint-value",
      appVersion: "1.0.0", androidVersion: "16", sims: [{ subscriptionId: 2, carrierName: "Carrier" }]
    });

    expect(result).toMatchObject({ tenantId: "tenant", deviceId: "device" });
    const deviceInsert = queries.find(({ sql }) => sql.includes("insert into public.ferocity_connect_devices"));
    expect(deviceInsert?.values).toContain("active");
    const accountUpdate = queries.find(({ sql }) => sql.includes("update public.tenant_messaging_accounts"));
    expect(accountUpdate?.values).toEqual(["tenant", "device", "active", true]);
  });

  it("leaves a SIM-less phone paired but unable to send", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = { query: vi.fn((sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("select p.id")) return Promise.resolve({ rows: [{ id: "pair", tenant_id: "tenant", display_name_hint: null }] });
      if (sql.includes("insert into public.ferocity_connect_devices")) return Promise.resolve({ rows: [{ id: "device" }] });
      if (sql.includes("insert into public.ferocity_connect_device_credentials")) return Promise.resolve({ rows: [{ id: "credential", expires_at: "2026-09-26T00:00:00Z" }] });
      return Promise.resolve({ rows: [] });
    }) };
    withPostgresTransactionMock.mockImplementation((operation: (database: typeof client) => unknown) => operation(client));

    await pairConnectDevice({ pairingToken: "fcp_test", displayName: "Phone", installationFingerprint: "fingerprint-value", appVersion: "1.0.0", androidVersion: "16", sims: [] });
    const accountUpdate = queries.find(({ sql }) => sql.includes("update public.tenant_messaging_accounts"));
    expect(accountUpdate?.values).toEqual(["tenant", "device", "configured", false]);
  });

  it("refuses an additional device when no add-on is active", async () => {
    const client = { query: vi.fn((sql: string) => {
      if (sql.includes("select p.id")) return Promise.resolve({ rows: [{ id: "pair", tenant_id: "tenant", display_name_hint: null }] });
      if (sql.includes("allowed_devices")) return Promise.resolve({ rows: [{ allowed_devices: 1, active_devices: 1 }] });
      return Promise.resolve({ rows: [] });
    }) };
    withPostgresTransactionMock.mockImplementation((operation: (database: typeof client) => unknown) => operation(client));

    await expect(pairConnectDevice({ pairingToken: "fcp_test", displayName: "Second phone", installationFingerprint: "fingerprint-value", appVersion: "1.0.0", androidVersion: "16", sims: [] }))
      .rejects.toThrow("FEROCITY_CONNECT_DEVICE_LIMIT_REACHED");
  });
});
