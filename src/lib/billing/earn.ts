import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export const EARN_AGREEMENT_VERSION = "earn-v1-2026-08-16";
export const EARN_RATES_BPS = {
  CUSTOMER_ORIGINATED_FEROCITY_MANAGED: 90,
  FEROCITY_ORIGINATED: 600,
  NON_EARN: 0,
  NEEDS_REVIEW: 0
} as const;

export type EarnClassification = keyof typeof EARN_RATES_BPS;

export function calculateEarnCents(eligibleCents: number, rateBps: number) {
  if (!Number.isSafeInteger(eligibleCents) || eligibleCents < 0) throw new Error("eligibleCents must be a non-negative safe integer");
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) throw new Error("rateBps must be a non-negative safe integer");
  return Math.floor((eligibleCents * rateBps + 5_000) / 10_000);
}

export function rateForClassification(classification: EarnClassification) {
  return EARN_RATES_BPS[classification];
}

export function nextSettlementDate(settlementDay: number, from = new Date()) {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const thisMonth = new Date(Date.UTC(year, month, settlementDay));
  return (thisMonth.getTime() > from.getTime() ? thisMonth : new Date(Date.UTC(year, month + 1, settlementDay))).toISOString();
}

type EnrollmentRow = {
  status: string;
  agreement_version: string;
  effective_at: Date | null;
  terminated_at: Date | null;
  settlement_day: number;
};

type SummaryRow = {
  managed_revenue_cents: string;
  managed_earn_cents: string;
  originated_revenue_cents: string;
  originated_earn_cents: string;
  adjustments_cents: string;
  disputed_cents: string;
  current_balance_cents: string;
  lifetime_originated_revenue_cents: string;
};

export type EarnDashboard = {
  enrollment: null | {
    status: string;
    agreementVersion: string;
    effectiveAt: string | null;
    terminatedAt: string | null;
    settlementDay: number;
    nextSettlementAt: string;
  };
  currentPeriod: {
    managedRevenueCents: number;
    managedEarnCents: number;
    originatedRevenueCents: number;
    originatedEarnCents: number;
    adjustmentsCents: number;
    disputedCents: number;
    currentBalanceCents: number;
    providerUsageCents: number;
  };
  lifetimeOriginatedRevenueCents: number;
  opportunities: Array<{
    id: string;
    attributionId: string | null;
    title: string;
    customerName: string;
    valueCents: number;
    classification: EarnClassification | null;
    lockedRateBps: number | null;
    reason: string | null;
    sourceChannel: string | null;
    attributedAt: string | null;
    collectedEligibleCents: number;
    earnAccruedCents: number;
    projectedEarnCents: number;
  }>;
  recentLedger: Array<{
    id: string;
    paymentId: string | null;
    opportunityTitle: string;
    customerName: string;
    eventType: string;
    eligibleAmountCents: number;
    earnAmountCents: number;
    classification: string;
    rateBps: number;
    reason: string;
    settlementStatus: string;
    occurredAt: string;
  }>;
  disputes: Array<{
    id: string;
    type: string;
    reason: string;
    amountCents: number;
    status: string;
    createdAt: string;
  }>;
};

