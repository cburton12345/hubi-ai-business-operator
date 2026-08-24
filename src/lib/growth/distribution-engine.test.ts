import { describe, expect, it } from "vitest";
import { evaluateGrowthRisk, findUnverifiedClaims, getChannelCapabilityProfile, getGrowthChannel, scoreGrowthOpportunity, supportedCapabilities } from "./distribution-engine";
import { assistedHandoff, resolveDistributionRoute } from "./distribution-connector";

describe("growth distribution engine", () => {
  it("reports assisted platforms honestly", () => {
    expect(getGrowthChannel("facebook")?.defaultMode).toBe("assisted_browser");
    expect(supportedCapabilities("facebook")).toContain("community_rules");
    expect(getGrowthChannel("reddit")?.capabilities.publish).toBe("manual");
    expect(resolveDistributionRoute("facebook", "comment").requiresHumanControl).toBe(true);
    expect(assistedHandoff("facebook", "comment", "Review and post in the signed-in account.").status).toBe("needs_human");
    expect(getChannelCapabilityProfile("facebook")?.authenticationRequirements).toContain("Legitimate signed-in account");
    expect(getChannelCapabilityProfile("facebook")?.unsupportedCapabilities).toContain("send_message");
  });

  it("stops actions for verification without treating it as enforcement", () => {
    expect(evaluateGrowthRisk({ authorizationStatus: "verification_required" })).toEqual({
      state: "verification_required",
      reasons: ["The legitimate account owner must complete provider verification."],
      mayExecute: false
    });
  });

  it("uses configured limits rather than a fake universal posting cap", () => {
    expect(evaluateGrowthRisk({ authorizationStatus: "connected", recentActions: 8, configuredDailyLimit: 8 }).state).toBe("throttled");
    expect(evaluateGrowthRisk({ authorizationStatus: "connected", recentActions: 200, configuredDailyLimit: null }).state).toBe("healthy");
  });

  it("flags claims requiring business proof", () => {
    expect(findUnverifiedClaims("We are licensed and guarantee the best price.")).toHaveLength(2);
    expect(findUnverifiedClaims("We are licensed.", ["Licensed in Wisconsin"])).toHaveLength(0);
  });

  it("scores expressed demand against service and geography", () => {
    const score = scoreGrowthOpportunity({
      text: "Looking for a roofer in Eau Claire. Who can give me an estimate?",
      serviceTerms: ["roofer"],
      geographyTerms: ["Eau Claire"],
      objectiveTerms: ["estimate"]
    });
    expect(score.overallScore).toBeGreaterThan(60);
  });
});
