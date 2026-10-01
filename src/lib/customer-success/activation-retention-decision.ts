export type CustomerSuccessSignals = {
  billingStatus: string;
  onboardingComplete: boolean;
  daysSinceSignup: number;
  daysSinceActivity: number;
  hasBusinessProfile: boolean;
  connectedSystems: number;
  ferocityCommands: number;
  operationalRecords: number;
};

export type CustomerSuccessDecision = {
  stage: "onboarding" | "activated" | "retained" | "at_risk" | "churned";
  activationScore: number;
  healthScore: number;
  firstValueReached: boolean;
  riskReasons: string[];
  nextBestAction: string;
};

export function decideCustomerSuccessLifecycle(signals: CustomerSuccessSignals): CustomerSuccessDecision {
  const activationScore = Math.min(100,
    (signals.hasBusinessProfile ? 15 : 0) +
    (signals.onboardingComplete ? 20 : 0) +
    (signals.connectedSystems > 0 ? 15 : 0) +
    (signals.ferocityCommands > 0 ? 20 : 0) +
    (signals.operationalRecords > 0 ? 30 : 0)
  );
  const firstValueReached = signals.ferocityCommands > 0 || signals.operationalRecords > 0;
  const riskReasons: string[] = [];
  if (signals.daysSinceSignup >= 1 && !signals.hasBusinessProfile) riskReasons.push("The business context is still incomplete.");
  if (signals.daysSinceSignup >= 2 && !firstValueReached) riskReasons.push("The workspace has not reached a measurable first useful result.");
  if (signals.daysSinceSignup >= 3 && signals.connectedSystems === 0) riskReasons.push("No operating system or communication source is connected yet.");
  if (signals.daysSinceActivity >= 7) riskReasons.push("No meaningful workspace activity was detected in the last seven days.");

  const churned = signals.billingStatus === "cancelled";
  const atRisk = !churned && ["active", "trialing", "manual"].includes(signals.billingStatus) && riskReasons.length > 0 && signals.daysSinceSignup >= 2;
  const retained = !churned && !atRisk && firstValueReached && signals.daysSinceSignup >= 30 && signals.daysSinceActivity < 14;
  const stage = churned ? "churned" : atRisk ? "at_risk" : retained ? "retained" : firstValueReached ? "activated" : "onboarding";
  const recencyPoints = signals.daysSinceActivity <= 1 ? 25 : signals.daysSinceActivity <= 7 ? 15 : signals.daysSinceActivity <= 14 ? 5 : 0;
  const healthScore = churned ? 0 : Math.max(0, Math.min(100, Math.round(activationScore * 0.75 + recencyPoints)));

  const nextBestAction = !signals.hasBusinessProfile
    ? "Tell Ferocity what the business does, the result you want, and the current bottleneck."
    : !firstValueReached
      ? "Ask Ferocity to choose and complete the safest first useful business outcome now."
      : signals.connectedSystems === 0
        ? "Connect the first system that contains real customers, work, money, or communications."
        : signals.daysSinceActivity >= 7
          ? "Have Ferocity scan the business, handle safe work, and bring back the single strongest money or efficiency move."
          : "Keep the highest-value operating loop moving and measure the business result.";

  return { stage, activationScore, healthScore, firstValueReached, riskReasons, nextBestAction };
}
