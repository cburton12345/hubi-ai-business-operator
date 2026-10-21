import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const posActions = readFileSync("src/app/app/pos/actions.ts", "utf8");
const paymentAdjustments = readFileSync("src/lib/billing/invoice-payment-adjustments.ts", "utf8");
const purchasingActions = readFileSync("src/app/app/purchasing/actions.ts", "utf8");
const purchasingPage = readFileSync("src/app/app/purchasing/page.tsx", "utf8");
const membership = readFileSync("src/lib/service-ops/generate-membership-visits.ts", "utf8");
const portalActions = readFileSync("src/app/portal/[token]/actions.ts", "utf8");
const portalPage = readFileSync("src/app/portal/[token]/page.tsx", "utf8");
const serviceActions = readFileSync("src/app/app/service/actions.ts", "utf8");
const serviceInventoryPage = readFileSync("src/app/app/service/inventory/page.tsx", "utf8");
const serviceInventoryReadModel = readFileSync("src/lib/service-ops/get-service-inventory.ts", "utf8");
const accountingExport = readFileSync("src/app/api/reports/accounting-export/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/248_commerce_portal_integrity.sql", "utf8");

describe("commerce and portal integrity contracts", () => {
  it("captures inventory cost at sale and restores the same cost basis on returns", () => {
    expect(posActions).toContain("total_cents,unit_cost_cents");
    expect(posActions).toContain("item.row.unit_cost_cents");
    expect(posActions).not.toMatch(/'consume',\$3,0/);
    expect(posActions).not.toMatch(/'return',\$3,0/);
    expect(posActions).toContain("inventory_location_balances");
    expect(posActions).toContain("inventory_reservations");
    expect(posActions).toContain("from_location_id");
    expect(posActions).toContain("to_location_id");
  });

  it("reconciles invoices and payment state after a POS return", () => {
    expect(posActions).toContain("total_cents=greatest(total_cents-$3,0)");
    expect(posActions).toContain("recordInvoiceRefundAcrossPaymentsWithClient");
    expect(paymentAdjustments).toContain("amount_paid_cents=greatest(amount_paid_cents-$3,0)");
    expect(posActions).toContain("credit_cents=credit_cents+$3");
    expect(paymentAdjustments).toContain("'partially_refunded'");
  });

  it("refuses unmatched receiving and carries purchase cost into stock", () => {
    expect(purchasingActions).toContain("matched_inventory");
    expect(purchasingActions).toContain("inventoryItemId: z.string().uuid()");
    expect(purchasingActions).toContain("i.unit_price_cents");
    expect(purchasingActions).toContain("inv.quantity*inv.unit_cost_cents+m.quantity_delta*m.unit_cost_cents");
    expect(purchasingActions).toContain("inventory_location_balances");
    expect(purchasingActions).toContain("matched_location");
    expect(purchasingActions).toContain("l.tenant_id=$1");
    expect(purchasingPage).toContain("Inventory match required");
  });

  it("blocks unmatched vendor bills and does not expose a fake QuickBooks queue", () => {
    expect(purchasingActions).toContain("reconciliation_status='matched'");
    expect(purchasingActions).not.toContain("queueAccountingSyncAction");
    expect(purchasingPage).toContain("Ferocity will not create a queue that has no certified provider worker");
    expect(purchasingActions).toContain("public.vendor_bills.status in ('draft','review')");
    expect(purchasingActions).toContain("$3 not in ('exported','paid')");
  });

  it("aggregates duplicate POS return lines before enforcing the remaining quantity", () => {
    expect(posActions).toContain("requestedByItem");
    expect(posActions).toContain("(requestedByItem.get(request.itemId) ?? 0) + quantity");
    expect(posActions).not.toContain("const row = saleItems.rows.find((item) => item.id === request.itemId)");
  });

  it("does not generate visits for an exhausted membership", () => {
    expect(membership).toContain("p.visits_remaining is null or p.visits_remaining > 0");
  });

  it("makes manual inventory adjustments idempotent and tenant-binds assigned jobs", () => {
    expect(serviceActions).toContain("idempotencyKey: z.string().uuid()");
    expect(serviceActions).toContain("on conflict (tenant_id,idempotency_key)");
    expect(serviceInventoryPage).toContain('name="idempotencyKey"');
    expect(serviceInventoryReadModel).toContain("j.tenant_id = i.tenant_id");
  });

  it("exports only issued invoices and approved vendor bills", () => {
    expect(accountingExport).toContain("i.status in ('sent_manually','partially_paid','paid','overdue','written_off')");
    expect(accountingExport).toContain("b.status in ('approved','exported','paid')");
  });

  it("rate-limits and deduplicates public portal writes", () => {
    expect(portalActions).toContain("consumeLoginRateLimit");
    expect(portalActions).toContain("on conflict (tenant_id,customer_id,idempotency_key)");
    expect(portalPage.match(/name="idempotencyKey"/g)).toHaveLength(2);
    expect(migration).toContain("customer_portal_requests_idempotency_unique");
    expect(migration).toContain("customer_portal_messages_idempotency_unique");
  });
});
