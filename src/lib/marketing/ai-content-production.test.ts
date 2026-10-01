import { describe, expect, it } from "vitest";
import {
  classifyOrganicPerformance,
  ensureCapabilityShowcaseConcept,
  normalizeContentConcepts,
  scoreOrganicEffectiveness,
  type ContentConcept,
} from "./ai-content-production";
import {
  buildCapabilityShowcase,
  capabilityShowcaseBody,
} from "./capability-showcase";

describe("organic content validation", () => {
  it("requires a business outcome before declaring a winner", () => {
    expect(
      classifyOrganicPerformance({
        publishCount: 1,
        engagementCount: 20,
        conversationCount: 1,
        leadCount: 0,
        customerWins: 0,
        pipelineValueCents: 0,
        wonRevenueCents: 0,
      }),
    ).toBe("promising");
    expect(
      classifyOrganicPerformance({
        publishCount: 1,
        engagementCount: 2,
        conversationCount: 0,
        leadCount: 2,
        customerWins: 0,
        pipelineValueCents: 0,
        wonRevenueCents: 0,
      }),
    ).toBe("winner");
    expect(
      classifyOrganicPerformance({
        publishCount: 1,
        engagementCount: 0,
        conversationCount: 0,
        leadCount: 0,
        customerWins: 0,
        pipelineValueCents: 0,
        wonRevenueCents: 25000,
      }),
    ).toBe("winner");
  });

  it("scores business results above surface engagement", () => {
    expect(
      scoreOrganicEffectiveness({
        publishCount: 1,
        engagementCount: 100,
        conversationCount: 0,
        leadCount: 0,
        customerWins: 0,
        pipelineValueCents: 0,
        wonRevenueCents: 0,
      }),
    ).toBe(50);
    expect(
      scoreOrganicEffectiveness({
        publishCount: 1,
        engagementCount: 1,
        conversationCount: 0,
        leadCount: 0,
        customerWins: 1,
        pipelineValueCents: 0,
        wonRevenueCents: 0,
      }),
    ).toBe(90);
    expect(
      scoreOrganicEffectiveness({
        publishCount: 1,
        engagementCount: 0,
        conversationCount: 0,
        leadCount: 0,
        customerWins: 0,
        pipelineValueCents: 0,
        wonRevenueCents: 100,
      }),
    ).toBe(100);
  });

  it("keeps only sourced, unique, supported concepts", () => {
    const base = {
      key: "Proof Video",
      outputType: "short_video_script",
      platform: "tiktok",
      format: "ugc_video",
      title: "Proof",
      hook: "Hook",
      body: "Body",
      cta: "Learn",
      audienceHypothesis: "Buyer",
      messageHypothesis: "Proof works",
      rationale: "Test",
      evidence: ["Verified review"],
      requiresVisual: true,
    } as ContentConcept;
    expect(
      normalizeContentConcepts([
        base,
        { ...base },
        { ...base, key: "unsourced", evidence: [] },
      ]),
    ).toHaveLength(1);
    expect(normalizeContentConcepts([base])[0]).toMatchObject({
      key: "proof-video",
      outputType: "short_video_script",
      format: "ugc_video",
    });
  });

  it("uses only enabled, curated capabilities in a customer-safe showcase", () => {
    const items = buildCapabilityShowcase([
      { feature_key: "ai_marketing_department", status: "enabled" },
      { feature_key: "content_studio", status: "enabled" },
      { feature_key: "publishing_queue", status: "enabled" },
      { feature_key: "voice_ai", status: "disabled" },
      { feature_key: "made_up_feature", status: "enabled" },
    ]);
    expect(items.map((item) => item.featureKey)).toEqual([
      "ai_marketing_department",
      "content_studio",
      "publishing_queue",
    ]);
    expect(capabilityShowcaseBody(items)).toContain("not a shelf of tools");
    expect(capabilityShowcaseBody(items)).toContain("approval rules");
    expect(capabilityShowcaseBody(items)).not.toContain("made_up_feature");
  });

  it("adds one verified capability showcase without turning every concept into a list", () => {
    const base = {
      key: "helpful",
      outputType: "facebook_post",
      platform: "facebook",
      format: "post",
      title: "Helpful",
      hook: "Hook",
      body: "Body",
      cta: "Learn",
      audienceHypothesis: "Buyer",
      messageHypothesis: "Help works",
      rationale: "Test",
      evidence: ["Verified fact"],
      requiresVisual: false,
      approach: "problem_solution",
    } as ContentConcept;
    const items = buildCapabilityShowcase([
      { feature_key: "ai_marketing_department", status: "enabled" },
      { feature_key: "content_studio", status: "enabled" },
      { feature_key: "publishing_queue", status: "enabled" },
    ]);
    const result = ensureCapabilityShowcaseConcept([base], items);
    expect(result).toHaveLength(2);
    expect(
      result.filter((concept) => concept.approach === "capability_showcase"),
    ).toHaveLength(1);
    expect(
      result.filter((concept) => concept.approach === "problem_solution"),
    ).toHaveLength(1);
  });

  it("keeps the required showcase when a full AI package reaches the output limit", () => {
    const concepts = Array.from({ length: 10 }, (_, index) => ({
      key: `concept-${index}`,
      outputType: "facebook_post",
      platform: "facebook",
      format: "post",
      title: `Concept ${index}`,
      hook: "Hook",
      body: "Body",
      cta: "Learn",
      audienceHypothesis: "Buyer",
      messageHypothesis: "Useful",
      rationale: "Test",
      evidence: ["Verified fact"],
      requiresVisual: false,
      approach: "problem_solution",
    })) as ContentConcept[];
    const items = buildCapabilityShowcase([
      { feature_key: "ai_marketing_department", status: "enabled" },
      { feature_key: "content_studio", status: "enabled" },
      { feature_key: "publishing_queue", status: "enabled" },
    ]);
    const normalized = normalizeContentConcepts(
      ensureCapabilityShowcaseConcept(concepts, items),
    );
    expect(normalized).toHaveLength(10);
    expect(normalized[0].approach).toBe("capability_showcase");
  });
});
