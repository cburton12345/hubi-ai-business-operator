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
  const eligible = input.evidence.filter((item) => item.eligible && item.attributionConfidence >= 0.5 && item.capacityFit > 0);
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
  let remaining = input.monthlyBudgetCents;
  const allocations = scored.map((item, index) => {
    const raw = index === scored.length - 1 ? remaining : Math.round(input.monthlyBudgetCents * item.score / totalScore);
    const budget = input.monthlyBudgetCents >= minimum * scored.length ? Math.max(minimum, raw) : raw;
    const bounded = Math.min(remaining, budget);
    remaining -= bounded;
    return {
      providerKey: item.providerKey,
      proposedBudgetCents: bounded,
      score: Number(item.score.toFixed(3)),
      reason: item.grossProfitCents !== undefined
        ? "Weighted by attributed gross profit, sold jobs, qualified demand, confidence, and available capacity."
        : "Weighted by attributed revenue, sold jobs, qualified demand, confidence, and available capacity; profit data is not yet available.",
      requiresApproval: true as const
    };
  });
  if (remaining > 0 && allocations.length > 0) allocations[0].proposedBudgetCents += remaining;
  return allocations.sort((a, b) => b.score - a.score);
}
