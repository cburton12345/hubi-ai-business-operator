import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type EstimatorTakeoffRow = {
  id: string;
  estimateId: string | null;
  estimateTitle: string;
  customerName: string;
  tradeKey: string;
  status: string;
  qualityLevel: string;
  materialCost: string;
  recommendedPrice: string;
  confidence: string;
  missingInformation: string[];
  createdAt: string;
};

export type EstimatorWarningRow = {
  id: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
};

export type EstimatorProfileRow = {
  id: string;
  name: string;
  tradeKey: string;
  qualityLevel: string;
  waste: string;
  markup: string;
};

export type EstimatorPurchasingRow = {
  id: string;
  label: string;
  detail: string;
  status: string;
  tone: string;
  actionKind?: "quote" | "inventory" | "package" | "approval";
};

export type EstimatorOption = {
  id: string;
  label: string;
};

export type EstimatorDashboard = {
  metrics: {
    takeoffs: number;
    reviewRequired: number;
    warnings: number;
    readyForBid: number;
    quoteRequests: number;
    inventoryMatches: number;
    packageReviews: number;
    approvalRequirements: number;
    priceRefreshes: number;
    changeOrders: number;
    validationReviews: number;
    estimateVersions: number;
    inventoryReservations: number;
    manualPrices: number;
    substitutionReviews: number;
    deliveryReviews: number;
  };
  takeoffs: EstimatorTakeoffRow[];
  warnings: EstimatorWarningRow[];
  quoteRequests: EstimatorPurchasingRow[];
  inventoryMatches: EstimatorPurchasingRow[];
  packageOptions: EstimatorPurchasingRow[];
  approvalRequirements: EstimatorPurchasingRow[];
  priceRefreshes: EstimatorPurchasingRow[];
  changeOrders: EstimatorPurchasingRow[];
  planValidations: EstimatorPurchasingRow[];
  complianceChecks: EstimatorPurchasingRow[];
  insuranceScopes: EstimatorPurchasingRow[];
  estimateVersions: EstimatorPurchasingRow[];
  inventoryReservations: EstimatorPurchasingRow[];
  manualPriceEntries: EstimatorPurchasingRow[];
  substitutionReviews: EstimatorPurchasingRow[];
  deliveryReviews: EstimatorPurchasingRow[];
  profiles: EstimatorProfileRow[];
  estimates: EstimatorOption[];
  customers: EstimatorOption[];
  takeoffItems: EstimatorOption[];
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function percentFromBps(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

export async function getEstimatorDashboard(): Promise<EstimatorDashboard> {
  const tenantId = await getCurrentWorkspaceId();

  const [
    takeoffsResult,
    warningsResult,
    quoteRequestsResult,
    inventoryMatchesResult,
    packageOptionsResult,
    approvalRequirementsResult,
    priceRefreshesResult,
    changeOrdersResult,
    planValidationsResult,
    complianceChecksResult,
    insuranceScopesResult,
    estimateVersionsResult,
    inventoryReservationsResult,
    manualPriceEntriesResult,
    substitutionReviewsResult,
    deliveryReviewsResult,
    profilesResult,
    estimatesResult,
    customersResult,
    takeoffItemsResult
  ] = await Promise.all([
    queryPostgres<{
      id: string;
      estimate_id: string | null;
      estimate_title: string | null;
      customer_name: string | null;
      trade_key: string;
      status: string;
      quality_level: string;
      material_cost_cents: number;
      recommended_customer_price_cents: number;
      confidence: string;
      missing_information: string[] | null;
      created_at: Date;
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
        t.recommended_customer_price_cents,
        t.confidence,
        t.missing_information,
        t.created_at
      from public.material_takeoffs t
      left join public.service_estimates e on e.id = t.estimate_id and e.tenant_id = t.tenant_id
      left join public.customers c on c.id = e.customer_id and c.tenant_id = t.tenant_id
      where t.tenant_id = $1
      order by t.created_at desc
      limit 12
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; severity: string; message: string; status: string; created_at: Date }>(
      `
      select id, severity, message, status, created_at
      from public.estimate_warnings
      where tenant_id = $1 and status = 'open'
      order by case severity when 'blocking' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, created_at desc
      limit 10
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; product_category_key: string; reason: string; status: string }>(
      `
      select id, product_category_key, reason, status
      from public.estimator_quote_requests
      where tenant_id = $1 and status in ('needed', 'requested', 'expired')
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; inventory_name: string | null; required_quantity: string; usable_quantity: string; confidence: string; match_status: string }>(
      `
      select m.id, i.name as inventory_name, m.required_quantity::text, m.usable_quantity::text, m.confidence, m.match_status
      from public.estimator_inventory_matches m
      left join public.service_inventory_items i on i.id = m.inventory_item_id and i.tenant_id = m.tenant_id
      where m.tenant_id = $1 and m.match_status in ('possible', 'recommended')
      order by m.created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; option_name: string; package_strategy: string; optimization_notes: string | null }>(
      `
      select id, option_name, package_strategy, optimization_notes
      from public.estimator_package_options
      where tenant_id = $1 and selected = false
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; requirement_key: string; role_required: string; risk_level: string; reason: string; status: string }>(
      `
      select id, requirement_key, role_required, risk_level, reason, status
      from public.estimator_approval_requirements
      where tenant_id = $1 and status = 'open'
      order by case risk_level when 'blocking' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; label: string; price_lock_status: string; price_expires_at: Date | null; pricing_confidence: string }>(
      `
      select id, label, price_lock_status, price_expires_at, pricing_confidence
      from public.material_takeoff_items
      where tenant_id = $1
        and (price_refresh_required = true or price_lock_status in ('expired', 'needs_refresh') or price_expires_at < now() + interval '7 days')
      order by coalesce(price_expires_at, now()) asc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; title: string; change_type: string; status: string; amount_cents: number }>(
      `
      select id, title, change_type, status, amount_cents
      from public.estimate_change_orders
      where tenant_id = $1 and status in ('draft', 'sent_manually')
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; validation_type: string; status: string; confidence: string; notes: string | null }>(
      `
      select id, validation_type, status, confidence, notes
      from public.estimator_plan_validations
      where tenant_id = $1 and status = 'needs_review'
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; check_type: string; status: string; confidence: string; notes: string | null }>(
      `
      select id, check_type, status, confidence, notes
      from public.estimator_compliance_checks
      where tenant_id = $1 and status in ('unverified', 'needs_review')
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; carrier: string | null; xactimate_comparison_status: string; status: string; scope_summary: string | null }>(
      `
      select id, carrier, xactimate_comparison_status, status, scope_summary
      from public.estimator_insurance_scopes
      where tenant_id = $1 and status in ('draft', 'needs_review')
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; estimate_title: string | null; version_number: number; reason: string; created_at: Date }>(
      `
      select v.id, e.title as estimate_title, v.version_number, v.reason, v.created_at
      from public.estimate_versions v
      left join public.service_estimates e on e.id = v.estimate_id and e.tenant_id = v.tenant_id
      where v.tenant_id = $1
      order by v.created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; inventory_name: string | null; reserved_quantity: string; status: string; created_at: Date }>(
      `
      select r.id, i.name as inventory_name, r.reserved_quantity::text, r.status, r.created_at
      from public.estimator_inventory_reservations r
      left join public.service_inventory_items i on i.id = r.inventory_item_id and i.tenant_id = r.tenant_id
      where r.tenant_id = $1 and r.status = 'reserved'
      order by r.created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; supplier_name: string | null; price_type: string; unit_price_cents: number; confidence: string; created_at: Date }>(
      `
      select id, supplier_name, price_type, unit_price_cents, confidence, created_at
      from public.estimator_manual_price_entries
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; substitute_name: string | null; status: string; notes: string | null }>(
      `
      select id, substitute_spec_json->>'name' as substitute_name, status, notes
      from public.estimator_substitution_reviews
      where tenant_id = $1 and status = 'needs_review'
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; delivery_method: string | null; status: string; landed_cost_cents: number; jobsite_access_status: string; notes: string | null }>(
      `
      select id, delivery_method, status, landed_cost_cents, jobsite_access_status, notes
      from public.estimator_delivery_reviews
      where tenant_id = $1 and status = 'needs_review'
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; name: string; trade_key: string; quality_level: string; default_waste_bps: number; material_markup_bps: number }>(
      `
      select id, name, trade_key, quality_level, default_waste_bps, material_markup_bps
      from public.estimating_profiles
      where tenant_id = $1
      order by trade_key, quality_level, name
      limit 20
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; title: string; customer_name: string }>(
      `
      select e.id, e.title, c.name as customer_name
      from public.service_estimates e
      join public.customers c on c.id = e.customer_id and c.tenant_id = e.tenant_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit 50
      `,
      [tenantId]
    ).catch(() => ({ rows: [] })),
    queryPostgres<{ id: string; name: string }>(
      `
      select id, name
      from public.customers
      where tenant_id = $1
      order by created_at desc
      limit 50
      `,
      [tenantId]
    ).catch(() => ({ rows: [] }))
    ,
    queryPostgres<{ id: string; label: string; estimate_title: string | null }>(
      `
      select i.id, i.label, e.title as estimate_title
      from public.material_takeoff_items i
      join public.material_takeoffs t on t.id = i.takeoff_id and t.tenant_id = i.tenant_id
      left join public.service_estimates e on e.id = t.estimate_id and e.tenant_id = t.tenant_id
      where i.tenant_id = $1 and i.status <> 'removed'
      order by i.created_at desc
      limit 50
      `,
      [tenantId]
    ).catch(() => ({ rows: [] }))
  ]);

  const takeoffs = (takeoffsResult?.rows ?? []).map((row) => ({
    id: row.id,
    estimateId: row.estimate_id,
    estimateTitle: row.estimate_title ?? "Unlinked takeoff",
    customerName: row.customer_name ?? "No customer linked",
    tradeKey: row.trade_key,
    status: row.status,
    qualityLevel: row.quality_level,
    materialCost: formatMoney(row.material_cost_cents),
    recommendedPrice: formatMoney(row.recommended_customer_price_cents),
    confidence: row.confidence,
    missingInformation: row.missing_information ?? [],
    createdAt: formatDate(row.created_at)
  }));

  return {
    metrics: {
      takeoffs: takeoffs.length,
      reviewRequired: takeoffs.filter((row) => ["needs_measurements", "needs_review"].includes(row.status)).length,
      warnings: (warningsResult?.rows ?? []).length,
      readyForBid: takeoffs.filter((row) => row.status === "ready_for_bid").length,
      quoteRequests: (quoteRequestsResult?.rows ?? []).length,
      inventoryMatches: (inventoryMatchesResult?.rows ?? []).length,
      packageReviews: (packageOptionsResult?.rows ?? []).length,
      approvalRequirements: (approvalRequirementsResult?.rows ?? []).length,
      priceRefreshes: (priceRefreshesResult?.rows ?? []).length,
      changeOrders: (changeOrdersResult?.rows ?? []).length,
      validationReviews: (planValidationsResult?.rows ?? []).length + (complianceChecksResult?.rows ?? []).length + (insuranceScopesResult?.rows ?? []).length,
      estimateVersions: (estimateVersionsResult?.rows ?? []).length,
      inventoryReservations: (inventoryReservationsResult?.rows ?? []).length,
      manualPrices: (manualPriceEntriesResult?.rows ?? []).length,
      substitutionReviews: (substitutionReviewsResult?.rows ?? []).length,
      deliveryReviews: (deliveryReviewsResult?.rows ?? []).length
    },
    takeoffs,
    warnings: (warningsResult?.rows ?? []).map((row) => ({
      id: row.id,
      severity: row.severity,
      message: row.message,
      status: row.status,
      createdAt: formatDate(row.created_at)
    })),
    quoteRequests: (quoteRequestsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.product_category_key.replaceAll("_", " "),
      detail: row.reason,
      status: row.status,
      tone: row.status === "expired" ? "high" : "medium",
      actionKind: "quote"
    })),
    inventoryMatches: (inventoryMatchesResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.inventory_name ?? "Possible stock match",
      detail: `${row.usable_quantity} usable of ${row.required_quantity} needed. Confirm spec, condition, and location.`,
      status: row.confidence,
      tone: row.confidence === "confirmed" ? "" : "medium",
      actionKind: "inventory"
    })),
    packageOptions: (packageOptionsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.option_name,
      detail: row.optimization_notes ?? "Package, quantity break, minimum order, delivery, and landed cost need supplier data.",
      status: row.package_strategy,
      tone: "medium",
      actionKind: "package"
    })),
    approvalRequirements: (approvalRequirementsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: `${row.role_required}: ${row.requirement_key.replaceAll("_", " ")}`,
      detail: row.reason,
      status: row.risk_level,
      tone: row.risk_level === "blocking" || row.risk_level === "high" ? "high" : "medium",
      actionKind: "approval"
    })),
    priceRefreshes: (priceRefreshesResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      detail: row.price_expires_at ? `Price expires ${formatDate(row.price_expires_at)}. Refresh before ordering.` : "Price needs refresh before ordering.",
      status: row.price_lock_status || row.pricing_confidence,
      tone: "high"
    })),
    changeOrders: (changeOrdersResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.title,
      detail: `${row.change_type.replaceAll("_", " ")} / ${formatMoney(row.amount_cents)}. Original estimate stays preserved.`,
      status: row.status,
      tone: row.status === "draft" ? "medium" : ""
    })),
    planValidations: (planValidationsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.validation_type.replaceAll("_", " "),
      detail: row.notes ?? "Plan scale, page scale, and dimensions need review.",
      status: row.confidence,
      tone: "medium"
    })),
    complianceChecks: (complianceChecksResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.check_type.replaceAll("_", " "),
      detail: row.notes ?? "Code, climate, warranty, manufacturer, permit, or structural information is not verified.",
      status: row.status,
      tone: row.status === "failed" ? "high" : "medium"
    })),
    insuranceScopes: (insuranceScopesResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.carrier || "Insurance scope",
      detail: row.scope_summary ?? "Insurance scope, supplement, deductible, depreciation, or Xactimate comparison needs review.",
      status: row.xactimate_comparison_status,
      tone: row.xactimate_comparison_status === "supplement_needed" ? "high" : "medium"
    })),
    estimateVersions: (estimateVersionsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: `${row.estimate_title ?? "Estimate"} v${row.version_number}`,
      detail: `${row.reason.replaceAll("_", " ")} / ${formatDate(row.created_at)}`,
      status: "saved",
      tone: ""
    })),
    inventoryReservations: (inventoryReservationsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.inventory_name ?? "Reserved stock",
      detail: `${row.reserved_quantity} reserved / ${formatDate(row.created_at)}`,
      status: row.status,
      tone: ""
    })),
    manualPriceEntries: (manualPriceEntriesResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.supplier_name ?? "Manual price",
      detail: `${formatMoney(row.unit_price_cents)} / ${row.price_type} / ${formatDate(row.created_at)}`,
      status: row.confidence,
      tone: row.confidence === "unverified" ? "medium" : ""
    })),
    substitutionReviews: (substitutionReviewsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.substitute_name ?? "Substitution review",
      detail: row.notes ?? "Compatibility, warranty, appearance, customer spec, and insurance status need review.",
      status: row.status,
      tone: "medium"
    })),
    deliveryReviews: (deliveryReviewsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.delivery_method ?? "Delivery review",
      detail: row.notes ?? `${formatMoney(row.landed_cost_cents)} landed cost / ${row.jobsite_access_status}`,
      status: row.status,
      tone: "medium"
    })),
    profiles: (profilesResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      tradeKey: row.trade_key,
      qualityLevel: row.quality_level,
      waste: percentFromBps(row.default_waste_bps),
      markup: percentFromBps(row.material_markup_bps)
    })),
    estimates: (estimatesResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: `${row.title} / ${row.customer_name}`
    })),
    customers: (customersResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.name
    })),
    takeoffItems: (takeoffItemsResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: `${row.label}${row.estimate_title ? ` / ${row.estimate_title}` : ""}`
    }))
  };
}
