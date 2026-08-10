import { queryPostgres } from "@/lib/db/postgres";

export type PromotionRecommendation = "accept" | "review" | "skip";

export type PromotionAnalysis = {
  recommendation: PromotionRecommendation;
  reason: string;
  incrementalSpendCents: number;
  conservativeNetValueCents: number;
  requiredDailySpendCents: number;
  daysRemaining: number | null;
  progressPercent: number;
};

export function resolvePromotionSafetyBoundaries(input: {
  requiredSpendCents: number;
  requiredDailySpendCents: number;
  customBudgetCents?: number | null;
  customDailyLimitCents?: number | null;
}) {
  const requiredSpendCents = Math.max(1, Math.round(input.requiredSpendCents));
  const automaticDailyBoundaryCents = Math.max(
    1,
    Math.min(requiredSpendCents, Math.round(input.requiredDailySpendCents) || requiredSpendCents)
  );
  const budgetCents = input.customBudgetCents == null ? requiredSpendCents : Math.round(input.customBudgetCents);
  const dailyCents = input.customDailyLimitCents == null ? automaticDailyBoundaryCents : Math.round(input.customDailyLimitCents);
  if (budgetCents < requiredSpendCents) throw new Error("A custom total limit cannot be lower than the offer's qualifying spend.");
  if (dailyCents <= 0 || dailyCents > budgetCents) throw new Error("A custom daily limit must be positive and cannot exceed the total limit.");
  return { budgetCents, dailyCents };
}

export function analyzeProviderPromotion(input: {
  creditCents: number;
  requiredSpendCents: number;
  plannedSpendWithoutOfferCents: number;
  qualifyingSpendRecordedCents?: number;
  claimDeadline?: string | null;
  qualifyingPeriodEndsAt?: string | null;
}, now = new Date()): PromotionAnalysis {
  const credit = Math.max(0, Math.round(input.creditCents));
  const required = Math.max(0, Math.round(input.requiredSpendCents));
  const planned = Math.max(0, Math.round(input.plannedSpendWithoutOfferCents));
  const recorded = Math.max(0, Math.round(input.qualifyingSpendRecordedCents ?? 0));
  const deadlineValues = [input.claimDeadline, input.qualifyingPeriodEndsAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const deadline = deadlineValues.length ? Math.min(...deadlineValues) : null;
  const daysRemaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now.getTime()) / 86_400_000));
  const remainingRequired = Math.max(0, required - recorded);
  const incrementalSpendCents = Math.max(0, required - planned);
  const conservativeNetValueCents = credit - incrementalSpendCents;
  const requiredDailySpendCents = daysRemaining && daysRemaining > 0 ? Math.ceil(remainingRequired / daysRemaining) : remainingRequired;
  const progressPercent = required > 0 ? Math.min(100, Math.round((recorded / required) * 100)) : 0;

  if (credit <= 0 || required <= 0) {
    return {
      recommendation: "skip",
      reason: "The offer does not contain a usable credit and qualifying-spend requirement.",
      incrementalSpendCents,
      conservativeNetValueCents,
      requiredDailySpendCents,
      daysRemaining,
      progressPercent
    };
  }
  if (daysRemaining === 0) {
    return {
      recommendation: "skip",
      reason: "The earliest known offer deadline has passed.",
      incrementalSpendCents,
      conservativeNetValueCents,
      requiredDailySpendCents,
      daysRemaining,
      progressPercent
    };
  }
  if (planned >= required && (daysRemaining === null || daysRemaining >= 3)) {
    return {
      recommendation: "accept",
      reason: "The business already planned enough qualified advertising spend to earn the credit without increasing its budget.",
      incrementalSpendCents,
      conservativeNetValueCents,
      requiredDailySpendCents,
      daysRemaining,
      progressPercent
    };
  }
  if (conservativeNetValueCents < 0 || (daysRemaining !== null && daysRemaining < 3)) {
    return {
      recommendation: "skip",
      reason: conservativeNetValueCents < 0
        ? "Earning the credit would require more unplanned spend than the credit is worth before considering campaign performance."
        : "The remaining deadline would force an unnecessarily aggressive daily budget.",
      incrementalSpendCents,
      conservativeNetValueCents,
      requiredDailySpendCents,
      daysRemaining,
      progressPercent
    };
  }
  return {
    recommendation: "review",
    reason: "The credit may exceed the unplanned spend, but campaign economics, conversion tracking, and provider eligibility still need confirmation.",
    incrementalSpendCents,
    conservativeNetValueCents,
    requiredDailySpendCents,
    daysRemaining,
    progressPercent
  };
}

