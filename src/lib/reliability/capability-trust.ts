export const capabilityTrustLevels = ["unverified", "observing", "assisted", "trusted", "autonomous"] as const;
export type CapabilityTrustLevel = (typeof capabilityTrustLevels)[number];

export const capabilityHealthStates = [
  "healthy",
  "degraded",
  "unavailable",
  "configuration_required",
  "verification_required",
  "rate_limited",
  "suspended",
  "unknown"
] as const;
export type CapabilityHealthState = (typeof capabilityHealthStates)[number];

export const capabilityActionStates = [
  "planned",
  "queued",
  "attempted",
  "provider_accepted",
  "delivered",
  "confirmed",
  "completed",
  "failed",
  "blocked",
  "needs_attention",
  "delayed",
  "unknown"
] as const;
export type CapabilityActionState = (typeof capabilityActionStates)[number];

export type CapabilityDependency = {
  dependencyType: "provider" | "integration" | "feature_gate" | "webhook" | "configuration" | "consent" | "queue" | "custom";
  dependencyKey: string;
  required: boolean;
  health: CapabilityHealthState;
  reason?: string | null;
};

export type CapabilityReadiness = {
  ready: boolean;
  health: CapabilityHealthState;
  blockers: CapabilityDependency[];
  warnings: CapabilityDependency[];
};

const healthPriority: CapabilityHealthState[] = [
  "suspended",
  "verification_required",
  "configuration_required",
  "unavailable",
  "rate_limited",
  "degraded",
  "unknown",
  "healthy"
];

export function evaluateCapabilityReadiness(dependencies: CapabilityDependency[]): CapabilityReadiness {
  if (dependencies.length === 0) return { ready: false, health: "unknown", blockers: [], warnings: [] };
  const blockers = dependencies.filter((dependency) => dependency.required && dependency.health !== "healthy");
  const warnings = dependencies.filter((dependency) => !dependency.required && dependency.health !== "healthy");
  const health = blockers.length
    ? healthPriority.find((state) => blockers.some((dependency) => dependency.health === state)) ?? "unknown"
    : warnings.length
      ? "degraded"
      : "healthy";
  return { ready: blockers.length === 0, health, blockers, warnings };
}

export type CapabilityAuthorization = {
  trustLevel: CapabilityTrustLevel;
  readiness: CapabilityReadiness;
  humanApproved: boolean;
  policyAllowsAutomatic: boolean;
  consequential: boolean;
  emergencyPaused?: boolean;
};

export function authorizeCapabilityExecution(input: CapabilityAuthorization) {
  if (input.emergencyPaused) return { allowed: false as const, reason: "Emergency pause is active." };
  if (!input.readiness.ready) {
    return {
      allowed: false as const,
      reason: input.readiness.blockers[0]?.reason || "A required dependency is not healthy."
    };
  }
  if (input.trustLevel === "unverified") return { allowed: false as const, reason: "This capability has not been verified." };
  if (input.trustLevel === "observing") return { allowed: false as const, reason: "This capability is observing only." };
  if (input.consequential && !input.humanApproved) {
    return { allowed: false as const, reason: "This consequential action requires explicit human approval." };
  }
  if (input.humanApproved) return { allowed: true as const, basis: "human_approval" as const };
  if (input.trustLevel === "assisted") return { allowed: false as const, reason: "This capability requires human approval." };
  if (!input.policyAllowsAutomatic) return { allowed: false as const, reason: "No active automation policy authorizes this action." };
  return { allowed: true as const, basis: "automation_policy" as const };
}

const allowedTransitions: Record<CapabilityActionState, CapabilityActionState[]> = {
  planned: ["queued", "blocked", "needs_attention"],
  queued: ["attempted", "blocked", "failed", "delayed", "needs_attention"],
  attempted: ["provider_accepted", "delivered", "confirmed", "completed", "failed", "blocked", "delayed", "unknown", "needs_attention"],
  provider_accepted: ["delivered", "confirmed", "completed", "failed", "delayed", "unknown", "needs_attention"],
  delivered: ["confirmed", "completed", "failed", "needs_attention"],
  confirmed: ["completed", "failed", "needs_attention"],
  delayed: ["attempted", "provider_accepted", "delivered", "confirmed", "completed", "failed", "unknown", "needs_attention"],
  unknown: ["attempted", "provider_accepted", "delivered", "confirmed", "completed", "failed", "needs_attention"],
  needs_attention: ["queued", "attempted", "blocked", "failed", "completed"],
  failed: ["queued", "attempted", "delivered", "confirmed", "completed", "needs_attention"],
  blocked: ["queued", "needs_attention"],
  completed: []
};

export function canTransitionCapabilityAction(from: CapabilityActionState, to: CapabilityActionState) {
  return from === to || allowedTransitions[from].includes(to);
}

export function assertCapabilityActionTransition(input: {
  from: CapabilityActionState;
  to: CapabilityActionState;
  providerEvidence?: boolean;
  completionEvidence?: boolean;
  confirmationRequired?: boolean;
}) {
  if (!canTransitionCapabilityAction(input.from, input.to)) {
    return { allowed: false as const, reason: `Invalid action state transition from ${input.from} to ${input.to}.` };
  }
  if (["provider_accepted", "delivered", "confirmed"].includes(input.to) && !input.providerEvidence) {
    return { allowed: false as const, reason: `${input.to} requires provider or destination evidence.` };
  }
  if (input.to === "completed" && input.confirmationRequired && !input.completionEvidence) {
    return { allowed: false as const, reason: "Completion requires outcome evidence." };
  }
  return { allowed: true as const };
}

