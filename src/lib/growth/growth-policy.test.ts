import { describe, expect, it } from "vitest";
import { communityEligibility, identityMatchDecision, mayExecuteGrowthAction, resolveGrowthPolicy, transitionIdentityHealth } from "./growth-policy";

describe("growth policy and account protection", () => {
  it("resolves the most specific policy while enforcing rollout stage", () => {
    const policy = resolveGrowthPolicy([
      { level: "organization", rolloutStage: 4, autonomyLevel: "approve", dailyActionLimit: 20 },
      { level: "channel", dailyActionLimit: 5 },
      { level: "community", autonomyLevel: "autopilot" }
    ]);
    expect(policy.dailyActionLimit).toBe(5);
    expect(policy.autonomyLevel).toBe("autopilot");
    expect(policy.provenance).toEqual(["organization", "channel", "community"]);
  });

  it("keeps observe and suggest stages from executing", () => {
    expect(resolveGrowthPolicy([{ level: "organization", rolloutStage: 1, autonomyLevel: "autopilot" }]).enabled).toBe(false);
    expect(resolveGrowthPolicy([{ level: "organization", rolloutStage: 2, autonomyLevel: "autopilot" }]).autonomyLevel).toBe("suggest");
  });

  it("requires official capability, verified identity, healthy state, and authority", () => {
    const policy = resolveGrowthPolicy([{ level: "organization", rolloutStage: 4, autonomyLevel: "autopilot", approvalRequired: false }]);
    expect(mayExecuteGrowthAction({ policy, riskState: "healthy", identityVerified: true, connectorOfficial: true }).mayExecute).toBe(true);
    expect(mayExecuteGrowthAction({ policy, riskState: "verification_required", identityVerified: true, connectorOfficial: true }).mayExecute).toBe(false);
  });

  it("pauses for verification and resumes through cooldown instead of dumping a backlog", () => {
    expect(transitionIdentityHealth("healthy", "verification_required")).toBe("verification_required");
    expect(transitionIdentityHealth("verification_required", "verification_cleared")).toBe("cooldown");
    expect(transitionIdentityHealth("cooldown", "cooldown_elapsed")).toBe("caution");
    expect(transitionIdentityHealth("caution", "success")).toBe("healthy");
  });

  it("blocks communities with unknown or stale rules", () => {
    expect(communityEligibility({ status: "active", rulesKnown: false, rulesFresh: false, relevanceScore: 90, postingPolicy: "approval_required", identityHealth: "healthy" }).eligible).toBe(false);
    expect(communityEligibility({ status: "active", rulesKnown: true, rulesFresh: true, relevanceScore: 90, postingPolicy: "approval_required", identityHealth: "healthy" }).eligible).toBe(true);
  });

  it("does not merge cross-channel people from names alone", () => {
    expect(identityMatchDecision({ nameSimilarity: 0.99 })).toEqual({ confidence: 45, provenance: ["name_similarity_only"], mayAutoLink: false, requiresReview: true });
    expect(identityMatchDecision({ verifiedPhone: true }).mayAutoLink).toBe(true);
  });
});
