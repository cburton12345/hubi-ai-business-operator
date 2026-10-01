import { describe, expect, it } from "vitest";
import {
  aggregateVideoFrameReviews,
  extractVideoReferenceUrls,
  planVideoMarketingAsset,
  scoreVideoCreative,
  videoDeliverablesFor,
  videoFinishingPlan
} from "@/lib/ai/video-service";

const strongInput = {
  goal: "Show overwhelmed roofing owners how Ferocity keeps every lead and job moving",
  serviceLabel: "Ferocity AI business operating system",
  offerLabel: "See Ferocity work",
  audience: "Owners of growing roofing companies",
  platform: "multi_platform" as const,
  durationSeconds: 20,
  sourceAssets: "Approved Ferocity product screens and customer-authorized job footage"
};

describe("provider-neutral video planning", () => {
  it("extracts and de-duplicates direct reference image URLs", () => {
    expect(extractVideoReferenceUrls("Use https://cdn.example.com/product.jpg, https://cdn.example.com/product.jpg and https://cdn.example.com/team.png."))
      .toEqual(["https://cdn.example.com/product.jpg", "https://cdn.example.com/team.png"]);
  });

  it("plans native portrait and landscape sources plus a local square finish", () => {
    expect(videoDeliverablesFor("multi_platform").map((item) => [item.aspectRatio, item.productionMethod]))
      .toEqual([
        ["16:9", "source_render"],
        ["9:16", "local_reframe"],
        ["1:1", "local_reframe"]
      ]);
  });

  it("keeps brand context, quality, references, and variations in the saved plan", () => {
    const plan = planVideoMarketingAsset({
      goal: "Promote our spring sale to nearby homeowners",
      platform: "instagram",
      durationSeconds: 15,
      sourceAssets: "Product: https://cdn.example.com/product.jpg",
      variantCount: 2,
      quality: "balanced",
      brandContext: { companyName: "Acme", brandVoice: "Plainspoken and helpful" }
    });
    expect(plan.providerRequest.referenceAssetUrls).toEqual(["https://cdn.example.com/product.jpg"]);
    expect(plan.providerRequest.requestedQuality).toBe("balanced");
    expect(plan.metadata.brandContext).toMatchObject({ companyName: "Acme" });
    expect(plan.variantPrompts).toHaveLength(2);
  });

  it("turns UGC into a governed production workflow instead of a generic visual style", () => {
    const plan = planVideoMarketingAsset({
      goal: "Show how a busy owner gets an evening back",
      platform: "instagram",
      durationSeconds: 15,
      contentStyle: "ugc",
      brandContext: { companyName: "Acme", brandVoice: "Direct and human" }
    });
    expect(plan.providerRequest.contentStyle).toBe("ugc");
    expect(plan.providerRequest.ugcPlan).toMatchObject({
      format: "credible_first_person_story",
      actorPolicy: expect.stringContaining("Never imply")
    });
    expect(plan.metadata.ugcPlan).toBeTruthy();
  });
});

describe("video creative director", () => {
  it("scores a grounded concept before provider spend", () => {
    const result = scoreVideoCreative(strongInput);
    expect(result.decision).toBe("ready");
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.issues).toEqual([]);
  });

  it("blocks vague or unsupported absolute claims before a paid render", () => {
    const result = scoreVideoCreative({ goal: "Best in town guaranteed", platform: "tiktok", durationSeconds: 15 });
    expect(result.decision).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toContain("claim_review_required");
  });

  it("plans one paid source and local channel reframes", () => {
    const plan = planVideoMarketingAsset(strongInput);
    const deliverables = plan.metadata.deliverables as ReturnType<typeof videoDeliverablesFor>;
    expect(deliverables).toHaveLength(3);
    expect(deliverables[0].productionMethod).toBe("source_render");
    expect(deliverables.slice(1).every((item) => item.productionMethod === "local_reframe")).toBe(true);
    expect(plan.providerRequest.exportFormats).toContain("finished_video");
  });
});

describe("post-render quality and finishing", () => {
  it("chooses post-production repairs without charging for another render", () => {
    const review = aggregateVideoFrameReviews([
      {
        inspected: true,
        score: 78,
        observations: ["The subject is clear."],
        issues: [{
          category: "text",
          severity: "warning",
          message: "Generated text is not reliable.",
          repairableWithoutRerender: true,
          repair: "Replace it with an exact Ferocity overlay."
        }]
      },
      { inspected: true, score: 82, observations: ["Composition is usable."], issues: [] }
    ]);
    const finish = videoFinishingPlan({
      brandName: "Ferocity",
      domain: "ferocity.live",
      cta: "See Ferocity work",
      platform: "multi_platform",
      qualityReview: review
    });
    expect(review.decision).toBe("finish_with_repairs");
    expect(review.paidRerenderRequired).toBe(false);
    expect(finish.noAdditionalPremiumRender).toBe(true);
    expect(finish.automaticSteps).toContain("Replace it with an exact Ferocity overlay.");
  });

  it("keeps the publish gate closed when visual inspection is unavailable", () => {
    const review = aggregateVideoFrameReviews([{ inspected: false, score: 0, observations: [], issues: [] }]);
    expect(review.status).toBe("unavailable");
    expect(review.decision).toBe("manual_review_required");
    expect(review.note).toContain("did not pretend");
  });
});
