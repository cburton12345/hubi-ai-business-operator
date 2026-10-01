import { queryPostgres } from "@/lib/db/postgres";
import { buildReverseRevenuePlan, type ReverseRevenuePlanInput } from "./reverse-revenue-plan";

export type GrowthDirective = "expand" | "hold" | "constrain" | "repair_data";

export type ControllerSignals = {
  targetCollectedRevenueCents: number;
  collectedRevenueCents: number;
  dataCompletenessScore: number;
  attributionCoverageRate: number;
  capacityAvailableJobs: number | null;
  committedJobs: number;
  grossMarginRate: number | null;
  minimumGrossMarginRate: number | null;
  customerAcquisitionCostCents: number | null;
  maximumCustomerAcquisitionCostCents: number | null;
  returnOnAdSpend: number | null;
  minimumReturnOnAdSpend: number | null;
};

export function chooseGrowthDirective(signals: ControllerSignals): { directive: GrowthDirective; reasons: string[]; targetGapCents: number } {
  const reasons: string[] = [];
  const targetGapCents = Math.max(0, signals.targetCollectedRevenueCents - signals.collectedRevenueCents);
  const health = Math.round((Math.max(0, Math.min(100, signals.dataCompletenessScore)) + Math.max(0, Math.min(1, signals.attributionCoverageRate)) * 100) / 2);
  if (health < 50) return { directive: "repair_data", reasons: ["Core funnel or attribution evidence is too incomplete for safe demand changes."], targetGapCents };

  const remainingCapacity = signals.capacityAvailableJobs == null ? null : signals.capacityAvailableJobs - signals.committedJobs;
  if (remainingCapacity != null && remainingCapacity <= 0) reasons.push("Current delivery capacity is full.");
  if (signals.grossMarginRate != null && signals.minimumGrossMarginRate != null && signals.grossMarginRate < signals.minimumGrossMarginRate) reasons.push("Gross margin is below the owner-defined floor.");
  if (signals.customerAcquisitionCostCents != null && signals.maximumCustomerAcquisitionCostCents != null && signals.customerAcquisitionCostCents > signals.maximumCustomerAcquisitionCostCents) reasons.push("Customer acquisition cost is above the owner-defined ceiling.");
  if (signals.returnOnAdSpend != null && signals.minimumReturnOnAdSpend != null && signals.returnOnAdSpend < signals.minimumReturnOnAdSpend) reasons.push("Return on ad spend is below the owner-defined floor.");
  if (reasons.length) return { directive: "constrain", reasons, targetGapCents };

  if (targetGapCents > 0 && health >= 70 && (remainingCapacity == null || remainingCapacity > 0)) {
    return { directive: "expand", reasons: ["Revenue remains below target, evidence quality is sufficient, and delivery capacity is available."], targetGapCents };
  }
  return { directive: "hold", reasons: [targetGapCents === 0 ? "The collected-revenue target is met." : "Keep learning and improving conversion before adding demand."], targetGapCents };
}

type ObjectiveRow = {
  id: string; tenant_id: string; brand_id: string; target_revenue_cents: number | null; target_collected_revenue_cents: number | null;
  target_gross_profit_cents: number | null; average_job_value_cents: number | null; gross_margin_target_bps: number | null;
  minimum_gross_margin_bps: number | null; maximum_cac_cents: number | null; minimum_roas_milli: number | null;
  monthly_job_capacity: number | null; cost_per_lead_cents: number | null;
};