export type ProviderPromotion = {
  id: string;
  providerKey: string;
  laneKey: "customer_owned" | "ferocity_managed";
  title: string;
  offerSource: string;
  offerUrl: string | null;
  creditCents: number;
  requiredSpendCents: number;
  plannedSpendWithoutOfferCents: number;
  qualifyingSpendRecordedCents: number;
  claimDeadline: string | null;
  qualifyingPeriodEndsAt: string | null;
  creditExpiresAt: string | null;
  newAccountOnly: boolean;
  termsSummary: string;
  status: string;
  recommendation: PromotionRecommendation;
  recommendationReason: string;
  approvedBudgetCents: number | null;
  approvedDailyCapCents: number | null;
  analysis: PromotionAnalysis;
};

export async function getProviderPromotions(tenantId: string): Promise<ProviderPromotion[]> {
  const result = await queryPostgres<{
    id: string;
    provider_key: string;
    lane_key: "customer_owned" | "ferocity_managed";
    title: string;
    offer_source: string;
    offer_url: string | null;
    credit_cents: number;
    required_spend_cents: number;
    planned_spend_without_offer_cents: number;
    qualifying_spend_recorded_cents: number;
    claim_deadline: string | null;
    qualifying_period_ends_at: string | null;
    credit_expires_at: string | null;
    new_account_only: boolean;
    terms_summary: string;
    status: string;
    recommendation: PromotionRecommendation;
    recommendation_reason: string;
    approved_budget_cents: number | null;
    approved_daily_cap_cents: number | null;
  }>(
    `
    select id, provider_key, lane_key, title, offer_source, offer_url, credit_cents,
      required_spend_cents, planned_spend_without_offer_cents, qualifying_spend_recorded_cents,
      claim_deadline, qualifying_period_ends_at, credit_expires_at, new_account_only,
      terms_summary, status, recommendation, recommendation_reason,
      approved_budget_cents, approved_daily_cap_cents
    from public.provider_promotion_opportunities
    where tenant_id = $1 and status not in ('declined', 'expired')
    order by claim_deadline nulls last, created_at desc
    `,
    [tenantId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    providerKey: row.provider_key,
    laneKey: row.lane_key,
    title: row.title,
    offerSource: row.offer_source,
    offerUrl: row.offer_url,
    creditCents: Number(row.credit_cents),
    requiredSpendCents: Number(row.required_spend_cents),
    plannedSpendWithoutOfferCents: Number(row.planned_spend_without_offer_cents),
    qualifyingSpendRecordedCents: Number(row.qualifying_spend_recorded_cents),
    claimDeadline: row.claim_deadline,
    qualifyingPeriodEndsAt: row.qualifying_period_ends_at,
    creditExpiresAt: row.credit_expires_at,
    newAccountOnly: row.new_account_only,
    termsSummary: row.terms_summary,
    status: row.status,
    recommendation: row.recommendation,
    recommendationReason: row.recommendation_reason,
    approvedBudgetCents: row.approved_budget_cents === null ? null : Number(row.approved_budget_cents),
    approvedDailyCapCents: row.approved_daily_cap_cents === null ? null : Number(row.approved_daily_cap_cents),
    analysis: analyzeProviderPromotion({
      creditCents: Number(row.credit_cents),
      requiredSpendCents: Number(row.required_spend_cents),
      plannedSpendWithoutOfferCents: Number(row.planned_spend_without_offer_cents),
      qualifyingSpendRecordedCents: Number(row.qualifying_spend_recorded_cents),
      claimDeadline: row.claim_deadline,
      qualifyingPeriodEndsAt: row.qualifying_period_ends_at
    })
  }));
}
