import "server-only";

import { queryPostgresRequired } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MaintenanceOpportunityListItem = {
  id: string;
  title: string;
  canonicalStatus: string;
  source: string;
  customerName: string;
  location: string;
  classification: string;
  workflowStatus: string;
  trade: string;
  deadlineAt: string | null;
  customerBudgetCents: number | null;
  expectedContractorCostCents: number | null;
  grossContributionCents: number | null;
  grossMarginBps: number | null;
  evaluation: string;
  riskScore: number | null;
  marketplaceStatus: string;
  laborRequestId: string | null;
  contractorConfirmed: boolean;
  workOrderId: string | null;
  createdAt: string;
};

export async function getMaintenanceOpportunitiesDashboard(input: {
  query?: string;
  classification?: string;
  status?: string;
  sort?: string;
} = {}) {
  const tenantId = await getCurrentWorkspaceId();
  const search = input.query?.trim().slice(0, 120) || null;
  const classification = input.classification && input.classification !== "all" ? input.classification : null;
  const status = input.status && input.status !== "all" ? input.status : null;
  const sortSql = input.sort === "value_desc"
    ? "coalesce(p.customer_budget_cents,o.value_cents) desc,o.created_at desc"
    : input.sort === "deadline"
      ? "p.deadline_at asc nulls last,o.created_at desc"
      : input.sort === "risk_desc"
        ? "evaluation.risk_score desc nulls last,o.created_at desc"
        : "o.created_at desc";
  const result = await queryPostgresRequired<{
    id: string; title: string; canonical_status: string; source: string | null; customer_name: string | null;
    city: string | null; state: string | null; classification: string | null; workflow_status: string | null;
    trade: string | null; deadline_at: string | null; customer_budget_cents: number | null;
    expected_contractor_cost_cents: number | null; gross_contribution_cents: number | null;
    gross_margin_bps: number | null; evaluation_classification: string | null; risk_score: number | null;
    marketplacepro_status: string | null; marketplacepro_labor_request_id: string | null;
    contractor_confirmed: boolean | null; work_order_id: string | null; created_at: string;
  }>(
    `select o.id,o.title,o.status canonical_status,o.source,c.name customer_name,
       coalesce(p.city,c.city) city,coalesce(p.state,c.state) state,p.classification,p.workflow_status,p.trade,p.deadline_at,
       coalesce(p.customer_budget_cents,o.value_cents) customer_budget_cents,p.expected_contractor_cost_cents,
       evaluation.gross_contribution_cents,evaluation.gross_margin_bps,evaluation.classification evaluation_classification,
       evaluation.risk_score,p.marketplacepro_status,p.marketplacepro_labor_request_id,p.contractor_confirmed,p.work_order_id,o.created_at
     from public.opportunities o
     left join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id
     left join public.maintenance_opportunity_profiles p on p.tenant_id=o.tenant_id and p.opportunity_id=o.id
     left join lateral (
       select classification,gross_contribution_cents,gross_margin_bps,risk_score
       from public.maintenance_opportunity_evaluations e
       where e.tenant_id=o.tenant_id and e.opportunity_id=o.id
       order by e.created_at desc limit 1
     ) evaluation on true
     where o.tenant_id=$1
       and ($2::text is null or o.title ilike '%'||$2||'%' or coalesce(c.name,'') ilike '%'||$2||'%' or coalesce(p.trade,'') ilike '%'||$2||'%')
       and ($3::text is null or coalesce(p.classification,'unclassified')=$3)
       and ($4::text is null or coalesce(p.workflow_status,'received')=$4)
     order by ${sortSql}
     limit 250`,
    [tenantId, search, classification, status],
    "maintenance-opportunities-dashboard",
  );
  const rows: MaintenanceOpportunityListItem[] = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    canonicalStatus: row.canonical_status,
    source: row.source ?? "unknown",
    customerName: row.customer_name ?? "No customer linked",
    location: [row.city, row.state].filter(Boolean).join(", ") || "Location missing",
    classification: row.classification ?? "unclassified",
    workflowStatus: row.workflow_status ?? "received",
    trade: row.trade ?? "Trade missing",
    deadlineAt: row.deadline_at,
    customerBudgetCents: row.customer_budget_cents,
    expectedContractorCostCents: row.expected_contractor_cost_cents,
    grossContributionCents: row.gross_contribution_cents,
    grossMarginBps: row.gross_margin_bps,
    evaluation: row.evaluation_classification ?? "not_evaluated",
    riskScore: row.risk_score,
    marketplaceStatus: row.marketplacepro_status ?? "not_requested",
    laborRequestId: row.marketplacepro_labor_request_id,
    contractorConfirmed: row.contractor_confirmed ?? false,
    workOrderId: row.work_order_id,
    createdAt: row.created_at,
  }));
  return {
    opportunities: rows,
    metrics: {
      total: rows.length,
      commercialMaintenance: rows.filter((row) => row.classification === "commercial_maintenance").length,
      needsInformation: rows.filter((row) => row.workflowStatus === "needs_information").length,
      sourcing: rows.filter((row) => ["sourcing", "recruiting", "contractor_identified"].includes(row.workflowStatus)).length,
      ready: rows.filter((row) => row.workflowStatus === "ready_for_authorization").length,
      converted: rows.filter((row) => row.workflowStatus === "converted").length,
    },
  };
}

