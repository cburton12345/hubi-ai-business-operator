import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type EstimatorTakeoffDetail = {
  id: string;
  estimateId: string | null;
  estimateTitle: string;
  customerName: string;
  tradeKey: string;
  status: string;
  qualityLevel: string;
  materialCost: string;
  laborCost: string;
  markup: string;
  recommendedPrice: string;
  confidence: string;
  originalInput: string;
  interpretedInput: string;
  jobAddress: string;
  missingInformation: string[];
  formulas: unknown[];
  items: {
    id: string;
    label: string;
    category: string;
    formula: string;
    calculatedQuantity: string;
    roundedPurchaseQuantity: string;
    unit: string;
    unitPrice: string;
    total: string;
    confidence: string;
    status: string;
    assumptions: string[];
  }[];
  warnings: {
    id: string;
    severity: string;
    message: string;
    status: string;
  }[];
  purchaseOrders: {
    id: string;
    jobName: string;
    status: string;
    total: string;
    supplierName: string;
    readiness: string;
    blockedReason: string;
  }[];
};

export async function getEstimatorTakeoffDetail(takeoffId: string): Promise<EstimatorTakeoffDetail | null> {
  const tenantId = await getCurrentWorkspaceId();
  const [takeoffResult, itemsResult, warningsResult, purchaseOrdersResult] = await Promise.all([
    queryPostgres<{
      id: string;
      estimate_id: string | null;
      estimate_title: string | null;
      customer_name: string | null;
      trade_key: string;
      status: string;
      quality_level: string;
      material_cost_cents: number;
      labor_cost_cents: number;
      markup_cents: number;
      recommended_customer_price_cents: number;
      confidence: string;
      original_input: string | null;
      interpreted_input: string | null;
      job_address: string | null;
      missing_information: string[] | null;
      formulas_json: unknown[] | null;
    }>(
      `
      select
        t.id,
        t.estimate_id,
        e.title as estimate_title,
        c.name as customer_name,
        t.trade_key,
        t.status,
        t.quality_level,
        t.material_cost_cents,
        t.labor_cost_cents,
        t.markup_cents,
        t.recommended_customer_price_cents,
        t.confidence,
        t.original_input,
        t.interpreted_input,
        t.job_address,
        t.missing_information,
        t.formulas_json
      from public.material_takeoffs t
      left join public.service_estimates e on e.id = t.estimate_id and e.tenant_id = t.tenant_id
      left join public.customers c on c.id = e.customer_id and c.tenant_id = t.tenant_id
      where t.tenant_id = $1 and t.id = $2
      limit 1
      `,
      [tenantId, takeoffId]
    ),
    queryPostgres<{
      id: string;
      product_category_key: string;
      label: string;
      formula: string | null;
      calculated_quantity: string;
      rounded_purchase_quantity: string;
      unit: string;
      estimated_unit_price_cents: number;
      estimated_total_cents: number;
      confidence: string;
      status: string;
      assumptions: string[] | null;
    }>(
      `
      select
        id,
        product_category_key,
        label,
        formula,
        calculated_quantity::text,
        rounded_purchase_quantity::text,
        unit,
        estimated_unit_price_cents,
        estimated_total_cents,
        confidence,
        status,
        assumptions
      from public.material_takeoff_items
      where tenant_id = $1 and takeoff_id = $2 and status <> 'removed'
      order by product_category_key, label
      `,
      [tenantId, takeoffId]
    ),
    queryPostgres<{ id: string; severity: string; message: string; status: string }>(
      `
      select id, severity, message, status
      from public.estimate_warnings
      where tenant_id = $1 and takeoff_id = $2
      order by case severity when 'blocking' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, created_at desc
      `,
      [tenantId, takeoffId]
    ),
    queryPostgres<{
      id: string;
      job_name: string | null;
      status: string;
      total_cents: number;
      supplier_name: string | null;
      readiness: string | null;
      blocked_reason: string | null;
    }>(
      `
      select
        po.id,
        po.job_name,
        po.status,
        po.total_cents,
        s.name as supplier_name,
        po.metadata_json->>'liveOrderReadiness' as readiness,
        po.metadata_json->>'liveOrderBlockedReason' as blocked_reason
      from public.purchase_orders po
      left join public.suppliers s on s.id = po.supplier_id and s.tenant_id = po.tenant_id
      where po.tenant_id = $1
        and po.metadata_json->>'takeoffId' = $2
      order by po.created_at desc
      limit 8
      `,
      [tenantId, takeoffId]
    )
  ]);

  const takeoff = takeoffResult?.rows[0];
  if (!takeoff) return null;

  return {
    id: takeoff.id,
    estimateId: takeoff.estimate_id,
    estimateTitle: takeoff.estimate_title ?? "Unlinked takeoff",
    customerName: takeoff.customer_name ?? "No customer linked",
    tradeKey: takeoff.trade_key,
    status: takeoff.status,
    qualityLevel: takeoff.quality_level,
    materialCost: formatMoney(takeoff.material_cost_cents),
    laborCost: formatMoney(takeoff.labor_cost_cents),
    markup: formatMoney(takeoff.markup_cents),
    recommendedPrice: formatMoney(takeoff.recommended_customer_price_cents),
    confidence: takeoff.confidence,
    originalInput: takeoff.original_input ?? "",
    interpretedInput: takeoff.interpreted_input ?? "",
    jobAddress: takeoff.job_address ?? "",
    missingInformation: takeoff.missing_information ?? [],
    formulas: takeoff.formulas_json ?? [],
    items: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      category: item.product_category_key.replaceAll("_", " "),
      formula: item.formula ?? "",
      calculatedQuantity: item.calculated_quantity,
      roundedPurchaseQuantity: item.rounded_purchase_quantity,
      unit: item.unit,
      unitPrice: formatMoney(item.estimated_unit_price_cents),
      total: formatMoney(item.estimated_total_cents),
      confidence: item.confidence,
      status: item.status,
      assumptions: item.assumptions ?? []
    })),
    warnings: (warningsResult?.rows ?? []).map((warning) => ({
      id: warning.id,
      severity: warning.severity,
      message: warning.message,
      status: warning.status
    })),
    purchaseOrders: (purchaseOrdersResult?.rows ?? []).map((order) => ({
      id: order.id,
      jobName: order.job_name ?? "Material order list",
      status: order.status,
      total: formatMoney(order.total_cents),
      supplierName: order.supplier_name ?? "No supplier selected",
      readiness: order.readiness ?? "not checked",
      blockedReason: order.blocked_reason ?? ""
    }))
  };
}