export async function runClosedLoopGrowthController(input: { tenantId: string; brandId?: string | null }) {
  const objectives = await queryPostgres<ObjectiveRow>(`
    select id, tenant_id, brand_id, target_revenue_cents, target_collected_revenue_cents, target_gross_profit_cents,
      average_job_value_cents, gross_margin_target_bps, minimum_gross_margin_bps, maximum_cac_cents,
      minimum_roas_milli, monthly_job_capacity, cost_per_lead_cents
    from public.growth_objectives
    where tenant_id=$1 and status='active' and ($2::uuid is null or brand_id=$2::uuid)
    order by updated_at desc limit 20
  `, [input.tenantId, input.brandId ?? null]);
  const results: Array<{ objectiveId: string; directive: GrowthDirective; reasons: string[] }> = [];

  for (const objective of objectives?.rows ?? []) {
    const metrics = await queryPostgres<Record<string, string>>(`
      select
        (select count(*) from public.leads where tenant_id=$1 and brand_id=$2 and created_at >= now()-interval '90 days')::text leads,
        (select count(*) from public.revenue_lead_scores where tenant_id=$1 and brand_id=$2 and qualification_status='qualified' and updated_at >= now()-interval '90 days')::text qualified,
        (select count(*) from public.revenue_appointments where tenant_id=$1 and brand_id=$2 and created_at >= now()-interval '90 days')::text appointments,
        (select count(*) from public.revenue_appointments where tenant_id=$1 and brand_id=$2 and status in ('showed','completed') and created_at >= now()-interval '90 days')::text shows,
        (select count(*) from public.service_estimates where tenant_id=$1 and brand_id=$2 and created_at >= now()-interval '90 days')::text estimates,
        (select count(*) from public.service_jobs where tenant_id=$1 and brand_id=$2 and created_at >= now()-interval '90 days')::text jobs,
        (select count(*) from public.service_jobs where tenant_id=$1 and brand_id=$2 and status not in ('completed','canceled','lost'))::text committed_jobs,
        (select coalesce(sum(amount_cents),0) from public.service_invoice_payments where tenant_id=$1 and brand_id=$2 and status in ('succeeded','manual') and received_at >= now()-interval '90 days')::text collected,
        (select count(distinct lead_id) from public.growth_attribution_touches where tenant_id=$1 and brand_id=$2 and lead_id is not null and occurred_at >= now()-interval '90 days')::text attributed_leads
    `, [input.tenantId, objective.brand_id]);
    const m = metrics?.rows[0] ?? {};
    const leads = Number(m.leads ?? 0), qualified = Number(m.qualified ?? 0), appointments = Number(m.appointments ?? 0), shows = Number(m.shows ?? 0), estimates = Number(m.estimates ?? 0), jobs = Number(m.jobs ?? 0);
    const observed = (numerator: number, denominator: number) => denominator > 0 ? { rate: numerator / denominator, sampleSize: denominator, source: "observed" as const } : undefined;
    const planInput: ReverseRevenuePlanInput = {
      targetCollectedRevenueCents: objective.target_collected_revenue_cents ?? objective.target_revenue_cents ?? 0,
      targetGrossProfitCents: objective.target_gross_profit_cents,
      averageCollectedJobCents: objective.average_job_value_cents,
      grossMarginRate: objective.gross_margin_target_bps == null ? null : objective.gross_margin_target_bps / 10_000,
      costPerLeadCents: objective.cost_per_lead_cents,
      availableJobCapacity: objective.monthly_job_capacity,
      currentCommittedJobs: Number(m.committed_jobs ?? 0),
      rates: { leadToQualified: observed(qualified, leads), qualifiedToAppointment: observed(appointments, qualified), appointmentToShow: observed(shows, appointments), showToEstimate: observed(estimates, shows), estimateToWin: observed(jobs, estimates) }
    };
    const plan = buildReverseRevenuePlan(planInput);
    const nonZeroSignals = [leads, qualified, appointments, shows, estimates, jobs, Number(m.collected ?? 0)].filter((value) => value > 0).length;
    const signals: ControllerSignals = {
      targetCollectedRevenueCents: planInput.targetCollectedRevenueCents,
      collectedRevenueCents: Number(m.collected ?? 0), dataCompletenessScore: Math.round(nonZeroSignals / 7 * 100),
      attributionCoverageRate: leads ? Math.min(1, Number(m.attributed_leads ?? 0) / leads) : 0,
      capacityAvailableJobs: objective.monthly_job_capacity, committedJobs: Number(m.committed_jobs ?? 0),
      grossMarginRate: null, minimumGrossMarginRate: objective.minimum_gross_margin_bps == null ? null : objective.minimum_gross_margin_bps / 10_000,
      customerAcquisitionCostCents: null, maximumCustomerAcquisitionCostCents: objective.maximum_cac_cents,
      returnOnAdSpend: plan.economics.projectedRoas, minimumReturnOnAdSpend: objective.minimum_roas_milli == null ? null : objective.minimum_roas_milli / 1000
    };
    const decision = chooseGrowthDirective(signals);
    await queryPostgres(`insert into public.growth_controller_snapshots (tenant_id,brand_id,objective_id,directive,target_gap_cents,data_health_score,capacity_json,economics_json,reverse_plan_json,reasons_json,evidence_json) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)`, [input.tenantId, objective.brand_id, objective.id, decision.directive, decision.targetGapCents, Math.round((signals.dataCompletenessScore + signals.attributionCoverageRate * 100) / 2), JSON.stringify(plan.capacity), JSON.stringify(plan.economics), JSON.stringify(plan), JSON.stringify(decision.reasons), JSON.stringify({ windowDays: 90, leads, qualified, appointments, shows, estimates, jobs, collectedCents: signals.collectedRevenueCents, attributedLeads: Number(m.attributed_leads ?? 0) })]);
    results.push({ objectiveId: objective.id, directive: decision.directive, reasons: decision.reasons });
  }
  return { processed: results.length, results };
}
