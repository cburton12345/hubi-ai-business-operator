import { getPaidMediaProvider, type PaidMediaProviderKey } from "./paid-media-provider-registry";

export type AdvertisingSetupState =
  | "ready"
  | "needs_user_action"
  | "waiting_for_platform"
  | "connected_syncing"
  | "connected"
  | "authorization_expired"
  | "error";

export type PaidMediaAccountSignals = {
  providerKey: PaidMediaProviderKey;
  accountFound: boolean;
  authorization: "missing" | "pending" | "connected" | "expired" | "revoked" | "error";
  apiApproved: boolean;
  businessVerification: "unknown" | "not_required" | "pending" | "verified" | "failed";
  billingReady: boolean;
  trackingReady: boolean;
  initialSync: "not_started" | "queued" | "running" | "complete" | "error";
  liveActionsEnabled: boolean;
  lastError?: string;
};

export type AdvertisingSetupAssessment = {
  providerKey: PaidMediaProviderKey;
  state: AdvertisingSetupState;
  canRead: boolean;
  canWriteDrafts: boolean;
  canLaunch: boolean;
  steps: Array<{ key: string; label: string; owner: "ferocity" | "user" | "provider"; blocking: boolean }>;
  warnings: string[];
};

export function assessAdvertisingSetup(signals: PaidMediaAccountSignals): AdvertisingSetupAssessment {
  const provider = getPaidMediaProvider(signals.providerKey);
  if (!provider) throw new Error(`Unknown paid-media provider: ${signals.providerKey}`);

  const steps: AdvertisingSetupAssessment["steps"] = [];
  const warnings = [...provider.limitations];

  if (!signals.accountFound) steps.push({ key: "account", label: `Create or select the legitimate ${provider.label} advertiser account.`, owner: "user", blocking: true });
  if (!signals.apiApproved) steps.push({ key: "api_approval", label: `Complete ${provider.label} developer/API approval.`, owner: "provider", blocking: true });
  if (signals.businessVerification === "pending") steps.push({ key: "verification", label: "Wait for the provider's business-verification decision.", owner: "provider", blocking: true });
  if (signals.businessVerification === "failed") steps.push({ key: "verification", label: "Correct the rejected business-verification information in the provider portal.", owner: "user", blocking: true });
  if (signals.authorization === "missing" || signals.authorization === "revoked") steps.push({ key: "authorization", label: "Authorize the customer-owned account in Ferocity.", owner: "user", blocking: true });
  if (signals.authorization === "pending") steps.push({ key: "authorization", label: "Finish the provider authorization handoff.", owner: "user", blocking: true });
  if (!signals.trackingReady) steps.push({ key: "tracking", label: "Install and certify conversion tracking before optimization.", owner: "ferocity", blocking: false });
  if (!signals.billingReady) steps.push({ key: "billing", label: "Add or confirm provider billing only when paid launch is intentionally approved.", owner: "user", blocking: true });
  if (signals.initialSync === "not_started" && signals.authorization === "connected") steps.push({ key: "initial_sync", label: "Run an initial historical read-only sync.", owner: "ferocity", blocking: true });
  if (signals.initialSync === "error") steps.push({ key: "sync", label: "Repair the failed provider sync before using performance data.", owner: "ferocity", blocking: true });

  const canRead = signals.accountFound && signals.apiApproved && signals.authorization === "connected" && signals.initialSync === "complete";
  const canWriteDrafts = canRead && provider.capabilities.campaign_write.support !== "unavailable";
  const canLaunch = canWriteDrafts && signals.billingReady && signals.trackingReady && signals.liveActionsEnabled;

  let state: AdvertisingSetupState;
  if (signals.authorization === "expired" || signals.authorization === "revoked") state = "authorization_expired";
  else if (signals.authorization === "error" || signals.initialSync === "error" || signals.businessVerification === "failed") state = "error";
  else if (!signals.apiApproved || signals.businessVerification === "pending") state = "waiting_for_platform";
  else if (!signals.accountFound || signals.authorization !== "connected" || !signals.billingReady) state = "needs_user_action";
  else if (signals.initialSync === "queued" || signals.initialSync === "running" || signals.initialSync === "not_started") state = "connected_syncing";
  else if (canLaunch) state = "connected";
  else state = "ready";

  if (signals.lastError) warnings.unshift(signals.lastError);
  if (!signals.liveActionsEnabled) warnings.unshift("Live campaign and spend actions are disabled by Ferocity policy.");

  return { providerKey: signals.providerKey, state, canRead, canWriteDrafts, canLaunch, steps, warnings };
}