export async function getMaintenanceOpportunityDetail(opportunityId: string) {
  const tenantId = await getCurrentWorkspaceId();
  const [opportunityResult, evaluationResult, eventResult, interventionResult, customerResult] = await Promise.all([
    queryPostgresRequired<Record<string, unknown>>(
      `select o.*,c.name customer_name,c.email customer_email,c.phone customer_phone,
         p.classification,p.workflow_status,p.trade,p.scope,p.service_address,p.city service_city,p.state service_state,
         p.postal_code,p.deadline_at,p.customer_budget_cents,p.expected_contractor_cost_cents,p.materials_allowance_cents,
         p.additional_cost_cents,p.payment_terms_days,p.complexity_score,p.callback_risk_score,p.licensing_requirements,
         p.insurance_requirements,p.licensing_verified,p.insurance_verified,p.customer_authorized,p.contractor_confirmed,
         p.marketplacepro_labor_request_id,p.marketplacepro_status,p.marketplacepro_last_event_at,p.work_order_id,
         l.message lead_message,l.lead_type,l.metadata_json lead_metadata
       from public.opportunities o
       left join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id
       left join public.leads l on l.tenant_id=o.tenant_id and l.id=o.lead_id
       left join public.maintenance_opportunity_profiles p on p.tenant_id=o.tenant_id and p.opportunity_id=o.id
       where o.tenant_id=$1 and o.id=$2 limit 1`,
      [tenantId, opportunityId], "maintenance-opportunity-detail",
    ),
    queryPostgresRequired<Record<string, unknown>>(
      `select * from public.maintenance_opportunity_evaluations where tenant_id=$1 and opportunity_id=$2 order by created_at desc limit 20`,
      [tenantId, opportunityId], "maintenance-opportunity-evaluations",
    ),
    queryPostgresRequired<Record<string, unknown>>(
      `select * from public.maintenance_orchestration_events where tenant_id=$1 and opportunity_id=$2 order by created_at desc limit 50`,
      [tenantId, opportunityId], "maintenance-opportunity-events",
    ),
    queryPostgresRequired<Record<string, unknown>>(
      `select * from public.maintenance_interventions where tenant_id=$1 and opportunity_id=$2 order by opened_at desc limit 50`,
      [tenantId, opportunityId], "maintenance-opportunity-interventions",
    ),
    queryPostgresRequired<{ id: string; name: string }>(
      `select id,name from public.customers where tenant_id=$1 and status<>'archived' order by name limit 500`,
      [tenantId], "maintenance-opportunity-customers",
    ),
  ]);
  return {
    opportunity: opportunityResult.rows[0] ?? null,
    evaluations: evaluationResult.rows,
    events: eventResult.rows,
    interventions: interventionResult.rows,
    customers: customerResult.rows,
  };
}
