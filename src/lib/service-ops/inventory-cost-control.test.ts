import { beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

const state = vi.hoisted(() => ({ client: null as pg.PoolClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/postgres", () => ({
  withPostgresTransactionResult: async (operation: (client: pg.PoolClient) => Promise<unknown>) => ({
    ok: true,
    value: await operation(state.client as pg.PoolClient)
  })
}));

import { allocateConsumedMaterial, cancelMaterialAllocation, confirmSupplierReturnCredit, recordSupplierReturn } from "@/lib/service-ops/inventory-cost-control";

function setup(handler: (sql: string) => { rows: unknown[] }) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push(sql);
      return handler(sql);
    })
  } as unknown as pg.PoolClient;
  state.client = client;
  return queries;
}

describe("inventory cost and supplier-return control", () => {
  beforeEach(() => { state.client = null; });

  it("records a bounded supplier return and removes stock exactly once", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.supplier_returns")) return { rows: [] };
      if (sql.includes("from public.purchase_order_receipt_items ri")) return { rows: [{ receipt_item_id: "ri", receipt_id: "receipt", purchase_order_id: "po", supplier_id: "supplier", inventory_item_id: "item", unit_cost_cents: 250, inventory_unit_cost_cents: 250, total_quantity: "9", received: "10", returned: "2", on_hand: "9", reserved: "1" }] };
      if (sql.startsWith("insert into public.supplier_returns")) return { rows: [{ id: "return" }] };
      if (sql.startsWith("update public.service_inventory_items")) return { rows: [{ id: "item" }] };
      return { rows: [] };
    });
    const result = await recordSupplierReturn({ tenantId: "tenant", receiptItemId: "ri", locationId: "location", quantity: 8, reason: "Wrong material", idempotencyKey: "key" });
    expect(result).toEqual({ status: "applied", recordId: "return" });
    expect(queries.some((sql) => sql.startsWith("update public.inventory_location_balances"))).toBe(true);
    expect(queries.some((sql) => sql.includes("'return',$6*-1"))).toBe(true);
  });

  it("blocks returns above the unreturned received quantity", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.supplier_returns")) return { rows: [] };
      if (sql.includes("from public.purchase_order_receipt_items ri")) return { rows: [{ receipt_item_id: "ri", receipt_id: "receipt", purchase_order_id: "po", supplier_id: null, inventory_item_id: "item", unit_cost_cents: 100, inventory_unit_cost_cents: 100, total_quantity: "10", received: "5", returned: "2", on_hand: "10", reserved: "0" }] };
      return { rows: [] };
    });
    const result = await recordSupplierReturn({ tenantId: "tenant", receiptItemId: "ri", locationId: "location", quantity: 4, reason: "Return", idempotencyKey: "key" });
    expect(result.status).toBe("insufficient");
    expect(queries.some((sql) => sql.startsWith("insert into public.supplier_returns"))).toBe(false);
  });

  it("blocks supplier returns that would consume stock reserved for work", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.supplier_returns")) return { rows: [] };
      if (sql.includes("from public.purchase_order_receipt_items ri")) return { rows: [{ receipt_item_id: "ri", receipt_id: "receipt", purchase_order_id: "po", supplier_id: null, inventory_item_id: "item", unit_cost_cents: 100, inventory_unit_cost_cents: 100, total_quantity: "8", received: "10", returned: "0", on_hand: "8", reserved: "5" }] };
      return { rows: [] };
    });
    const result = await recordSupplierReturn({ tenantId: "tenant", receiptItemId: "ri", locationId: "location", quantity: 4, reason: "Return", idempotencyKey: "key" });
    expect(result.status).toBe("insufficient");
    expect(queries.some((sql) => sql.startsWith("update public.inventory_location_balances"))).toBe(false);
  });

  it("records vendor credit evidence without creating cash or ledger activity", async () => {
    const queries = setup((sql) => {
      if (sql.includes("credit_idempotency_key=$2")) return { rows: [] };
      if (sql.startsWith("update public.supplier_returns")) return { rows: [{ id: "return" }] };
      return { rows: [] };
    });
    const result = await confirmSupplierReturnCredit({ tenantId: "tenant", supplierReturnId: "return", disposition: "confirmed", amountCents: 1250, reference: "VC-12", idempotencyKey: "credit-key" });
    expect(result.status).toBe("applied");
    expect(queries.every((sql) => !sql.includes("service_invoice_payments") && !sql.includes("accounting_ledger"))).toBe(true);
  });

  it("refuses to call a vendor credit confirmed without amount and reference evidence", async () => {
    setup(() => ({ rows: [] }));
    const result = await confirmSupplierReturnCredit({ tenantId: "tenant", supplierReturnId: "return", disposition: "confirmed", amountCents: null, reference: null, idempotencyKey: "credit-key" });
    expect(result.status).toBe("invalid");
  });

  it("supports unequal partial allocations and gives the final split the exact remaining cost", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.inventory_material_allocations")) return { rows: [] };
      if (sql.startsWith("with t as")) return { rows: [{ id: "movement", inventory_item_id: "item", item_name: "Boards", unit: "each", source_quantity: "3", unit_cost_cents: 101, allocated_quantity: "2", allocated_cost_cents: "202" }] };
      if (sql.includes("from (select 1) seed")) return { rows: [{ job_id: "job", location_id: null }] };
      if (sql.startsWith("insert into public.inventory_material_allocations")) return { rows: [{ id: "allocation" }] };
      if (sql.startsWith("insert into public.job_material_list_items")) return { rows: [{ id: "material" }] };
      return { rows: [] };
    });
    const result = await allocateConsumedMaterial({ tenantId: "tenant", sourceTransactionId: "movement", serviceJobId: "job", customerLocationId: null, quantity: 1, note: null, idempotencyKey: "allocation-key" });
    expect(result).toEqual({ status: "applied", recordId: "allocation" });
    expect(queries.some((sql) => sql.startsWith("insert into public.job_material_list_items"))).toBe(true);
  });

  it("rejects an allocation larger than the explicit unassigned remainder", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.inventory_material_allocations")) return { rows: [] };
      if (sql.startsWith("with t as")) return { rows: [{ id: "movement", inventory_item_id: "item", item_name: "Boards", unit: "each", source_quantity: "10", unit_cost_cents: 100, allocated_quantity: "9", allocated_cost_cents: "900" }] };
      if (sql.includes("from (select 1) seed")) return { rows: [{ job_id: "job", location_id: null }] };
      return { rows: [] };
    });
    const result = await allocateConsumedMaterial({ tenantId: "tenant", sourceTransactionId: "movement", serviceJobId: "job", customerLocationId: null, quantity: 2, note: null, idempotencyKey: "allocation-key" });
    expect(result.status).toBe("insufficient");
    expect(queries.some((sql) => sql.startsWith("insert into public.inventory_material_allocations"))).toBe(false);
  });

  it("rejects a job or property target that does not resolve inside the tenant", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.inventory_material_allocations")) return { rows: [] };
      if (sql.startsWith("with t as")) return { rows: [{ id: "movement", inventory_item_id: "item", item_name: "Boards", unit: "each", source_quantity: "10", unit_cost_cents: 100, allocated_quantity: "0", allocated_cost_cents: "0" }] };
      if (sql.includes("from (select 1) seed")) return { rows: [] };
      return { rows: [] };
    });
    const result = await allocateConsumedMaterial({ tenantId: "tenant", sourceTransactionId: "movement", serviceJobId: "other-tenant-job", customerLocationId: null, quantity: 2, note: null, idempotencyKey: "allocation-key" });
    expect(result.status).toBe("not_found");
    expect(queries.some((sql) => sql.startsWith("insert into public.inventory_material_allocations"))).toBe(false);
  });

  it("returns the original allocation on an idempotent retry", async () => {
    const queries = setup((sql) => {
      if (sql.startsWith("select id from public.inventory_material_allocations")) return { rows: [{ id: "existing" }] };
      return { rows: [] };
    });
    const result = await allocateConsumedMaterial({ tenantId: "tenant", sourceTransactionId: "movement", serviceJobId: "job", customerLocationId: null, quantity: 2, note: null, idempotencyKey: "allocation-key" });
    expect(result).toEqual({ status: "existing", recordId: "existing" });
    expect(queries.some((sql) => sql.startsWith("with t as"))).toBe(false);
  });

  it("cancels the allocation and its linked job-cost row together", async () => {
    const queries = setup((sql) => {
      if (sql.includes("cancellation_idempotency_key=$2")) return { rows: [] };
      if (sql.startsWith("update public.inventory_material_allocations")) return { rows: [{ id: "allocation", material_list_item_id: "material" }] };
      return { rows: [] };
    });
    const result = await cancelMaterialAllocation({ tenantId: "tenant", allocationId: "allocation", idempotencyKey: "cancel-key" });
    expect(result.status).toBe("applied");
    expect(queries.some((sql) => sql.startsWith("update public.job_material_list_items set status='cancelled'"))).toBe(true);
  });
});
