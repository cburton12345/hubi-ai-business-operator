import type { QueryResultRow } from "pg";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import { requestMarketplaceProContractors } from "@/lib/integrations/marketplacepro-network-outbound";
import {
  MAINTENANCE_EVALUATION_VERSION,
  evaluateMaintenanceOpportunity,
  type MaintenanceOperatingPolicy,
  type MaintenanceOpportunityInput,
} from "./opportunity-evaluation";

type Query = <T extends QueryResultRow>(text: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null } | null>;

type OpportunityRow = {
  opportunity_id: string;
  tenant_id: string;
  brand_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  title: string;
  classification: MaintenanceOpportunityInput["classification"];
  workflow_status: string;
  trade: string | null;
  scope: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  deadline_at: string | null;
  customer_budget_cents: number | null;
  expected_contractor_cost_cents: number | null;
  materials_allowance_cents: number;
  additional_cost_cents: number;
  payment_terms_days: number | null;
  complexity_score: number | null;
  callback_risk_score: number | null;
  licensing_requirements: unknown;
  insurance_requirements: unknown;
  licensing_verified: boolean;
  insurance_verified: boolean;
  customer_authorized: boolean;
  contractor_confirmed: boolean;
  marketplacepro_labor_request_id: string | null;
  location_id: string | null;
  customer_name: string | null;
  minimum_margin_bps: number;
  minimum_contribution_cents: number;
  maximum_automatic_customer_value_cents: number;
  maximum_automatic_contractor_cost_cents: number;
  maximum_automatic_complexity: number;
  manager_escalation_value_cents: number;
  owner_escalation_value_cents: number;
  auto_sourcing_enabled: boolean;
  auto_work_order_creation_enabled: boolean;
  require_customer_authorization: boolean;
  require_contractor_confirmation: boolean;
  require_insurance_verification: boolean;
  require_license_verification: boolean;
  retry_limit: number;
  retry_base_minutes: number;
};

function policyFromRow(row: OpportunityRow): MaintenanceOperatingPolicy {
  return {
    minimumMarginBps: row.minimum_margin_bps,
    minimumContributionCents: row.minimum_contribution_cents,
    maximumAutomaticCustomerValueCents: row.maximum_automatic_customer_value_cents,
    maximumAutomaticContractorCostCents: row.maximum_automatic_contractor_cost_cents,
    maximumAutomaticComplexity: row.maximum_automatic_complexity,
    managerEscalationValueCents: row.manager_escalation_value_cents,
    ownerEscalationValueCents: row.owner_escalation_value_cents,
    autoSourcingEnabled: row.auto_sourcing_enabled,
    autoWorkOrderCreationEnabled: row.auto_work_order_creation_enabled,
    requireCustomerAuthorization: row.require_customer_authorization,
    requireContractorConfirmation: row.require_contractor_confirmation,
    requireInsuranceVerification: row.require_insurance_verification,
    requireLicenseVerification: row.require_license_verification,
  };
}

function arrayHasRequirements(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function objectHasRequirements(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0);
}

function inputFromRow(row: OpportunityRow): MaintenanceOpportunityInput {
  return {
    opportunityId: row.opportunity_id,
    classification: row.classification,
    customerId: row.customer_id,
    locationId: row.location_id,
    city: row.city,
    state: row.state,
    trade: row.trade,
    scope: row.scope,
    deadlineAt: row.deadline_at,
    customerBudgetCents: row.customer_budget_cents,
    expectedContractorCostCents: row.expected_contractor_cost_cents,
    materialsAllowanceCents: row.materials_allowance_cents,
    additionalCostCents: row.additional_cost_cents,
    paymentTermsDays: row.payment_terms_days,
    complexityScore: row.complexity_score,
    callbackRiskScore: row.callback_risk_score,
    licensingRequired: arrayHasRequirements(row.licensing_requirements),
    insuranceRequired: objectHasRequirements(row.insurance_requirements),
    licensingVerified: row.licensing_verified,
    insuranceVerified: row.insurance_verified,
    customerAuthorized: row.customer_authorized,
    contractorConfirmed: row.contractor_confirmed,
  };
}

