import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { rankProcurementMatches } from "@/lib/service-ops/procurement-matching";
import { rankSupplierSources, type SupplierSourceOption } from "@/lib/service-ops/supplier-sourcing";

export class PurchasingDashboardUnavailableError extends Error {
  constructor() {
    super("Purchasing records are temporarily unavailable.");
    this.name = "PurchasingDashboardUnavailableError";
  }
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value) : "Not set";
}

function optionalNumber(value: string | null, minimum: number, maximum: number) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : null;
}

export async function getPurchasingDashboard() {
  const tenantId = await getCurrentWorkspaceId();
  const [ordersResult, itemsResult, billsResult, locationsResult, syncResult, returnableResult, returnsResult, unmatchedDocumentsResult, supplierPricesResult] = await Promise.all([
    queryPostgres<{
      id: string;
      po_number: string | null;
      status: string;
      supplier_name: string | null;
      job_name: string | null;
      required_date: Date | null;
      total_cents: number;
      created_at: Date;
      item_count: string;
      received_items: string;
    }>(
      `
      select po.id, po.po_number, po.status, s.name as supplier_name, po.job_name, po.created_at,
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
      inventory_item_id: string | null;
    }>(
      `
      select poi.id, poi.purchase_order_id, poi.product_name, poi.sku,
             poi.quantity::text, poi.unit,
             coalesce(sum(pri.quantity_received) filter (where pr.status <> 'reversed'), 0)::text as received_quantity,
             matched_inventory.id as inventory_item_id
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id and po.tenant_id = poi.tenant_id
      left join public.purchase_order_receipt_items pri
        on pri.purchase_order_item_id = poi.id and pri.tenant_id = poi.tenant_id
      left join public.purchase_order_receipts pr on pr.id = pri.receipt_id and pr.tenant_id = pri.tenant_id
      left join lateral (
        select inv.id from public.service_inventory_items inv
        where inv.tenant_id=poi.tenant_id and inv.status <> 'retired'
          and ((poi.sku is not null and inv.sku is not null and lower(inv.sku)=lower(poi.sku)) or lower(inv.name)=lower(poi.product_name))
        order by case when poi.sku is not null and lower(coalesce(inv.sku,''))=lower(poi.sku) then 0 else 1 end limit 1
      ) matched_inventory on true
      where poi.tenant_id = $1 and po.status <> 'cancelled' and poi.status <> 'cancelled'
      group by poi.id,matched_inventory.id
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
      expected_subtotal_cents: number | null;
      variance_cents: number | null;
      reconciliation_status: string;
    }>(
      `
      select b.id, b.bill_number, b.status, s.name as supplier_name, po.po_number,
             b.due_date, b.total_cents,b.expected_subtotal_cents,b.variance_cents,b.reconciliation_status
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
    ),
    queryPostgres<{ receipt_item_id: string; item_name: string; supplier_name: string | null; po_number: string | null; location_id: string | null; location_name: string | null; returnable: string; unit: string }>(
      `select ri.id receipt_item_id,poi.product_name item_name,s.name supplier_name,po.po_number,
              r.destination_location_id location_id,l.name location_name,poi.unit,
              (ri.quantity_received-coalesce((select sum(sri.quantity) from public.supplier_return_items sri
                join public.supplier_returns sr on sr.tenant_id=sri.tenant_id and sr.id=sri.supplier_return_id
                where sri.tenant_id=ri.tenant_id and sri.receipt_item_id=ri.id and sr.status<>'canceled'),0))::text returnable
         from public.purchase_order_receipt_items ri
         join public.purchase_order_receipts r on r.tenant_id=ri.tenant_id and r.id=ri.receipt_id and r.status<>'reversed'
         join public.purchase_order_items poi on poi.tenant_id=ri.tenant_id and poi.id=ri.purchase_order_item_id
         join public.purchase_orders po on po.tenant_id=ri.tenant_id and po.id=r.purchase_order_id and po.status<>'cancelled'
         left join public.suppliers s on s.tenant_id=po.tenant_id and s.id=po.supplier_id
         left join public.inventory_locations l on l.tenant_id=r.tenant_id and l.id=r.destination_location_id
        where ri.tenant_id=$1 and ri.inventory_item_id is not null
          and ri.quantity_received>coalesce((select sum(sri.quantity) from public.supplier_return_items sri
            join public.supplier_returns sr on sr.tenant_id=sri.tenant_id and sr.id=sri.supplier_return_id
            where sri.tenant_id=ri.tenant_id and sri.receipt_item_id=ri.id and sr.status<>'canceled'),0)
        order by r.received_at desc limit 100`,
      [tenantId]
    ),
    queryPostgres<{ id: string; item_name: string; supplier_name: string | null; quantity: string; expected_credit_cents: number; confirmed_credit_cents: number | null; status: string; credit_status: string; vendor_credit_reference: string | null; created_at: Date }>(
      `select sr.id,poi.product_name item_name,s.name supplier_name,sri.quantity::text,sr.expected_credit_cents,
              sr.confirmed_credit_cents,sr.status,sr.credit_status,sr.vendor_credit_reference,sr.created_at
         from public.supplier_returns sr
         join public.supplier_return_items sri on sri.tenant_id=sr.tenant_id and sri.supplier_return_id=sr.id
         join public.purchase_order_receipt_items ri on ri.tenant_id=sri.tenant_id and ri.id=sri.receipt_item_id
         join public.purchase_order_items poi on poi.tenant_id=ri.tenant_id and poi.id=ri.purchase_order_item_id
         left join public.suppliers s on s.tenant_id=sr.tenant_id and s.id=sr.supplier_id
        where sr.tenant_id=$1 and sr.status<>'canceled'
        order by sr.created_at desc limit 100`,
      [tenantId]
    ),
    queryPostgres<{ id: string; vendor_name: string | null; document_number: string | null; document_date: string | null; total_cents: number | null; original_file_name: string; status: string }>(
      `select d.id,d.vendor_name,d.document_number,d.document_date::text,d.total_cents,d.original_file_name,d.status
         from public.document_intelligence_documents d
        where d.tenant_id=$1 and d.document_type in ('bill','invoice')
          and d.status in ('needs_review','duplicate') and d.ferocity_expense_id is null
        order by d.created_at desc limit 50`,
      [tenantId]
    ),
    queryPostgres<{
      supplier_product_id: string; supplier_name: string; product_name: string; sku: string | null;
      unit_price_cents: number; availability: SupplierSourceOption["availability"];
      confidence: SupplierSourceOption["confidence"]; checked_at: Date; source_type: string;
      lead_time_days: string | null; reliability_score: string | null;
    }>(
      `select sp.supplier_product_id,s.name supplier_name,p.product_name,p.sku,
              sp.unit_price_cents,sp.availability,sp.confidence,sp.checked_at,sp.source_type,
              nullif(sp.metadata_json->>'leadTimeDays','') lead_time_days,
              nullif(coalesce(sp.metadata_json->>'reliabilityScore',s.metadata_json->>'reliabilityScore'),'') reliability_score
         from public.supplier_prices sp
         join public.supplier_products p on p.id=sp.supplier_product_id and p.tenant_id=sp.tenant_id and p.status not in ('archived','discontinued')
         join public.suppliers s on s.id=p.supplier_id and s.tenant_id=p.tenant_id and s.status='active'
        where sp.tenant_id=$1
        order by sp.checked_at desc limit 500`,
      [tenantId]
    )
  ]);

  if (
    !ordersResult ||
    !itemsResult ||
    !billsResult ||
    !locationsResult ||
    !syncResult ||
    !returnableResult ||
    !returnsResult ||
    !unmatchedDocumentsResult ||
    !supplierPricesResult
  ) {
    throw new PurchasingDashboardUnavailableError();
  }

  const itemsByOrder = new Map<string, {
    id: string;
    name: string;
    sku: string | null;
    ordered: number;
    received: number;
    remaining: number;
    unit: string;
    inventoryItemId: string | null;
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
      unit: row.unit,
      inventoryItemId: row.inventory_item_id
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
  const purchaseOrderCandidates = (ordersResult?.rows ?? []).map((row) => ({
    id: row.id,
    purchaseOrderNumber: row.po_number || `PO ${row.id.slice(0, 8)}`,
    supplierName: row.supplier_name,
    totalCents: row.total_cents,
    createdAt: new Date(row.created_at).toISOString(),
  }));
  const supplierGroups = new Map<string, SupplierSourceOption[]>();
  for (const row of supplierPricesResult?.rows ?? []) {
    const key = row.sku?.trim().toLowerCase() || row.product_name.trim().toLowerCase();
    const option: SupplierSourceOption = {
      supplierProductId: row.supplier_product_id,
      supplierName: row.supplier_name,
      productName: row.product_name,
      sku: row.sku,
      unitPriceCents: row.unit_price_cents,
      availability: row.availability,
      confidence: row.confidence,
      checkedAt: new Date(row.checked_at).toISOString(),
      sourceType: row.source_type,
      leadTimeDays: optionalNumber(row.lead_time_days, 0, 365),
      reliabilityScore: optionalNumber(row.reliability_score, 0, 1),
    };
    supplierGroups.set(key, [...(supplierGroups.get(key) ?? []), option]);
  }

  return {
    orders,
    unmatchedDocuments: (unmatchedDocumentsResult?.rows ?? []).map((document) => ({
      id: document.id,
      fileName: document.original_file_name,
      vendor: document.vendor_name ?? "Supplier not identified",
      number: document.document_number ?? "Document number not identified",
      total: document.total_cents === null ? "Total not identified" : money(document.total_cents),
      status: document.status,
      candidates: rankProcurementMatches({
        id: document.id,
        supplierName: document.vendor_name,
        documentNumber: document.document_number,
        documentDate: document.document_date,
        totalCents: document.total_cents,
      }, purchaseOrderCandidates).map((candidate) => ({
        ...candidate,
        total: money(candidate.totalCents),
      })),
    })),
    supplierSources: [...supplierGroups.entries()].flatMap(([key, options]) => {
      const latestByProduct = new Map<string, SupplierSourceOption>();
      for (const option of options) if (!latestByProduct.has(option.supplierProductId)) latestByProduct.set(option.supplierProductId, option);
      const latest = [...latestByProduct.values()];
      if (latest.length < 2) return [];
      return [{
        key,
        label: latest[0].sku || latest[0].productName,
        historyCount: options.length,
        options: rankSupplierSources(latest).slice(0, 3).map((option) => ({ ...option, price: money(option.unitPriceCents) })),
      }];
    }).slice(0, 50),
    bills: (billsResult?.rows ?? []).map((row) => ({
      id: row.id,
      number: row.bill_number || "Draft bill",
      status: row.status,
      supplier: row.supplier_name || "Supplier needed",
      purchaseOrder: row.po_number || "No PO",
      dueDate: date(row.due_date),
      total: money(row.total_cents),
      expectedSubtotal: row.expected_subtotal_cents === null ? "Not verified" : money(row.expected_subtotal_cents),
      variance: row.variance_cents === null ? "Not verified" : money(row.variance_cents),
      reconciliationStatus: row.reconciliation_status
    })),
    locations: locationsResult?.rows ?? [],
    syncRuns: (syncResult?.rows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: date(row.created_at),
      recordsSeen: row.records_seen,
      recordsFailed: row.records_failed
    })),
    returnableReceipts: (returnableResult?.rows ?? []).map((row) => ({
      receiptItemId: row.receipt_item_id,
      itemName: row.item_name,
      supplier: row.supplier_name ?? "Supplier",
      purchaseOrder: row.po_number ?? "Purchase order",
      locationId: row.location_id,
      locationName: row.location_name ?? "Select location",
      returnable: Number(row.returnable),
      unit: row.unit
    })),
    supplierReturns: (returnsResult?.rows ?? []).map((row) => ({
      id: row.id,
      itemName: row.item_name,
      supplier: row.supplier_name ?? "Supplier",
      quantity: Number(row.quantity),
      expectedCredit: money(row.expected_credit_cents),
      confirmedCredit: row.confirmed_credit_cents === null ? null : money(row.confirmed_credit_cents),
      status: row.status,
      creditStatus: row.credit_status,
      creditReference: row.vendor_credit_reference,
      createdAt: date(row.created_at)
    })),
    canQueueLiveAccountingSync: false,
    metrics: {
      openOrders: orders.filter((order) => !["delivered", "reconciled"].includes(order.status)).length,
      receivingNeeded: orders.reduce((sum, order) => sum + order.items.filter((item) => item.remaining > 0).length, 0),
      billsToReview: (billsResult?.rows ?? []).filter((bill) => ["draft", "review"].includes(bill.status)).length,
      accountingExceptions: (syncResult?.rows ?? []).filter((run) => ["failed", "partial"].includes(run.status)).length
    }
  };
}
