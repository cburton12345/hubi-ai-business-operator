import { beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/postgres", () => ({ withPostgresTransactionResult: transaction }));

import { consumeInventoryReservation, recordInventoryCount, transferInventory } from "@/lib/service-ops/inventory-control";

function setup(handler: (sql: string) => { rows: unknown[] }) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      const sql = text.replace(/\s+/g, " ").trim();
      queries.push(sql);
      return handler(sql);
    })
  } as unknown as pg.PoolClient;
  transaction.mockImplementation(async (operation) => ({ ok: true, value: await operation(client) }));
  return queries;
}

describe("inventory control", () => {
  beforeEach(() => {
    transaction.mockReset();
  });

  it("moves only unreserved stock between tenant locations without changing the tenant total", async () => {
    const queries = setup((sql) => {
      if (sql.includes("from public.inventory_transactions where")) return { rows: [] };
      if (sql.includes("from public.service_inventory_items i") && sql.includes("for update of i")) return { rows: [{ item_id: "item", from_id: "from", to_id: "to" }] };
      if (sql.includes("from public.inventory_location_balances b") && sql.includes("reserved")) return { rows: [{ quantity: "10", reserved: "2" }] };
      if (sql.startsWith("insert into public.inventory_transactions")) return { rows: [{ id: "movement" }] };
      return { rows: [] };
    });
    const result = await transferInventory({ tenantId: "tenant", itemId: "item", fromLocationId: "from", toLocationId: "to", quantity: 8, reason: "Move to truck", idempotencyKey: "key" });
    expect(result).toEqual({ status: "applied", recordId: "movement" });
    expect(queries.some((sql) => sql.startsWith("update public.inventory_location_balances"))).toBe(true);
    expect(queries.some((sql) => sql.startsWith("insert into public.inventory_location_balances"))).toBe(true);
    expect(queries.some((sql) => sql.startsWith("update public.service_inventory_items"))).toBe(false);
  });

  it("blocks a transfer that would consume stock reserved for work", async () => {
    const queries = setup((sql) => {
      if (sql.includes("from public.inventory_transactions where")) return { rows: [] };
      if (sql.includes("from public.service_inventory_items i") && sql.includes("for update of i")) return { rows: [{ item_id: "item", from_id: "from", to_id: "to" }] };
      if (sql.includes("from public.inventory_location_balances b") && sql.includes("reserved")) return { rows: [{ quantity: "10", reserved: "4" }] };
      return { rows: [] };
    });
    const result = await transferInventory({ tenantId: "tenant", itemId: "item", fromLocationId: "from", toLocationId: "to", quantity: 7, reason: "Move", idempotencyKey: "key" });
    expect(result.status).toBe("insufficient");
    expect(queries.some((sql) => sql.startsWith("update public.inventory_location_balances"))).toBe(false);
  });

  it("consumes a reservation once and decrements location and tenant totals", async () => {
    const queries = setup((sql) => {
      if (sql.includes("from public.inventory_transactions where")) return { rows: [] };
      if (sql.includes("from public.inventory_reservations") && sql.includes("for update")) return { rows: [{ id: "reservation", inventory_item_id: "item", location_id: "location", work_order_id: "work", quantity: "5", consumed_quantity: "1", released_quantity: "0" }] };
      if (sql.startsWith("select quantity::text from public.inventory_location_balances")) return { rows: [{ quantity: "10" }] };
      if (sql.startsWith("update public.service_inventory_items")) return { rows: [{ id: "item" }] };
      if (sql.startsWith("insert into public.inventory_transactions")) return { rows: [{ id: "movement" }] };
      return { rows: [] };
    });
    const result = await consumeInventoryReservation({ tenantId: "tenant", reservationId: "reservation", quantity: 4, idempotencyKey: "consume-key" });
    expect(result.status).toBe("applied");
    expect(queries.some((sql) => sql.startsWith("update public.inventory_location_balances"))).toBe(true);
    expect(queries.some((sql) => sql.startsWith("update public.service_inventory_items"))).toBe(true);
    expect(queries.some((sql) => sql.includes("status=case when consumed_quantity+released_quantity"))).toBe(true);
  });

  it("records a physical count and its exact adjustment as one idempotent operation", async () => {
    const queries = setup((sql) => {
      if (sql.includes("from public.inventory_stock_counts where")) return { rows: [] };
      if (sql.includes("from public.inventory_location_balances b") && sql.includes("for update of b")) return { rows: [{ quantity: "10", total_quantity: "25" }] };
      if (sql.startsWith("insert into public.inventory_stock_counts")) return { rows: [{ id: "count" }] };
      return { rows: [] };
    });
    const result = await recordInventoryCount({ tenantId: "tenant", itemId: "item", locationId: "location", observedQuantity: 7, reason: "Cycle count", idempotencyKey: "count-key" });
    expect(result).toEqual({ status: "applied", recordId: "count" });
    expect(queries.some((sql) => sql.includes("set quantity=$4"))).toBe(true);
    expect(queries.some((sql) => sql.includes("set quantity=$3"))).toBe(true);
    expect(queries.some((sql) => sql.includes("'adjust',$4"))).toBe(true);
  });
});