function safeProviderError(error: unknown) {
  if (error instanceof Error && /not configured/i.test(error.message)) return "MarketplacePro sourcing is not configured.";
  if (error instanceof Error && /status \d{3}/i.test(error.message)) return error.message.slice(0, 300);
  return "MarketplacePro sourcing did not complete; the request is scheduled for a bounded retry.";
}

async function persistEvaluation(query: Query, row: OpportunityRow, evaluation: ReturnType<typeof evaluateMaintenanceOpportunity>) {
  const result = await query(
    `insert into public.maintenance_opportunity_evaluations (
       tenant_id,opportunity_id,classification,gross_contribution_cents,gross_margin_bps,risk_score,
       blocker_codes,warning_codes,recommended_action,policy_snapshot_json,input_snapshot_json,evaluation_version
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12)`,
    [row.tenant_id, row.opportunity_id, evaluation.classification, evaluation.grossContributionCents,
      evaluation.grossMarginBps, evaluation.riskScore, JSON.stringify(evaluation.blockerCodes),
      JSON.stringify(evaluation.warningCodes), evaluation.recommendedAction, JSON.stringify(policyFromRow(row)),
      JSON.stringify(inputFromRow(row)), MAINTENANCE_EVALUATION_VERSION],
  );
  if (!result) throw new Error("Maintenance evaluation could not be persisted.");
  await query(
    `update public.maintenance_opportunity_profiles
        set workflow_status=$3,last_evaluated_at=now(),updated_at=now()
      where tenant_id=$1 and opportunity_id=$2`,
    [row.tenant_id, row.opportunity_id,
      evaluation.classification === "unsuitable" ? "declined"
        : evaluation.recommendedAction === "source_contractors" ? "evaluated"
          : evaluation.workOrderReady ? "ready_for_authorization" : "needs_information"],
  );
}

async function ensureIntervention(query: Query, row: OpportunityRow, level: "manager" | "owner", reason: string) {
  await query(
    `insert into public.maintenance_interventions (
       tenant_id,opportunity_id,intervention_level,reason_code,summary,metadata_json
     ) select $1,$2,$3,$4,$5,$6::jsonb
       where not exists (
         select 1 from public.maintenance_interventions
          where tenant_id=$1 and opportunity_id=$2 and intervention_level=$3 and reason_code=$4
            and status in ('open','acknowledged')
       )`,
    [row.tenant_id, row.opportunity_id, level, reason,
      `${level === "owner" ? "Owner" : "Manager"} review is required before this opportunity can become binding work.`,
      JSON.stringify({ evaluationVersion: MAINTENANCE_EVALUATION_VERSION })],
  );
}

async function claimSourcingEvent(query: Query, row: OpportunityRow) {
  const key = `maintenance-source:${row.opportunity_id}:${MAINTENANCE_EVALUATION_VERSION}`;
  const inserted = await query<{ id: string; attempt_count: number }>(
    `insert into public.maintenance_orchestration_events (
       tenant_id,opportunity_id,action_type,status,idempotency_key,attempt_count,started_at
     ) values ($1,$2,'source_contractors','running',$3,1,now())
     on conflict (tenant_id,idempotency_key) do nothing
     returning id,attempt_count`,
    [row.tenant_id, row.opportunity_id, key],
  );
  if (inserted?.rows[0]) return inserted.rows[0];
  const retried = await query<{ id: string; attempt_count: number }>(
    `update public.maintenance_orchestration_events
        set status='running',attempt_count=attempt_count+1,started_at=now(),updated_at=now(),safe_error=null
      where tenant_id=$1 and idempotency_key=$2 and status='retry_scheduled'
        and retry_after<=now() and attempt_count<$3
      returning id,attempt_count`,
    [row.tenant_id, key, row.retry_limit],
  );
  return retried?.rows[0] ?? null;
}