export type FailureReasonCategory =
  | "provider_outage"
  | "transient_provider_error"
  | "rate_limited"
  | "authentication"
  | "account_suspended"
  | "consent"
  | "opt_out"
  | "compliance"
  | "invalid_destination"
  | "content_policy"
  | "authorization"
  | "configuration"
  | "unknown";

export function evaluateFallback(input: {
  reason: FailureReasonCategory;
  alternateConfigured: boolean;
  alternateAuthorized: boolean;
  alternateHealthy: boolean;
  consentStillValid: boolean;
}) {
  const eligibleReason = ["provider_outage", "transient_provider_error", "rate_limited"].includes(input.reason);
  if (!eligibleReason) return { allowed: false as const, reason: `Fallback cannot bypass ${input.reason}.` };
  if (!input.consentStillValid) return { allowed: false as const, reason: "Fallback cannot bypass consent or opt-out state." };
  if (!input.alternateConfigured) return { allowed: false as const, reason: "No alternate provider is configured." };
  if (!input.alternateAuthorized) return { allowed: false as const, reason: "The alternate provider is not authorized for this tenant and action." };
  if (!input.alternateHealthy) return { allowed: false as const, reason: "The alternate provider is not healthy." };
  return { allowed: true as const };
}

export type CircuitState = "closed" | "open" | "half_open";

export function nextCircuitState(input: {
  state: CircuitState;
  event: "success" | "failure" | "probe_due";
  consecutiveFailures: number;
  failureThreshold: number;
}) {
  if (input.state === "open") {
    return input.event === "probe_due" ? { state: "half_open" as const, allowProbe: true } : { state: "open" as const, allowProbe: false };
  }
  if (input.state === "half_open") {
    return input.event === "success"
      ? { state: "closed" as const, allowProbe: false }
      : { state: "open" as const, allowProbe: false };
  }
  if (input.event === "failure" && input.consecutiveFailures + 1 >= input.failureThreshold) {
    return { state: "open" as const, allowProbe: false };
  }
  return { state: "closed" as const, allowProbe: false };
}

export type TrustChangeRecommendation = {
  direction: "hold" | "regress" | "promote";
  recommendedLevel: CapabilityTrustLevel;
  automatic: boolean;
};

export function recommendTrustChange(input: {
  current: CapabilityTrustLevel;
  health: CapabilityHealthState;
  verifiedSuccesses: number;
  failures: number;
  meaningfulCorrections: number;
  minimumSuccesses?: number;
}): TrustChangeRecommendation {
  const attempts = input.verifiedSuccesses + input.failures;
  const failureRate = attempts ? input.failures / attempts : 0;
  const correctionRate = attempts ? input.meaningfulCorrections / attempts : 0;
  if (input.health !== "healthy" || failureRate >= 0.15 || correctionRate >= 0.1) {
    const next = input.current === "autonomous" || input.current === "trusted" ? "assisted" : input.current === "assisted" ? "observing" : input.current;
    return { direction: next === input.current ? "hold" as const : "regress" as const, recommendedLevel: next, automatic: next !== input.current };
  }
  const minimum = input.minimumSuccesses ?? 10;
  if (input.verifiedSuccesses >= minimum && input.failures === 0 && input.meaningfulCorrections === 0) {
    const next = input.current === "unverified" ? "observing" : input.current === "observing" ? "assisted" : input.current === "assisted" ? "trusted" : input.current === "trusted" ? "autonomous" : input.current;
    return { direction: next === input.current ? "hold" as const : "promote" as const, recommendedLevel: next, automatic: false };
  }
  return { direction: "hold" as const, recommendedLevel: input.current, automatic: false };
}

export function classifyProviderFailure(input: { retryable?: boolean; status?: number; blockedBy?: string | null; message?: string | null }): FailureReasonCategory {
  const marker = `${input.blockedBy ?? ""} ${input.message ?? ""}`.toLowerCase();
  if (marker.includes("consent")) return "consent";
  if (marker.includes("suppress") || marker.includes("opt out") || marker.includes("opt-out")) return "opt_out";
  if (marker.includes("compliance")) return "compliance";
  if (marker.includes("invalid") && (marker.includes("number") || marker.includes("email") || marker.includes("destination"))) return "invalid_destination";
  if (marker.includes("content") || marker.includes("filter")) return "content_policy";
  if (marker.includes("approval") || marker.includes("authoriz")) return "authorization";
  if (marker.includes("suspend")) return "account_suspended";
  if (input.status === 401 || input.status === 403 || marker.includes("credential") || marker.includes("authentication")) return "authentication";
  if (input.status === 429 || marker.includes("rate limit")) return "rate_limited";
  if (marker.includes("not configured") || marker.includes("setup")) return "configuration";
  if (input.status !== undefined && input.status >= 500) return "provider_outage";
  if (input.retryable) return "transient_provider_error";
  return "unknown";
}
