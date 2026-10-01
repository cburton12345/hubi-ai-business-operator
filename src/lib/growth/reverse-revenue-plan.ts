export type FunnelRateKey =
  | "trafficToLead"
  | "leadToQualified"
  | "qualifiedToAppointment"
  | "appointmentToShow"
  | "showToEstimate"
  | "estimateToWin"
  | "winToCollected";

export type FunnelRate = {
  rate?: number | null;
  sampleSize?: number | null;
  source?: "observed" | "owner" | "industry_default" | "fallback";
};

export type ReverseRevenuePlanInput = {
  targetCollectedRevenueCents: number;
  targetGrossProfitCents?: number | null;
  averageCollectedJobCents?: number | null;
  grossMarginRate?: number | null;
  costPerLeadCents?: number | null;
  availableJobCapacity?: number | null;
  currentCommittedJobs?: number | null;
  rates?: Partial<Record<FunnelRateKey, FunnelRate>>;
};

export type ReverseRevenuePlan = {
  required: {
    traffic: number;
    leads: number;
    qualifiedLeads: number;
    appointments: number;
    shows: number;
    estimates: number;
    wonJobs: number;
    collectedJobs: number;
  };
  ranges: Record<"leads" | "appointments" | "estimates" | "wonJobs", { low: number; high: number }>;
  economics: {
    estimatedAcquisitionSpendCents: number | null;
    estimatedGrossProfitCents: number | null;
    estimatedContributionAfterAcquisitionCents: number | null;
    projectedRoas: number | null;
  };
  capacity: {
    availableJobs: number | null;
    requiredJobs: number;
    overCapacityBy: number;
    feasible: boolean | null;
  };
  confidence: "low" | "medium" | "high";
  confidenceScore: number;
  assumptions: Array<{ key: string; value: number; source: string; sampleSize: number }>;
  warnings: string[];
};

const defaults: Record<FunnelRateKey, number> = {
  trafficToLead: 0.03,
  leadToQualified: 0.55,
  qualifiedToAppointment: 0.55,
  appointmentToShow: 0.75,
  showToEstimate: 0.8,
  estimateToWin: 0.3,
  winToCollected: 0.92
};

function positive(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeRate(key: FunnelRateKey, value?: FunnelRate) {
  const supplied = Number(value?.rate);
  const valid = Number.isFinite(supplied) && supplied > 0 && supplied <= 1;
  return {
    rate: valid ? supplied : defaults[key],
    source: valid ? (value?.source ?? "owner") : "fallback",
    sampleSize: Math.max(0, Math.round(Number(value?.sampleSize) || 0))
  };
}

function divideAndRoundUp(value: number, rate: number) {
  return Math.max(0, Math.ceil(value / Math.max(rate, 0.0001)));
}

export function buildReverseRevenuePlan(input: ReverseRevenuePlanInput): ReverseRevenuePlan {
  const target = Math.max(0, Math.round(Number(input.targetCollectedRevenueCents) || 0));
  const averageJob = positive(input.averageCollectedJobCents, 250_000);
  const rateKeys = Object.keys(defaults) as FunnelRateKey[];
  const normalized = Object.fromEntries(rateKeys.map((key) => [key, normalizeRate(key, input.rates?.[key])])) as Record<FunnelRateKey, ReturnType<typeof normalizeRate>>;

  const collectedJobs = Math.ceil(target / averageJob);
  const wonJobs = divideAndRoundUp(collectedJobs, normalized.winToCollected.rate);
  const estimates = divideAndRoundUp(wonJobs, normalized.estimateToWin.rate);
  const shows = divideAndRoundUp(estimates, normalized.showToEstimate.rate);
  const appointments = divideAndRoundUp(shows, normalized.appointmentToShow.rate);
  const qualifiedLeads = divideAndRoundUp(appointments, normalized.qualifiedToAppointment.rate);
  const leads = divideAndRoundUp(qualifiedLeads, normalized.leadToQualified.rate);
  const traffic = divideAndRoundUp(leads, normalized.trafficToLead.rate);

  const confidenceScore = Math.round(rateKeys.reduce((score, key) => {
    const item = normalized[key];
    if (item.source === "observed") return score + (item.sampleSize >= 100 ? 100 : item.sampleSize >= 30 ? 80 : item.sampleSize >= 10 ? 60 : 40);
    if (item.source === "owner") return score + 55;
    if (item.source === "industry_default") return score + 35;
    return score + 20;
  }, 0) / rateKeys.length);
  const confidence = confidenceScore >= 75 ? "high" : confidenceScore >= 45 ? "medium" : "low";
  const uncertainty = confidence === "high" ? 0.12 : confidence === "medium" ? 0.25 : 0.4;
  const range = (value: number) => ({ low: Math.max(0, Math.floor(value * (1 - uncertainty))), high: Math.ceil(value * (1 + uncertainty)) });

  const costPerLead = Number(input.costPerLeadCents);
  const acquisitionSpend = Number.isFinite(costPerLead) && costPerLead >= 0 ? Math.round(leads * costPerLead) : null;
  const grossMargin = Number(input.grossMarginRate);
  const estimatedGrossProfit = Number.isFinite(grossMargin) && grossMargin >= 0 && grossMargin <= 1 ? Math.round(target * grossMargin) : input.targetGrossProfitCents == null ? null : Math.max(0, Math.round(input.targetGrossProfitCents));
  const contribution = estimatedGrossProfit == null || acquisitionSpend == null ? null : estimatedGrossProfit - acquisitionSpend;
  const projectedRoas = acquisitionSpend && acquisitionSpend > 0 ? Number((target / acquisitionSpend).toFixed(2)) : null;
  const available = input.availableJobCapacity == null ? null : Math.max(0, Math.floor(input.availableJobCapacity - Math.max(0, input.currentCommittedJobs ?? 0)));
  const overCapacityBy = available == null ? 0 : Math.max(0, wonJobs - available);

  const warnings: string[] = [];
  if (target > 0 && input.averageCollectedJobCents == null) warnings.push("Average collected job value is missing; the plan uses a clearly labeled fallback.");
  if (rateKeys.some((key) => normalized[key].source === "fallback")) warnings.push("One or more funnel rates use fallbacks until Ferocity has enough tenant-specific evidence.");
  if (overCapacityBy > 0) warnings.push(`The revenue target requires about ${overCapacityBy} more jobs than current capacity can absorb.`);
  if (contribution != null && contribution < 0) warnings.push("Expected acquisition cost exceeds expected gross profit; do not expand paid demand.");

  return {
    required: { traffic, leads, qualifiedLeads, appointments, shows, estimates, wonJobs, collectedJobs },
    ranges: { leads: range(leads), appointments: range(appointments), estimates: range(estimates), wonJobs: range(wonJobs) },
    economics: { estimatedAcquisitionSpendCents: acquisitionSpend, estimatedGrossProfitCents: estimatedGrossProfit, estimatedContributionAfterAcquisitionCents: contribution, projectedRoas },
    capacity: { availableJobs: available, requiredJobs: wonJobs, overCapacityBy, feasible: available == null ? null : overCapacityBy === 0 },
    confidence, confidenceScore,
    assumptions: rateKeys.map((key) => ({ key, value: normalized[key].rate, source: normalized[key].source, sampleSize: normalized[key].sampleSize })),
    warnings
  };
}
