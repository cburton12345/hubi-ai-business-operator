import type { GrowthAutonomyLevel, GrowthRiskState } from "./distribution-engine";

export type GrowthPolicyScope = {
  level: "organization" | "brand" | "objective" | "channel" | "identity" | "community" | "action";
  autonomyLevel?: GrowthAutonomyLevel;
  enabled?: boolean;
  rolloutStage?: 1 | 2 | 3 | 4 | 5;
  dailyActionLimit?: number | null;
  minimumIntervalMinutes?: number | null;
  requiresVerifiedIdentity?: boolean;
  approvalRequired?: boolean;
};

export type ResolvedGrowthPolicy = {
  autonomyLevel: GrowthAutonomyLevel;
  enabled: boolean;
  rolloutStage: 1 | 2 | 3 | 4 | 5;
  dailyActionLimit: number | null;
  minimumIntervalMinutes: number | null;
  requiresVerifiedIdentity: boolean;
  approvalRequired: boolean;
  provenance: string[];
};

const specificity: Record<GrowthPolicyScope["level"], number> = {
  organization: 1, brand: 2, objective: 3, channel: 4, identity: 5, community: 6, action: 7
};

export function resolveGrowthPolicy(scopes: GrowthPolicyScope[]): ResolvedGrowthPolicy {
  const result: ResolvedGrowthPolicy = {
    autonomyLevel: "suggest", enabled: true, rolloutStage: 1, dailyActionLimit: null,
    minimumIntervalMinutes: null, requiresVerifiedIdentity: true, approvalRequired: true, provenance: []
  };
  for (const scope of [...scopes].sort((a, b) => specificity[a.level] - specificity[b.level])) {
    if (scope.autonomyLevel !== undefined) result.autonomyLevel = scope.autonomyLevel;
    if (scope.enabled !== undefined) result.enabled = scope.enabled;
    if (scope.rolloutStage !== undefined) result.rolloutStage = scope.rolloutStage;
    if (scope.dailyActionLimit !== undefined) result.dailyActionLimit = scope.dailyActionLimit;
    if (scope.minimumIntervalMinutes !== undefined) result.minimumIntervalMinutes = scope.minimumIntervalMinutes;
    if (scope.requiresVerifiedIdentity !== undefined) result.requiresVerifiedIdentity = scope.requiresVerifiedIdentity;
    if (scope.approvalRequired !== undefined) result.approvalRequired = scope.approvalRequired;
    result.provenance.push(scope.level);
  }
  if (result.rolloutStage <= 1) result.enabled = false;
  if (result.rolloutStage <= 2) result.autonomyLevel = "suggest";
  if (result.rolloutStage === 3) result.autonomyLevel = "approve";
  if (result.autonomyLevel !== "autopilot") result.approvalRequired = true;
  return result;
}

export function mayExecuteGrowthAction(input: {
  policy: ResolvedGrowthPolicy;
  riskState: GrowthRiskState;
  identityVerified: boolean;
  connectorOfficial: boolean;
}) {
  const reasons: string[] = [];
  if (!input.policy.enabled) reasons.push("The rollout stage or scoped policy does not allow execution.");
  if (input.policy.requiresVerifiedIdentity && !input.identityVerified) reasons.push("The distribution identity is not verified.");
  if (input.riskState !== "healthy") reasons.push(`Identity health is ${input.riskState}.`);
  if (!input.connectorOfficial) reasons.push("This capability requires assisted or human completion.");
  if (input.policy.approvalRequired) reasons.push("Owner approval is required.");
  return { mayExecute: reasons.length === 0, reasons };
}

export type IdentityHealthEvent = "success" | "transient_failure" | "rate_limited" | "verification_required" | "restricted" | "owner_paused" | "verification_cleared" | "cooldown_elapsed" | "connector_incompatible";

export function transitionIdentityHealth(current: GrowthRiskState, event: IdentityHealthEvent): GrowthRiskState {
  if (event === "owner_paused") return "disabled";
  if (event === "verification_required") return "verification_required";
  if (event === "restricted") return "restricted";
  if (event === "rate_limited") return "throttled";
  if (event === "connector_incompatible") return "caution";
  if (event === "transient_failure") return current === "healthy" ? "caution" : "cooldown";
  if (event === "verification_cleared") return "cooldown";
  if (event === "cooldown_elapsed") return "caution";
  if (event === "success") return current === "caution" ? "healthy" : current;
  return current;
}

export function communityEligibility(input: {
  status: string;
  rulesKnown: boolean;
  rulesFresh: boolean;
  relevanceScore: number;
  postingPolicy: string;
  identityHealth: GrowthRiskState;
}) {
  const reasons: string[] = [];
  if (input.status !== "active") reasons.push("Community is not active.");
  if (!input.rulesKnown) reasons.push("Community rules are unknown.");
  if (!input.rulesFresh) reasons.push("Community rules need to be checked again.");
  if (input.relevanceScore < 50) reasons.push("Community relevance is too low.");
  if (input.postingPolicy === "disabled") reasons.push("Posting is disabled for this community.");
  if (input.identityHealth !== "healthy") reasons.push(`Identity health is ${input.identityHealth}.`);
  return { eligible: reasons.length === 0, reasons };
}

export function identityMatchDecision(input: { exactChannelIdentity?: boolean; verifiedPhone?: boolean; verifiedEmail?: boolean; nameSimilarity?: number }) {
  let confidence = input.exactChannelIdentity ? 100 : 0;
  const provenance: string[] = input.exactChannelIdentity ? ["exact_channel_identity"] : [];
  if (input.verifiedPhone) { confidence = Math.max(confidence, 95); provenance.push("verified_phone"); }
  if (input.verifiedEmail) { confidence = Math.max(confidence, 95); provenance.push("verified_email"); }
  if ((input.nameSimilarity ?? 0) >= 0.9) { confidence = Math.max(confidence, 45); provenance.push("name_similarity_only"); }
  return { confidence, provenance, mayAutoLink: confidence >= 95, requiresReview: confidence > 0 && confidence < 95 };
}
