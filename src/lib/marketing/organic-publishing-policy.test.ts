import { describe, expect, it } from "vitest";
import { evaluateOrganicContentQuality, includedOrganicPublishingMoments, organicPublishingAllowance } from "./organic-publishing-policy";

describe("organic publishing policy", () => {
  it("uses weekly publishing moments rather than counting every channel adaptation", () => {
    expect(includedOrganicPublishingMoments("starter")).toBe(2);
    expect(includedOrganicPublishingMoments("growth")).toBe(4);
    expect(includedOrganicPublishingMoments("operator")).toBe(7);
    expect(organicPublishingAllowance({ planKey: "starter", usedMomentKeys: ["proof-1", "proof-1"] })).toEqual({
      limit: 2, used: 1, remaining: 1, allowed: true
    });
  });

  it("passes specific grounded content", () => {
    const result = evaluateOrganicContentQuality({
      title: "What changed after the intake review",
      body: "A client kept losing time between intake and scheduling. The team documented the handoff, removed one duplicate approval, and shortened the response path. Ask us to review where your next handoff stalls.",
      sourceFactCount: 3,
      claimsVerified: true
    });
    expect(result.status).toBe("passed");
    expect(result.riskFlags).toEqual([]);
  });

  it("blocks invented claims and content with no real business source", () => {
    const result = evaluateOrganicContentQuality({
      body: "Unlock your potential with the guaranteed #1 game-changing solution. Don't miss out!",
      sourceFactCount: 0,
      claimsVerified: false
    });
    expect(result.status).toBe("blocked");
    expect(result.riskFlags).toEqual(expect.arrayContaining(["no_business_source", "unsupported_claim", "generic_ai_language"]));
  });

  it("requires an approved visual when the format needs one", () => {
    const result = evaluateOrganicContentQuality({
      body: "This completed project solved a documented drainage problem. See the before-and-after details and request an assessment for your property.",
      sourceFactCount: 2,
      claimsVerified: true,
      requiresVisual: true,
      approvedAssetCount: 0
    });
    expect(result.status).toBe("needs_edit");
    expect(result.riskFlags).toContain("missing_approved_visual");
  });

  it("blocks manufactured urgency and coercive psychology", () => {
    const result = evaluateOrganicContentQuality({
      body: "Act now before it's too late. Smart businesses already bought this, so what are you waiting for?",
      sourceFactCount: 2,
      claimsVerified: true,
      urgencyVerified: false
    });
    expect(result.status).toBe("blocked");
    expect(result.riskFlags).toEqual(expect.arrayContaining(["manufactured_urgency", "coercive_persuasion"]));
  });

  it("permits truthful urgency when the underlying fact was verified", () => {
    const result = evaluateOrganicContentQuality({
      body: "Registration is ending today because the documented class starts tomorrow. Review the schedule and book if the timing fits your needs.",
      sourceFactCount: 2,
      claimsVerified: true,
      urgencyVerified: true
    });
    expect(result.riskFlags).not.toContain("manufactured_urgency");
  });
});