export type ChannelOutcomeEvidence = {
  providerKey: PaidMediaProviderKey;
  spendCents: number;
  leads: number;
  qualifiedLeads: number;
  bookedAppointments: number;
  soldJobs: number;
  revenueCents: number;
  grossProfitCents?: number;
  attributionConfidence: number;
  sampleDays: number;
  capacityFit: number;
  eligible: boolean;
};

export type ChannelEvidenceState = "hypothesis" | "learning" | "proven" | "declining";
export type ChannelStrategyAction = "test_carefully" | "hold" | "scale_candidate" | "constrain" | "repair_measurement";

export type AdaptiveChannelAssessment = {
  providerKey: PaidMediaProviderKey;
  state: ChannelEvidenceState;
  action: ChannelStrategyAction;
  confidenceScore: number;
  grossProfitReturn: number | null;
  revenueReturn: number | null;
  customerAcquisitionCostCents: number | null;
  qualifiedLeadCostCents: number | null;
  trendPercent: number | null;
  reasons: string[];
};

export type CampaignSpendObservation = {
  observedAt: string;
  spendCents: number;
  qualifiedLeads: number;
  soldJobs: number;
  revenueCents: number;
  grossProfitCents?: number;
  attributionConfidence: number;
};

export type CampaignSpendCheckpoint = {
  observedAt: string;
  cumulativeSpendCents: number;
  crossedMilestones: number;
  milestoneCents: number;
  qualifiedLeads: number;
  soldJobs: number;
  revenueCents: number;
  grossProfitCents: number | null;
  action: "observe" | "stop_loss" | "repair_measurement";
  reason: string;
};

