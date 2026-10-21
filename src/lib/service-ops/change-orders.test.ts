import { beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/postgres", () => ({ withPostgresTransactionResult: transactionMock }));

import { decideChangeOrder, sendChangeOrderForCustomer } from "@/lib/service-ops/change-orders";

type QueryRecord = { sql: string; values: unknown[] | undefined };

function clientWith(changeStatus = "sent_manually") {
  const queries: QueryRecord[] = [];
  const query = vi.fn(async (sqlValue: string, values?: unknown[]) => {
    const sql = sqlValue.replace(/\s+/g, " ").trim();
    queries.push({ sql, values });
    if (sql.includes("from public.estimate_share_links s") && sql.includes("for update of s")) {
      return { rows: [{ tenant_id: "tenant-1", estimate_id: "estimate-1", customer_id: "customer-1", brand_id: "brand-1" }] };
    }
    if (sql.includes("from public.estimate_change_orders") && sql.includes("for update")) {
      return {
        rows: [{
          id: "change-1",
          tenant_id: "tenant-1",
          estimate_id: "estimate-1",
          title: "Hidden framing",
          description: "Replace damaged framing.",
          amount_cents: 150000,
          estimated_cost_cents: 70000,
          schedule_impact_minutes: 240,
          status: changeStatus,
          applied_at: changeStatus === "approved" ? new Date() : null
        }]
      };
    }
    if (sql.startsWith("select id from public.service_jobs")) return { rows: [{ id: "job-1" }] };
    if (sql.startsWith("select id from public.service_invoices")) return { rows: [{ id: "invoice-1" }] };
    if (sql.startsWith("insert into public.invoice_line_items")) return { rows: [{ id: "line-1" }] };
    if (sql.startsWith("select id from public.service_work_orders")) return { rows: [{ id: "work-order-1" }] };
    return { rows: [] };
  });
  return { client: { query } as unknown as pg.PoolClient, queries };
}

describe("change-order lifecycle", () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  function runInTransaction(client: pg.PoolClient) {
    transactionMock.mockImplementation(async (...args: unknown[]) => {
      const operation = args.find((value): value is (db: pg.PoolClient) => Promise<unknown> => typeof value === "function");
      if (!operation) throw new Error("Missing transaction callback");
      return { ok: true, value: await operation(client) };
    });
  }

  it("applies an approved change to schedule and an editable invoice exactly once", async () => {
    const { client, queries } = clientWith();
    runInTransaction(client);

    const result = await decideChangeOrder({
      publicToken: "public-token-123",
      changeOrderId: "change-1",
      decision: "approved",
      decidedByName: "Customer Name",
      decidedByEmail: "customer@example.com",
      decisionNote: "Proceed.",
      ipAddress: "127.0.0.1",
      userAgent: "test"
    });

    expect(result).toMatchObject({ status: "approved", jobId: "job-1", invoiceId: "invoice-1" });
    expect(queries.filter(({ sql }) => sql.startsWith("update public.service_jobs"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.startsWith("update public.service_work_orders"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.startsWith("with target as"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.startsWith("insert into public.invoice_line_items"))).toHaveLength(1);
    expect(queries.find(({ sql }) => sql.startsWith("select id from public.service_invoices"))?.sql).toContain("status='draft'");
    expect(queries.filter(({ sql }) => sql.startsWith("update public.service_invoices"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.startsWith("update public.estimate_change_orders"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.startsWith("insert into public.service_operating_events"))).toHaveLength(1);
    const decisionUpdate = queries.find(({ sql }) => sql.startsWith("update public.estimate_change_orders"));
    expect(decisionUpdate?.values?.[9]).toMatch(/^[0-9a-f]{64}$/);
    expect(queries.some(({ sql }) => sql.includes("operations_expenses"))).toBe(false);
  });

  it("records a rejection without changing schedule, invoices, or job cost", async () => {
    const { client, queries } = clientWith();
    runInTransaction(client);

    const result = await decideChangeOrder({
      publicToken: "public-token-123",
      changeOrderId: "change-1",
      decision: "rejected",
      decidedByName: "Customer Name",
      decidedByEmail: "customer@example.com",
      decisionNote: "Do not proceed.",
      ipAddress: null,
      userAgent: "test"
    });

    expect(result.status).toBe("rejected");
    expect(queries.some(({ sql }) => sql.startsWith("update public.service_jobs"))).toBe(false);
    expect(queries.some(({ sql }) => sql.startsWith("insert into public.invoice_line_items"))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes("operations_expenses"))).toBe(false);
    expect(queries.filter(({ sql }) => sql.startsWith("insert into public.service_operating_events"))).toHaveLength(1);
  });

  it("does not repeat propagation after the decision has already been recorded", async () => {
    const { client, queries } = clientWith("approved");
    runInTransaction(client);

    const result = await decideChangeOrder({
      publicToken: "public-token-123",
      changeOrderId: "change-1",
      decision: "approved",
      decidedByName: "Customer Name",
      decidedByEmail: null,
      decisionNote: null,
      ipAddress: null,
      userAgent: null
    });

    expect(result.status).toBe("already_decided");
    expect(queries.some(({ sql }) => sql.startsWith("update public.service_jobs"))).toBe(false);
    expect(queries.some(({ sql }) => sql.startsWith("insert into public.invoice_line_items"))).toBe(false);
    expect(queries.some(({ sql }) => sql.startsWith("insert into public.service_operating_events"))).toBe(false);
  });

  it("does not make a change order public without a current estimate link", async () => {
    const { client, queries } = clientWith("draft");
    const query = vi.mocked(client.query);
    query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue).replace(/\s+/g, " ").trim();
      queries.push({ sql, values: undefined });
      if (sql.includes("from public.estimate_change_orders") && sql.includes("for update")) {
        return { rows: [{
          id: "change-1", tenant_id: "tenant-1", estimate_id: "estimate-1", title: "Change",
          description: null, amount_cents: 100, estimated_cost_cents: 0,
          schedule_impact_minutes: 0, status: "draft", applied_at: null
        }], rowCount: 1, command: "SELECT", oid: 0, fields: [] } as never;
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] } as never;
    });
    runInTransaction(client);

    const result = await sendChangeOrderForCustomer({ tenantId: "tenant-1", changeOrderId: "change-1" });
    expect(result.status).toBe("not_ready");
    expect(queries.some(({ sql }) => sql.includes("set status='sent_manually'"))).toBe(false);
  });
});
