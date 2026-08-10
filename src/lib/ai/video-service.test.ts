import { describe, expect, it } from "vitest";
import {
  aggregateVideoFrameReviews,
  planVideoMarketingAsset,
  scoreVideoCreative,
  videoDeliverablesFor,
  videoFinishingPlan
} from "./video-service";

const strongInput = {
  goal: "Show overwhelmed roofing owners how Ferocity keeps every lead and job moving",
  serviceLabel: "Ferocity AI business operating system",
  offerLabel: "See Ferocity work",
  audience: "Owners of growing roofing companies",
  platform: "multi_platform" as const,
  durationSeconds: 20,
  sourceAssets: "Approved Ferocity product screens and customer-authorized job footage"
};

describe("video creative director", () => {
  it("scores a grounded concept before provider spend", () => {
    const result = scoreVideoCreative(strongInput);
    expect(result.decision).toBe("ready");
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.issues).toEqual([]);
  });

  it("blocks vague or unsupported absolute claims before a paid render", () => {
    const result = scoreVideoCreative({
      goal: "Best in town guaranteed",
      platform: "tiktok",
      durationSeconds: 15
    });
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
    const review = aggregateVideoFrameReviews([
      { inspected: false, score: 0, observations: [], issues: [] }
    ]);
    expect(review.status).toBe("unavailable");
    expect(review.decision).toBe("manual_review_required");
    expect(review.note).toContain("did not pretend");
  });
});
