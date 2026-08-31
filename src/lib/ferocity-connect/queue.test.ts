import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock, withPostgresTransactionMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn(), withPostgresTransactionMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock, withPostgresTransaction: withPostgresTransactionMock }));
import { claimNextConnectJob, enqueueConnectSms } from "./queue";

describe("Ferocity Connect queue adapter", () => {
  beforeEach(() => { queryPostgresMock.mockReset(); withPostgresTransactionMock.mockReset(); });
  it("requires an idempotency key", async () => {
    expect(await enqueueConnectSms({ tenantId: "tenant", channel: "sms", to: "+17155550199", body: "Hello" })).toMatchObject({ ok: false, status: 400 });
  });
  it("queues a text job and returns its durable id", async () => {
    queryPostgresMock.mockResolvedValue({ rows: [{ id: "754468bb-2fc6-4403-a650-1e7a51d85443" }] });
    const result = await enqueueConnectSms({ tenantId: "tenant", channel: "sms", to: "+17155550199", body: "Hello", idempotencyKey: "message-1" });
    expect(result).toMatchObject({ ok: true, providerKey: "ferocity_connect", providerMessageId: "754468bb-2fc6-4403-a650-1e7a51d85443", status: "queued" });
    const [sql, values] = queryPostgresMock.mock.calls[0];
    expect(String(sql)).toContain("$5::jsonb->>'deviceId'");
    expect(String(sql)).toContain("$5::jsonb->>'simSubscriptionId'");
    expect(values[4]).toBe("{}");
  });
  it("refuses media rather than silently dropping it", async () => {
    const result = await enqueueConnectSms({ tenantId: "tenant", channel: "mms", to: "+17155550199", body: "Photo", idempotencyKey: "message-2", attachments: [{ url: "https://example.com/photo.jpg" }] });
    expect(result).toMatchObject({ ok: false, status: 400, retryable: false });
  });
  it("does not enter the queue transaction when the service or device is paused", async () => {
    expect(await claimNextConnectJob({ tenantId: "tenant-a", deviceId: "device-a", sendingEnabled: false, deviceStatus: "active" })).toBeNull();
    expect(await claimNextConnectJob({ tenantId: "tenant-a", deviceId: "device-a", sendingEnabled: true, deviceStatus: "paused" })).toBeNull();
    expect(withPostgresTransactionMock).not.toHaveBeenCalled();
  });
  it("claims with server-derived tenant and device constraints", async () => {
    const clientQuery = vi.fn((sql: string, _values?: unknown[]) => {
      if (sql.includes("select max_per_minute")) return Promise.resolve({ rows: [{ max_per_minute: 6, max_per_hour: 100, max_per_day: 500 }] });
      if (sql.includes("minute_count")) return Promise.resolve({ rows: [{ minute_count: "0", hour_count: "0", day_count: "0" }] });
      if (sql.includes("with candidate")) return Promise.resolve({ rows: [{ id: "job-a", recipient: "+17155550199", body: "Hello", sim_subscription_id: 1, attempt_count: 1, idempotency_key: "send-a" }] });
      return Promise.resolve({ rows: [] });
    });
    const client = { query: clientQuery };
    withPostgresTransactionMock.mockImplementation((operation: (database: { query: typeof clientQuery }) => unknown) => operation(client));
    const job = await claimNextConnectJob({ tenantId: "tenant-a", deviceId: "device-a", sendingEnabled: true, deviceStatus: "active" });
    expect(job).toMatchObject({ id: "job-a" });
    const claimCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("with candidate"));
    expect(claimCall?.[1]).toEqual(["tenant-a", "device-a"]);
  });
});
