import { queryPostgres } from "@/lib/db/postgres";
import { buildReverseRevenuePlan, type ReverseRevenuePlanInput } from "./reverse-revenue-plan";
import { assessAdaptiveChannel, buildIncrementalSpendCheckpoints, type AdaptiveChannelAssessment, type CampaignSpendObservation, type ChannelOutcomeEvidence } from "./paid-media-orchestrator";
import { getPaidMediaProvider, type PaidMediaProviderKey } from "./paid-media-provider-registry";

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
  paidSpendCents?: number;
  paidSoldJobs?: number;
  paidEconomicsComplete?: boolean;
};

export function chooseGrowthDirective(signals: ControllerSignals): { directive: GrowthDirective; reasons: string[]; targetGapCents: number } {
  const reasons: string[] = [];
  const targetGapCents = Math.max(0, signals.targetCollectedRevenueCents - signals.collectedRevenueCents);
  const health = Math.round((Math.max(0, Math.min(100, signals.dataCompletenessScore)) + Math.max(0, Math.min(1, signals.attributionCoverageRate)) * 100) / 2);
  if (health < 50) return { directive: "repair_data", reasons: ["Core funnel or attribution evidence is too incomplete for safe demand changes."], targetGapCents };
  if ((signals.paidSpendCents ?? 0) > 0 && signals.paidEconomicsComplete === false) {
    return { directive: "repair_data", reasons: ["Paid spend exists, but source-to-cash revenue or gross-profit measurement is incomplete."], targetGapCents };
  }

  const remainingCapacity = signals.capacityAvailableJobs == null ? null : signals.capacityAvailableJobs - signals.committedJobs;
  if (remainingCapacity != null && remainingCapacity <= 0) reasons.push("Current delivery capacity is full.");
  if (signals.grossMarginRate != null && signals.minimumGrossMarginRate != null && signals.grossMarginRate < signals.minimumGrossMarginRate) reasons.push("Gross margin is below the owner-defined floor.");
  if (signals.customerAcquisitionCostCents != null && signals.maximumCustomerAcquisitionCostCents != null && signals.customerAcquisitionCostCents > signals.maximumCustomerAcquisitionCostCents) reasons.push("Customer acquisition cost is above the owner-defined ceiling.");
  if ((signals.paidSpendCents ?? 0) > 0 && signals.paidSoldJobs === 0) reasons.push("Paid spend has not produced an attributed sold job in the current period.");
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

type PaidMediaPeriodRow = {
  provider_key: string;
  comparison_period: "current" | "previous";
  spend_cents: string;
  leads: string;
  qualified_leads: string;
  booked_appointments: string;
  sold_jobs: string;
  revenue_cents: string;
  gross_profit_cents: string | null;
  profit_complete: boolean;
  attribution_confidence: string;
  sample_days: string;
};

type PaidCampaignObservationRow = {
  provider_key: string;
  external_entity_id: string;
  observed_at: string;
  spend_cents: string;
  qualified_leads: string;
  sold_jobs: string;
  revenue_cents: string;
  gross_profit_cents: string | null;
  attribution_confidence: string;
};

function toPaidEvidence(row: PaidMediaPeriodRow, capacityFit: number): ChannelOutcomeEvidence | null {
  if (!getPaidMediaProvider(row.provider_key)) return null;
  return {
    providerKey: row.provider_key as PaidMediaProviderKey,
    spendCents: Number(row.spend_cents ?? 0),
    leads: Number(row.leads ?? 0),
    qualifiedLeads: Number(row.qualified_leads ?? 0),
    bookedAppointments: Number(row.booked_appointments ?? 0),
    soldJobs: Number(row.sold_jobs ?? 0),
    revenueCents: Number(row.revenue_cents ?? 0),
    grossProfitCents: row.profit_complete ? Number(row.gross_profit_cents ?? 0) : undefined,
    attributionConfidence: Number(row.attribution_confidence ?? 0),
    sampleDays: Number(row.sample_days ?? 0),
    capacityFit,
    eligible: true
  };
}

async function loadAdaptivePaidMedia(input: {
  tenantId: string;
  brandId: string;
  capacityFit: number;
  maximumCustomerAcquisitionCostCents: number | null;
}) {
  const result = await queryPostgres<PaidMediaPeriodRow>(`
    select provider_key,
      case when period_start >= now()-interval '30 days' then 'current' else 'previous' end comparison_period,
      coalesce(sum(spend_cents),0)::text spend_cents,
      coalesce(sum(ferocity_leads),0)::text leads,
      coalesce(sum(qualified_leads),0)::text qualified_leads,
      coalesce(sum(booked_appointments),0)::text booked_appointments,
      coalesce(sum(sold_jobs),0)::text sold_jobs,
      coalesce(sum(attributed_revenue_cents),0)::text revenue_cents,
      case when bool_and(attributed_gross_profit_cents is not null) then coalesce(sum(attributed_gross_profit_cents),0)::text else null end gross_profit_cents,
      bool_and(attributed_gross_profit_cents is not null) profit_complete,
      coalesce(sum(attribution_confidence * greatest(spend_cents,1)) / nullif(sum(greatest(spend_cents,1)),0),0)::text attribution_confidence,
      count(distinct period_start::date)::text sample_days
    from public.paid_media_performance_snapshots
    where tenant_id=$1 and connection_id in (
      select id from public.paid_media_connections where tenant_id=$1 and brand_id=$2
    ) and entity_type='account' and period_start >= now()-interval '60 days' and period_start < now()
    group by provider_key, comparison_period
  `, [input.tenantId, input.brandId]);
  const campaignResult = await queryPostgres<PaidCampaignObservationRow>(`
    select snapshot.provider_key,snapshot.external_entity_id,snapshot.period_end::text observed_at,
      snapshot.spend_cents::text,snapshot.qualified_leads::text,snapshot.sold_jobs::text,
      snapshot.attributed_revenue_cents::text,snapshot.attributed_gross_profit_cents::text gross_profit_cents,
      snapshot.attribution_confidence::text
    from public.paid_media_performance_snapshots snapshot
    where snapshot.tenant_id=$1 and snapshot.connection_id in (
      select id from public.paid_media_connections where tenant_id=$1 and brand_id=$2
    ) and snapshot.entity_type='campaign' and snapshot.period_start>=now()-interval '30 days' and snapshot.period_start<now()
    order by snapshot.provider_key,snapshot.external_entity_id,snapshot.period_start
    limit 2000
  `, [input.tenantId, input.brandId]);
  const evidence = (result?.rows ?? []).map((row) => ({ row, value: toPaidEvidence(row, input.capacityFit) })).filter((item): item is { row: PaidMediaPeriodRow; value: ChannelOutcomeEvidence } => item.value != null);
  const current = evidence.filter((item) => item.row.comparison_period === "current").map((item) => item.value);
  const previous = new Map(evidence.filter((item) => item.row.comparison_period === "previous").map((item) => [item.value.providerKey, item.value]));
  const assessments: AdaptiveChannelAssessment[] = current.map((item) => assessAdaptiveChannel({
    current: item,
    previous: previous.get(item.providerKey),
    maximumCustomerAcquisitionCostCents: input.maximumCustomerAcquisitionCostCents
  }));
  const groupedCampaigns = new Map<string, CampaignSpendObservation[]>();
  for (const row of campaignResult?.rows ?? []) {
    if (!getPaidMediaProvider(row.provider_key)) continue;
    const key = `${row.provider_key}:${row.external_entity_id}`;
    const observations = groupedCampaigns.get(key) ?? [];
    observations.push({
      observedAt: row.observed_at,
      spendCents: Number(row.spend_cents ?? 0),
      qualifiedLeads: Number(row.qualified_leads ?? 0),
      soldJobs: Number(row.sold_jobs ?? 0),
      revenueCents: Number(row.revenue_cents ?? 0),
      grossProfitCents: row.gross_profit_cents == null ? undefined : Number(row.gross_profit_cents),
      attributionConfidence: Number(row.attribution_confidence ?? 0)
    });
    groupedCampaigns.set(key, observations);
  }
  const campaignCheckpoints = [...groupedCampaigns.entries()].flatMap(([campaignKey, observations]) =>
    buildIncrementalSpendCheckpoints({ observations }).map((checkpoint) => ({ campaignKey, ...checkpoint }))
  ).sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime()).slice(0, 200);
  return { current, assessments, campaignCheckpoints };
}

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
        (select coalesce(sum(greatest(amount_cents-refunded_amount_cents,0)),0) from public.service_invoice_payments where tenant_id=$1 and brand_id=$2 and status in ('succeeded','manual','partially_refunded','refunded') and received_at >= now()-interval '90 days')::text collected,
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
    const remainingCapacity = objective.monthly_job_capacity == null ? null : objective.monthly_job_capacity - Number(m.committed_jobs ?? 0);
    const paidMedia = await loadAdaptivePaidMedia({
      tenantId: input.tenantId,
      brandId: objective.brand_id,
      capacityFit: remainingCapacity == null || remainingCapacity > 0 ? 1 : 0,
      maximumCustomerAcquisitionCostCents: objective.maximum_cac_cents
    });
    const paidTotals = paidMedia.current.reduce((totals, item) => ({
      spendCents: totals.spendCents + item.spendCents,
      soldJobs: totals.soldJobs + item.soldJobs,
      revenueCents: totals.revenueCents + item.revenueCents,
      grossProfitCents: totals.grossProfitCents + (item.grossProfitCents ?? 0),
      profitComplete: totals.profitComplete && item.grossProfitCents != null
    }), { spendCents: 0, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, profitComplete: true });
    const actualRoas = paidTotals.spendCents > 0 ? paidTotals.revenueCents / paidTotals.spendCents : null;
    const actualCac = paidTotals.spendCents > 0 && paidTotals.soldJobs > 0 ? paidTotals.spendCents / paidTotals.soldJobs : null;
    const actualGrossMargin = paidTotals.revenueCents > 0 && paidTotals.profitComplete ? paidTotals.grossProfitCents / paidTotals.revenueCents : null;
    const nonZeroSignals = [leads, qualified, appointments, shows, estimates, jobs, Number(m.collected ?? 0)].filter((value) => value > 0).length;
    const signals: ControllerSignals = {
      targetCollectedRevenueCents: planInput.targetCollectedRevenueCents,
      collectedRevenueCents: Number(m.collected ?? 0), dataCompletenessScore: Math.round(nonZeroSignals / 7 * 100),
      attributionCoverageRate: leads ? Math.min(1, Number(m.attributed_leads ?? 0) / leads) : 0,
      capacityAvailableJobs: objective.monthly_job_capacity, committedJobs: Number(m.committed_jobs ?? 0),
      grossMarginRate: actualGrossMargin, minimumGrossMarginRate: objective.minimum_gross_margin_bps == null ? null : objective.minimum_gross_margin_bps / 10_000,
      customerAcquisitionCostCents: actualCac, maximumCustomerAcquisitionCostCents: objective.maximum_cac_cents,
      returnOnAdSpend: actualRoas, minimumReturnOnAdSpend: objective.minimum_roas_milli == null ? null : objective.minimum_roas_milli / 1000,
      paidSpendCents: paidTotals.spendCents, paidSoldJobs: paidTotals.soldJobs,
      paidEconomicsComplete: paidTotals.spendCents === 0 || (paidTotals.profitComplete && paidMedia.current.every((item) => item.attributionConfidence >= 0.5))
    };
    const decision = chooseGrowthDirective(signals);
    const economics = { ...plan.economics, actualPaid: { ...paidTotals, returnOnAdSpend: actualRoas, customerAcquisitionCostCents: actualCac, grossMarginRate: actualGrossMargin } };
    await queryPostgres(`insert into public.growth_controller_snapshots (tenant_id,brand_id,objective_id,directive,target_gap_cents,data_health_score,capacity_json,economics_json,reverse_plan_json,reasons_json,evidence_json) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)`, [input.tenantId, objective.brand_id, objective.id, decision.directive, decision.targetGapCents, Math.round((signals.dataCompletenessScore + signals.attributionCoverageRate * 100) / 2), JSON.stringify(plan.capacity), JSON.stringify(economics), JSON.stringify(plan), JSON.stringify(decision.reasons), JSON.stringify({ funnelWindowDays: 90, paidComparisonWindowDays: 30, campaignSpendMilestoneCents: 500, leads, qualified, appointments, shows, estimates, jobs, collectedCents: signals.collectedRevenueCents, attributedLeads: Number(m.attributed_leads ?? 0), channelAssessments: paidMedia.assessments, campaignCheckpoints: paidMedia.campaignCheckpoints })]);
    results.push({ objectiveId: objective.id, directive: decision.directive, reasons: decision.reasons });
  }
  return { processed: results.length, results };
}