export async function getEarnDashboard(): Promise<EarnDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [enrollmentResult, summaryResult, providerResult, opportunitiesResult, ledgerResult, disputesResult] = await Promise.all([
    queryPostgres<EnrollmentRow>(
      `select status,agreement_version,effective_at,terminated_at,settlement_day from public.earn_enrollments where tenant_id=$1`,
      [tenantId]
    ),
    queryPostgres<SummaryRow>(
      `select
        coalesce(sum(eligible_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED' and event_type in ('eligible_payment','refund','chargeback','exclusion','correction')),0)::text managed_revenue_cents,
        coalesce(sum(earn_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and classification='CUSTOMER_ORIGINATED_FEROCITY_MANAGED'),0)::text managed_earn_cents,
        coalesce(sum(eligible_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and classification='FEROCITY_ORIGINATED' and event_type in ('eligible_payment','refund','chargeback','exclusion','correction')),0)::text originated_revenue_cents,
        coalesce(sum(earn_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and classification='FEROCITY_ORIGINATED'),0)::text originated_earn_cents,
        coalesce(sum(earn_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and event_type in ('earn_credit','correction','manual_adjustment','reversal')),0)::text adjustments_cents,
        coalesce(sum(earn_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and settlement_status='disputed'),0)::text disputed_cents,
        coalesce(sum(earn_amount_cents) filter (where billing_period_start=date_trunc('month',current_date)::date and settlement_status in ('unsettled','scheduled','failed')),0)::text current_balance_cents,
        coalesce(sum(eligible_amount_cents) filter (where classification='FEROCITY_ORIGINATED' and event_type in ('eligible_payment','refund','chargeback','exclusion','correction')),0)::text lifetime_originated_revenue_cents
       from public.earn_ledger_entries
       where tenant_id=$1`,
      [tenantId]
    ),
    queryPostgres<{ provider_usage_cents: string }>(
      `select coalesce(sum(amount_cents),0)::text provider_usage_cents from public.billing_usage_charges
       where tenant_id=$1 and created_at>=date_trunc('month',now()) and status not in ('void','failed')`,
      [tenantId]
    ),
    queryPostgres<{
      id: string; title: string; customer_name: string; value_cents: number; attribution_id: string | null; classification: EarnClassification | null;
      locked_rate_bps: number | null; attribution_reason: string | null; source_channel: string | null; attributed_at: Date | null;
      collected_eligible_cents: string; earn_accrued_cents: string;
    }>(
      `select o.id,o.title,coalesce(c.name,'Unknown customer') customer_name,o.value_cents,
        a.id attribution_id,a.classification,a.locked_rate_bps,a.attribution_reason,a.source_channel,a.attributed_at,
        coalesce(sum(l.eligible_amount_cents),0)::text collected_eligible_cents,
        coalesce(sum(l.earn_amount_cents),0)::text earn_accrued_cents
       from public.opportunities o
       left join public.customers c on c.id=o.customer_id
       left join public.earn_attributions a on a.tenant_id=o.tenant_id and a.opportunity_id=o.id
       left join public.earn_ledger_entries l on l.tenant_id=o.tenant_id and l.opportunity_id=o.id
       where o.tenant_id=$1 and o.status<>'archived'
       group by o.id,o.title,c.name,o.value_cents,a.id,a.classification,a.locked_rate_bps,a.attribution_reason,a.source_channel,a.attributed_at
       order by coalesce(a.attributed_at,o.created_at) desc limit 40`,
      [tenantId]
    ),
    queryPostgres<{
      id: string; payment_id: string | null; opportunity_title: string; customer_name: string; event_type: string; eligible_amount_cents: string;
      earn_amount_cents: string; classification: string; locked_rate_bps: number; reason: string; settlement_status: string; occurred_at: Date;
    }>(
      `select l.id,l.payment_id,coalesce(o.title,'Unlinked opportunity') opportunity_title,coalesce(c.name,'Unknown customer') customer_name,
        l.event_type,l.eligible_amount_cents::text,l.earn_amount_cents::text,l.classification,l.locked_rate_bps,l.reason,l.settlement_status,l.occurred_at
       from public.earn_ledger_entries l left join public.opportunities o on o.id=l.opportunity_id left join public.customers c on c.id=l.customer_id
       where l.tenant_id=$1 order by l.occurred_at desc limit 30`,
      [tenantId]
    ),
    queryPostgres<{ id: string; dispute_type: string; reason: string; amount_cents: string; status: string; created_at: Date }>(
      `select id,dispute_type,reason,amount_cents::text,status,created_at from public.earn_disputes where tenant_id=$1 order by created_at desc limit 20`,
      [tenantId]
    )
  ]);
  const enrollment = enrollmentResult?.rows[0] ?? null;
  const summary = summaryResult?.rows[0];
  const provider = providerResult?.rows[0];
  return {
    enrollment: enrollment ? {
      status: enrollment.status,
      agreementVersion: enrollment.agreement_version,
      effectiveAt: enrollment.effective_at?.toISOString() ?? null,
      terminatedAt: enrollment.terminated_at?.toISOString() ?? null,
      settlementDay: enrollment.settlement_day,
      nextSettlementAt: nextSettlementDate(enrollment.settlement_day)
    } : null,
    currentPeriod: {
      managedRevenueCents: Number(summary?.managed_revenue_cents ?? 0),
      managedEarnCents: Number(summary?.managed_earn_cents ?? 0),
      originatedRevenueCents: Number(summary?.originated_revenue_cents ?? 0),
      originatedEarnCents: Number(summary?.originated_earn_cents ?? 0),
      adjustmentsCents: Number(summary?.adjustments_cents ?? 0),
      disputedCents: Number(summary?.disputed_cents ?? 0),
      currentBalanceCents: Number(summary?.current_balance_cents ?? 0),
      providerUsageCents: Number(provider?.provider_usage_cents ?? 0)
    },
    lifetimeOriginatedRevenueCents: Number(summary?.lifetime_originated_revenue_cents ?? 0),
    opportunities: (opportunitiesResult?.rows ?? []).map((row) => ({
      id: row.id, attributionId: row.attribution_id, title: row.title, customerName: row.customer_name, valueCents: row.value_cents,
      classification: row.classification, lockedRateBps: row.locked_rate_bps, reason: row.attribution_reason,
      sourceChannel: row.source_channel, attributedAt: row.attributed_at?.toISOString() ?? null,
      collectedEligibleCents: Number(row.collected_eligible_cents), earnAccruedCents: Number(row.earn_accrued_cents),
      projectedEarnCents: calculateEarnCents(Math.max(row.value_cents, 0), row.locked_rate_bps ?? 0)
    })),
    recentLedger: (ledgerResult?.rows ?? []).map((row) => ({
      id: row.id, paymentId: row.payment_id, opportunityTitle: row.opportunity_title, customerName: row.customer_name, eventType: row.event_type,
      eligibleAmountCents: Number(row.eligible_amount_cents), earnAmountCents: Number(row.earn_amount_cents),
      classification: row.classification, rateBps: row.locked_rate_bps, reason: row.reason,
      settlementStatus: row.settlement_status, occurredAt: row.occurred_at.toISOString()
    })),
    disputes: (disputesResult?.rows ?? []).map((row) => ({
      id: row.id, type: row.dispute_type, reason: row.reason, amountCents: Number(row.amount_cents), status: row.status,
      createdAt: row.created_at.toISOString()
    }))
  };
}