async function sourceContractors(query: Query, row: OpportunityRow) {
  const event = await claimSourcingEvent(query, row);
  if (!event) return "skipped" as const;
  try {
    const response = await requestMarketplaceProContractors({
      externalOpportunityId: row.opportunity_id,
      externalEventId: `maintenance-source:${row.opportunity_id}:${MAINTENANCE_EVALUATION_VERSION}`,
      clientName: row.customer_name ?? "Ferocity customer",
      clientExternalId: row.customer_id ?? undefined,
      contactName: row.customer_name ?? "Ferocity operations",
      city: row.city!,
      state: row.state!,
      zip: row.postal_code ?? undefined,
      trades: [row.trade!],
      description: row.scope!,
      priority: row.deadline_at && Date.parse(row.deadline_at) - Date.now() <= 86_400_000 ? "urgent" : "normal",
      deadlineAt: row.deadline_at ?? undefined,
      customerBudget: row.customer_budget_cents === null ? undefined : row.customer_budget_cents / 100,
      expectedContractorCost: row.expected_contractor_cost_cents === null ? undefined : row.expected_contractor_cost_cents / 100,
      workersNeeded: 1,
      requiredInsurance: objectHasRequirements(row.insurance_requirements) ? row.insurance_requirements as Record<string, string | number | boolean> : {},
      licensingRequirements: arrayHasRequirements(row.licensing_requirements) ? row.licensing_requirements as string[] : [],
    });
    await query(
      `update public.maintenance_opportunity_profiles
          set marketplacepro_labor_request_id=$3,marketplacepro_status=$4,workflow_status='sourcing',
              marketplacepro_last_event_at=now(),last_orchestrated_at=now(),updated_at=now()
        where tenant_id=$1 and opportunity_id=$2`,
      [row.tenant_id, row.opportunity_id, response.id, response.opportunityStatus],
    );
    await query(
      `update public.maintenance_orchestration_events
          set status='succeeded',result_json=$3::jsonb,completed_at=now(),updated_at=now()
        where tenant_id=$1 and id=$2`,
      [row.tenant_id, event.id, JSON.stringify({ laborRequestId: response.id, duplicate: response.duplicate, accepted: false })],
    );
    return "succeeded" as const;
  } catch (error) {
    const retryMinutes = Math.min(1440, row.retry_base_minutes * (2 ** Math.max(0, event.attempt_count - 1)));
    const terminal = event.attempt_count >= row.retry_limit;
    await query(
      `update public.maintenance_orchestration_events
          set status=$3,safe_error=$4,retry_after=case when $3='retry_scheduled' then now()+($5::text||' minutes')::interval else null end,
              completed_at=case when $3='failed' then now() else null end,updated_at=now()
        where tenant_id=$1 and id=$2`,
      [row.tenant_id, event.id, terminal ? "failed" : "retry_scheduled", safeProviderError(error), retryMinutes],
    );
    return terminal ? "failed" as const : "retry_scheduled" as const;
  }
}

export async function runMaintenanceOpportunityOrchestration(input: { tenantId: string; limit?: number }, dependencies: { query?: Query } = {}) {
  const query = dependencies.query ?? queryPostgres;
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 100));
  const result = await query<OpportunityRow>(
    `select p.opportunity_id,p.tenant_id,o.brand_id,o.customer_id,o.lead_id,o.title,p.classification,p.workflow_status,
       p.trade,p.scope,p.city,p.state,p.postal_code,p.deadline_at,p.customer_budget_cents,p.expected_contractor_cost_cents,
       p.materials_allowance_cents,p.additional_cost_cents,p.payment_terms_days,p.complexity_score,p.callback_risk_score,
       p.licensing_requirements,p.insurance_requirements,p.licensing_verified,p.insurance_verified,p.customer_authorized,
       p.contractor_confirmed,p.marketplacepro_labor_request_id,l.id location_id,c.name customer_name,
       policy.minimum_margin_bps,policy.minimum_contribution_cents,policy.maximum_automatic_customer_value_cents,
       policy.maximum_automatic_contractor_cost_cents,policy.maximum_automatic_complexity,
       policy.manager_escalation_value_cents,policy.owner_escalation_value_cents,policy.auto_sourcing_enabled,
       policy.auto_work_order_creation_enabled,policy.require_customer_authorization,policy.require_contractor_confirmation,
       policy.require_insurance_verification,policy.require_license_verification,policy.retry_limit,policy.retry_base_minutes
     from public.maintenance_opportunity_profiles p
     join public.opportunities o on o.tenant_id=p.tenant_id and o.id=p.opportunity_id
     join public.maintenance_operating_policies policy on policy.tenant_id=p.tenant_id
     left join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id
     left join lateral (
       select id from public.customer_locations
        where tenant_id=o.tenant_id and customer_id=o.customer_id and active
        order by is_primary desc,created_at limit 1
     ) l on true
     where p.tenant_id=$1 and p.classification='commercial_maintenance'
       and p.workflow_status not in ('declined','converted','closed')
     order by coalesce(p.deadline_at,'infinity'::timestamptz),p.created_at
     limit $2`,
    [input.tenantId, limit],
  );
  if (!result) throw new Error("Maintenance opportunity queue could not be loaded.");

  const summary = { checked: 0, evaluated: 0, sourced: 0, retryScheduled: 0, failed: 0, escalatedToManager: 0, escalatedToOwner: 0 };
  for (const row of result.rows) {
    summary.checked += 1;
    const evaluation = evaluateMaintenanceOpportunity(inputFromRow(row), policyFromRow(row));
    await persistEvaluation(query, row, evaluation);
    summary.evaluated += 1;
    if (evaluation.interventionLevel === "owner") {
      await ensureIntervention(query, row, "owner", "financial_or_operational_exposure");
      summary.escalatedToOwner += 1;
    } else if (evaluation.interventionLevel === "manager") {
      await ensureIntervention(query, row, "manager", "operating_limit_exceeded");
      summary.escalatedToManager += 1;
    }
    if (evaluation.sourceReady && !row.marketplacepro_labor_request_id) {
      const sourcing = await sourceContractors(query, row);
      if (sourcing === "succeeded") summary.sourced += 1;
      if (sourcing === "retry_scheduled") summary.retryScheduled += 1;
      if (sourcing === "failed") summary.failed += 1;
    }
  }
  return summary;
}