export function buildIncrementalSpendCheckpoints(input: {
  observations: CampaignSpendObservation[];
  milestoneCents?: number;
  stopLossSpendCents?: number;
}): CampaignSpendCheckpoint[] {
  const milestoneCents = Math.max(100, Math.round(input.milestoneCents ?? 500));
  const stopLossSpendCents = Math.max(milestoneCents, Math.round(input.stopLossSpendCents ?? 2_500));
  let cumulativeSpendCents = 0;
  let qualifiedLeads = 0;
  let soldJobs = 0;
  let revenueCents = 0;
  let grossProfitCents = 0;
  let profitComplete = true;
  let priorMilestone = 0;
  const checkpoints: CampaignSpendCheckpoint[] = [];
  const ordered = [...input.observations].sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime());
  for (const observation of ordered) {
    cumulativeSpendCents += Math.max(0, Math.round(observation.spendCents));
    qualifiedLeads += Math.max(0, Math.round(observation.qualifiedLeads));
    soldJobs += Math.max(0, Math.round(observation.soldJobs));
    revenueCents += Math.max(0, Math.round(observation.revenueCents));
    if (observation.grossProfitCents == null) profitComplete = false;
    else grossProfitCents += Math.round(observation.grossProfitCents);
    const reachedMilestone = Math.floor(cumulativeSpendCents / milestoneCents);
    if (reachedMilestone <= priorMilestone) continue;
    const crossedMilestones = reachedMilestone - priorMilestone;
    priorMilestone = reachedMilestone;
    const weakMeasurement = observation.attributionConfidence < 0.5 || !profitComplete;
    const stopLoss = cumulativeSpendCents >= stopLossSpendCents && qualifiedLeads === 0;
    checkpoints.push({
      observedAt: observation.observedAt,
      cumulativeSpendCents,
      crossedMilestones,
      milestoneCents: reachedMilestone * milestoneCents,
      qualifiedLeads,
      soldJobs,
      revenueCents,
      grossProfitCents: profitComplete ? grossProfitCents : null,
      action: weakMeasurement ? "repair_measurement" : stopLoss ? "stop_loss" : "observe",
      reason: weakMeasurement
        ? "Spend crossed a monitoring milestone without reliable source-to-profit measurement."
        : stopLoss
          ? "Spend reached the stop-loss floor without an attributed qualified lead."
          : "Incremental spend was observed; the sample remains subject to campaign evidence thresholds."
    });
  }
  return checkpoints;
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function assessAdaptiveChannel(input: {
  current: ChannelOutcomeEvidence;
  previous?: ChannelOutcomeEvidence | null;
  minimumGrossProfitReturn?: number | null;
  maximumCustomerAcquisitionCostCents?: number | null;
}): AdaptiveChannelAssessment {
  const { current, previous } = input;
  const grossProfitReturn = current.grossProfitCents == null ? null : safeRatio(current.grossProfitCents, current.spendCents);
  const revenueReturn = safeRatio(current.revenueCents, current.spendCents);
  const customerAcquisitionCostCents = safeRatio(current.spendCents, current.soldJobs);
  const qualifiedLeadCostCents = safeRatio(current.spendCents, current.qualifiedLeads);
  const maturityScore = Math.min(1, current.sampleDays / 30) * Math.min(1, Math.max(current.soldJobs / 3, current.qualifiedLeads / 10));
  const confidenceScore = Math.round(Math.max(0, Math.min(1, current.attributionConfidence * maturityScore)) * 100);
  const previousReturn = previous?.grossProfitCents == null ? null : safeRatio(previous.grossProfitCents, previous.spendCents);
  const trendPercent = grossProfitReturn != null && previousReturn != null && previousReturn > 0
    ? Number((((grossProfitReturn - previousReturn) / previousReturn) * 100).toFixed(1))
    : null;
  const reasons: string[] = [];

  if (!current.eligible || current.capacityFit <= 0) {
    reasons.push(current.capacityFit <= 0 ? "Delivery capacity cannot safely absorb more demand." : "The channel is not eligible for investment.");
    return { providerKey: current.providerKey, state: "learning", action: "constrain", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
  }
  if (current.spendCents > 0 && (current.attributionConfidence < 0.5 || current.grossProfitCents == null)) {
    reasons.push(current.attributionConfidence < 0.5 ? "Source-to-cash attribution is too weak for a paid-budget decision." : "Attributed gross profit is missing, so paid efficiency cannot be verified.");
    return { providerKey: current.providerKey, state: "hypothesis", action: "repair_measurement", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
  }
  if (current.spendCents === 0) {
    reasons.push("No paid-spend sample exists yet; this remains a controlled hypothesis.");
    return { providerKey: current.providerKey, state: "hypothesis", action: "test_carefully", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
  }

  const isMature = current.sampleDays >= 14 && current.soldJobs >= 3 && confidenceScore >= 55;
  const materiallyDeclining = isMature && trendPercent != null && trendPercent <= -25;
  const effectiveProfitFloor = Math.max(1, input.minimumGrossProfitReturn ?? 1);
  const belowProfitFloor = grossProfitReturn != null && grossProfitReturn < effectiveProfitFloor;
  const aboveCacCeiling = customerAcquisitionCostCents != null && input.maximumCustomerAcquisitionCostCents != null
    && customerAcquisitionCostCents > input.maximumCustomerAcquisitionCostCents;

  if (materiallyDeclining || belowProfitFloor || aboveCacCeiling) {
    if (materiallyDeclining) reasons.push(`Attributed gross-profit return declined ${Math.abs(trendPercent ?? 0)}% versus the prior comparable period.`);
    if (belowProfitFloor) reasons.push("Attributed gross-profit return is below the owner-defined floor.");
    if (aboveCacCeiling) reasons.push("Customer acquisition cost is above the owner-defined ceiling.");
    return { providerKey: current.providerKey, state: materiallyDeclining ? "declining" : "learning", action: "constrain", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
  }
  if (!isMature) {
    reasons.push("The current sample is too small to call a winner.");
    return { providerKey: current.providerKey, state: "learning", action: "hold", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
  }

  reasons.push("Current source-to-cash evidence is mature enough to treat this channel as a scale candidate.");
  if (trendPercent != null) reasons.push(`Attributed gross-profit return is ${trendPercent >= 0 ? "up" : "down"} ${Math.abs(trendPercent)}% versus the prior comparable period.`);
  return { providerKey: current.providerKey, state: "proven", action: "scale_candidate", confidenceScore, grossProfitReturn, revenueReturn, customerAcquisitionCostCents, qualifiedLeadCostCents, trendPercent, reasons };
}

export type ChannelAllocation = {
  providerKey: PaidMediaProviderKey;
  proposedBudgetCents: number;
  score: number;
  reason: string;
  requiresApproval: true;
};

export function proposeCrossChannelAllocation(input: {
  monthlyBudgetCents: number;
  evidence: ChannelOutcomeEvidence[];
  minimumLearningBudgetCents?: number;
}): ChannelAllocation[] {
  if (!Number.isInteger(input.monthlyBudgetCents) || input.monthlyBudgetCents < 0) throw new Error("monthlyBudgetCents must be a non-negative integer");
  const minimum = Math.max(0, input.minimumLearningBudgetCents ?? 10_000);
  const eligible = input.evidence.filter((item) => item.eligible
    && item.attributionConfidence >= 0.5
    && item.capacityFit > 0
    && (item.spendCents === 0 || (item.grossProfitCents != null && item.grossProfitCents >= item.spendCents)));
  if (input.monthlyBudgetCents === 0 || eligible.length === 0) return [];

  const scored = eligible.map((item) => {
    const outcomeValue = item.grossProfitCents ?? item.revenueCents;
    const economicReturn = item.spendCents > 0 ? outcomeValue / item.spendCents : 0;
    const soldJobSignal = item.soldJobs * 8;
    const bookedSignal = item.bookedAppointments * 3;
    const qualifiedSignal = item.qualifiedLeads;
    const maturity = Math.min(1, item.sampleDays / 30) * Math.min(1, Math.max(item.soldJobs, item.qualifiedLeads / 4) / 5);
    const score = Math.max(0.01, (economicReturn * 10 + soldJobSignal + bookedSignal + qualifiedSignal) * item.attributionConfidence * item.capacityFit * Math.max(0.2, maturity));
    return { ...item, score };
  });
  const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
  const useFloor = input.monthlyBudgetCents >= minimum * scored.length;
  const floorTotal = useFloor ? minimum * scored.length : 0;
  const distributable = input.monthlyBudgetCents - floorTotal;
  const exact = scored.map((item) => distributable * item.score / totalScore);
  const budgets = exact.map((value) => (useFloor ? minimum : 0) + Math.floor(value));
  let remainder = input.monthlyBudgetCents - budgets.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || scored[b.index].score - scored[a.index].score);
  for (let cursor = 0; remainder > 0; cursor = (cursor + 1) % remainderOrder.length) {
    budgets[remainderOrder[cursor].index] += 1;
    remainder -= 1;
  }
  const allocations = scored.map((item, index) => {
    return {
      providerKey: item.providerKey,
      proposedBudgetCents: budgets[index],
      score: Number(item.score.toFixed(3)),
      reason: item.grossProfitCents !== undefined
        ? "Weighted by attributed gross profit, sold jobs, qualified demand, confidence, and available capacity."
        : "Weighted by attributed revenue, sold jobs, qualified demand, confidence, and available capacity; profit data is not yet available.",
      requiresApproval: true as const
    };
  });
  return allocations.sort((a, b) => b.score - a.score);
}
