import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value) : "Not set";
}

export async function getPurchasingDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const [ordersResult, itemsResult, billsResult, locationsResult, syncResult] = await Promise.all([
    queryPostgres<{
      id: string;
      po_number: string | null;
      status: string;
      supplier_name: string | null;
      job_name: string | null;
      required_date: Date | null;
      total_cents: number;
      item_count: string;
      received_items: string;
    }>(
      `
      select po.id, po.po_number, po.status, s.name as supplier_name, po.job_name,
             po.required_date, po.total_cents,
             count(distinct poi.id)::text as item_count,
             count(distinct poi.id) filter (
               where coalesce(received.quantity_received, 0) >= poi.quantity
             )::text as received_items
      from public.purchase_orders po
      left join public.suppliers s on s.id = po.supplier_id and s.tenant_id = po.tenant_id
      left join public.purchase_order_items poi on poi.purchase_order_id = po.id and poi.tenant_id = po.tenant_id
      left join lateral (
        select coalesce(sum(pri.quantity_received), 0) as quantity_received
        from public.purchase_order_receipt_items pri
        join public.purchase_order_receipts pr on pr.id = pri.receipt_id and pr.tenant_id = pri.tenant_id
        where pri.tenant_id = po.tenant_id and pri.purchase_order_item_id = poi.id
          and pr.status <> 'reversed'
      ) received on true
      where po.tenant_id = $1 and po.status <> 'cancelled'
      group by po.id, s.name
      order by
        case po.status when 'ordered' then 0 when 'approved' then 1 when 'picked_up' then 2 when 'delivered' then 3 else 4 end,
        po.required_date nulls last, po.created_at desc
      limit 100
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      purchase_order_id: string;
      product_name: string;
      sku: string | null;
      quantity: string;
      unit: string;
      received_quantity: string;
    }>(
      `
      select poi.id, poi.purchase_order_id, poi.product_name, poi.sku,
             poi.quantity::text, poi.unit,
             coalesce(sum(pri.quantity_received) filter (where pr.status <> 'reversed'), 0)::text as received_quantity
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id and po.tenant_id = poi.tenant_id
      left join public.purchase_order_receipt_items pri
        on pri.purchase_order_item_id = poi.id and pri.tenant_id = poi.tenant_id
      left join public.purchase_order_receipts pr on pr.id = pri.receipt_id and pr.tenant_id = pri.tenant_id
      where poi.tenant_id = $1 and po.status <> 'cancelled' and poi.status <> 'cancelled'
      group by poi.id
      order by poi.created_at
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      bill_number: string | null;
      status: string;
      supplier_name: string | null;
      po_number: string | null;
      due_date: Date | null;
      total_cents: number;
    }>(
      `
      select b.id, b.bill_number, b.status, s.name as supplier_name, po.po_number,
             b.due_date, b.total_cents
      from public.vendor_bills b
      left join public.suppliers s on s.id = b.supplier_id and s.tenant_id = b.tenant_id
      left join public.purchase_orders po on po.id = b.purchase_order_id and po.tenant_id = b.tenant_id
      where b.tenant_id = $1 and b.status <> 'void'
      order by b.due_date nulls last, b.created_at desc
      limit 100
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string }>(
      "select id, name from public.inventory_locations where tenant_id = $1 and active order by name",
      [tenantId]
    ),
    queryPostgres<{ id: string; status: string; created_at: Date; records_seen: number; records_failed: number }>(
      `
      select id, status, created_at, records_seen, records_failed
      from public.accounting_sync_runs
      where tenant_id = $1
      order by created_at desc
      limit 10
      `,
      [tenantId]
    )
  ]);

  const itemsByOrder = new Map<string, {
    id: string;
    name: string;
    sku: string | null;
    ordered: number;
    received: number;
    remaining: number;
    unit: string;
  }[]>();
  for (const row of itemsResult?.rows ?? []) {
    const ordered = Number(row.quantity);
    const received = Number(row.received_quantity);
    const item = {
      id: row.id,
      name: row.product_name,
      sku: row.sku,
      ordered,
      received,
      remaining: Math.max(ordered - received, 0),
      unit: row.unit
    };
    itemsByOrder.set(row.purchase_order_id, [...(itemsByOrder.get(row.purchase_order_id) ?? []), item]);
  }

  const orders = (ordersResult?.rows ?? []).map((row) => ({
    id: row.id,
    number: row.po_number || `PO ${row.id.slice(0, 8)}`,
    status: row.status,
    supplier: row.supplier_name || "Supplier needed",
    job: row.job_name || "Unassigned",
    requiredDate: date(row.required_date),
    total: money(row.total_cents),
    itemCount: Number(row.item_count),
    receivedItems: Number(row.received_items),
    items: itemsByOrder.get(row.id) ?? []
  }));

  return {
    orders,
    bills: (billsResult?.rows ?? []).map((row) => ({
      id: row.id,
      number: row.bill_number || "Draft bill",
      status: row.status,
      supplier: row.supplier_name || "Supplier needed",
      purchaseOrder: row.po_number || "No PO",
      dueDate: date(row.due_date),
      total: money(row.total_cents)
    })),
    locations: locationsResult?.rows ?? [],
    syncRuns: (syncResult?.rows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: date(row.created_at),
      recordsSeen: row.records_seen,
      recordsFailed: row.records_failed
    })),
    metrics: {
      openOrders: orders.filter((order) => !["delivered", "reconciled"].includes(order.status)).length,
      receivingNeeded: orders.reduce((sum, order) => sum + order.items.filter((item) => item.remaining > 0).length, 0),
      billsToReview: (billsResult?.rows ?? []).filter((bill) => ["draft", "review"].includes(bill.status)).length,
      accountingExceptions: (syncResult?.rows ?? []).filter((run) => ["failed", "partial"].includes(run.status)).length
    }
  };
}