export async function createAuthorizedMaintenanceWorkOrder(input: {
  tenantId: string;
  opportunityId: string;
  authorizedByUserId: string;
}) {
  return withPostgresTransactionResult(async (client) => {
    const result = await client.query<OpportunityRow>(
      `select p.opportunity_id,p.tenant_id,o.brand_id,o.customer_id,o.lead_id,o.title,p.classification,p.workflow_status,
         p.trade,p.scope,p.city,p.state,p.postal_code,p.deadline_at,p.customer_budget_cents,p.expected_contractor_cost_cents,
         p.materials_allowance_cents,p.additional_cost_cents,p.payment_terms_days,p.complexity_score,p.callback_risk_score,
         p.licensing_requirements,p.insurance_requirements,p.licensing_verified,p.insurance_verified,p.customer_authorized,
         p.contractor_confirmed,p.marketplacepro_labor_request_id,l.id location_id,c.name customer_name,
         policy.minimum_margin_bps,policy.minimum_contribution_cents,policy.maximum_automatic_customer_value_cents,
         policy.maximum_automatic_contractor_cost_cents,policy.maximum_automatic_complexity,
         policy.manager_escalation_value_cents,policy.owner_escalation_value_cents,policy.auto_sourcing_enabled,
         true as auto_work_order_creation_enabled,policy.require_customer_authorization,policy.require_contractor_confirmation,
         policy.require_insurance_verification,policy.require_license_verification,policy.retry_limit,policy.retry_base_minutes
       from public.maintenance_opportunity_profiles p
       join public.opportunities o on o.tenant_id=p.tenant_id and o.id=p.opportunity_id
       join public.maintenance_operating_policies policy on policy.tenant_id=p.tenant_id
       left join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id
       left join lateral (select id from public.customer_locations where tenant_id=o.tenant_id and customer_id=o.customer_id and active order by is_primary desc,created_at limit 1) l on true
       where p.tenant_id=$1 and p.opportunity_id=$2 for update of p,o`,
      [input.tenantId, input.opportunityId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Opportunity was not found.");
    if (row.workflow_status === "converted") return { status: "existing" as const, workOrderId: null };
    const evaluation = evaluateMaintenanceOpportunity(inputFromRow(row), policyFromRow(row));
    if (!evaluation.workOrderReady) throw new Error(`Opportunity is not authorized for conversion: ${evaluation.blockerCodes.join(", ") || evaluation.warningCodes.join(", ") || "operating policy review required"}.`);

    const job = await client.query<{ id: string }>(
      `insert into public.service_jobs (tenant_id,brand_id,customer_id,source_lead_id,title,status,service_address,service_area,location_id,opportunity_id,dispatcher_notes,ai_next_action)
       values ($1,$2,$3,$4,$5,'unscheduled',$6,$7,$8,$9,$10,'Schedule the verified contractor and confirm the customer arrival window.') returning id`,
      [row.tenant_id,row.brand_id,row.customer_id,row.lead_id,row.title,[row.city,row.state,row.postal_code].filter(Boolean).join(", "),`${row.city}, ${row.state}`,row.location_id,row.opportunity_id,row.scope],
    );
    const workOrder = await client.query<{ id: string }>(
      `insert into public.service_work_orders (
         tenant_id,brand_id,customer_id,location_id,source_lead_id,opportunity_id,service_job_id,external_key,work_order_number,
         title,service_type,description,status,priority,promised_by,completion_requirements_json,internal_notes,ai_next_action,metadata_json
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ready_to_schedule','normal',$13,$14::jsonb,$15,$16,$17::jsonb) returning id`,
      [row.tenant_id,row.brand_id,row.customer_id,row.location_id,row.lead_id,row.opportunity_id,job.rows[0].id,
        `maintenance-opportunity:${row.opportunity_id}`,`WO-${row.opportunity_id.replaceAll("-","").slice(0,10).toUpperCase()}`,row.title,row.trade,row.scope,row.deadline_at,
        JSON.stringify(["before_photos","after_photos","scope_completion","customer_confirmation"]),
        `Authorized from opportunity ${row.opportunity_id}. MarketplacePro request ${row.marketplacepro_labor_request_id}.`,
        "Confirm schedule and external contractor identity before dispatch.",
        JSON.stringify({ authorizedByUserId: input.authorizedByUserId, evaluationVersion: MAINTENANCE_EVALUATION_VERSION, marketplaceProLaborRequestId: row.marketplacepro_labor_request_id })],
    );
    await client.query(`update public.service_jobs set work_order_id=$3 where tenant_id=$1 and id=$2`,[row.tenant_id,job.rows[0].id,workOrder.rows[0].id]);
    await client.query(
      `insert into public.service_visits (tenant_id,brand_id,work_order_id,customer_id,location_id,service_job_id,external_key,title,service_type,status,priority,required_skills_json,required_certifications_json,field_instructions,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unscheduled','normal',$10::jsonb,$11::jsonb,$12,$13::jsonb)`,
      [row.tenant_id,row.brand_id,workOrder.rows[0].id,row.customer_id,row.location_id,job.rows[0].id,`maintenance-opportunity-visit:${row.opportunity_id}`,row.title,row.trade,
        JSON.stringify(row.trade ? [row.trade] : []),JSON.stringify(row.licensing_requirements),row.scope,JSON.stringify({ marketplaceProLaborRequestId: row.marketplacepro_labor_request_id })],
    );
    await client.query(`update public.maintenance_opportunity_profiles set workflow_status='converted',work_order_id=$3,last_orchestrated_at=now(),updated_at=now() where tenant_id=$1 and opportunity_id=$2`,[row.tenant_id,row.opportunity_id,workOrder.rows[0].id]);
    await client.query(`update public.opportunities set status='won',metadata_json=metadata_json||$3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,[row.tenant_id,row.opportunity_id,JSON.stringify({ maintenanceWorkOrderId: workOrder.rows[0].id, authorizedByUserId: input.authorizedByUserId })]);
    await client.query(
      `insert into public.service_operating_events (tenant_id,brand_id,customer_id,location_id,work_order_id,event_type,source_type,source_id,title,detail,next_state_json,metadata_json)
       values ($1,$2,$3,$4,$5,'opportunity_converted','user',$6,'Authorized maintenance opportunity converted','All profitability, contractor, compliance, and authorization gates passed.',$7::jsonb,$8::jsonb)`,
      [row.tenant_id,row.brand_id,row.customer_id,row.location_id,workOrder.rows[0].id,input.authorizedByUserId,JSON.stringify({ workOrderStatus: "ready_to_schedule" }),JSON.stringify({ opportunityId: row.opportunity_id, marketplaceProLaborRequestId: row.marketplacepro_labor_request_id })],
    );
    return { status: "created" as const, workOrderId: workOrder.rows[0].id, jobId: job.rows[0].id };
  });
}
