import { describe, expect, it } from "vitest";

import { normalizeFunnelStrategy, type FunnelStrategyPlan } from "@/lib/ai/funnel-strategy";

const fallback: FunnelStrategyPlan = {
  funnelName: "Fallback funnel",
  positioning: "Fallback positioning",
  headline: "Fallback headline",
  shortDemoHook: "Fallback hook",
  qualificationQuestions: ["Fallback question"],
  followUpPlan: ["Fallback follow-up"],
  trackingPlan: ["Fallback tracking"],
  creativeAngles: [{ angle: "Fallback", hook: "Fallback hook", cta: "Fallback CTA" }],
  safetyChecks: ["Approval required"],
  recommendedNextAction: "Review"
};

describe("normalizeFunnelStrategy", () => {
  it("falls back field-by-field when the model returns incompatible types", () => {
    const result = normalizeFunnelStrategy({
      funnelName: "Useful name",
      followUpPlan: "Send a message",
      trackingPlan: { source: ["clicks"] },
      creativeAngles: [{ angle: "Problem", hook: "Helpful hook" }]
    }, fallback);

    expect(result.funnelName).toBe("Useful name");
    expect(result.followUpPlan).toEqual(fallback.followUpPlan);
    expect(result.trackingPlan).toEqual(fallback.trackingPlan);
    expect(result.creativeAngles).toEqual(fallback.creativeAngles);
  });

  it("bounds valid model output", () => {
    const result = normalizeFunnelStrategy({
      ...fallback,
      qualificationQuestions: ["  Where is the property?  "],
      creativeAngles: [{ angle: "Proof", hook: "Use verified proof", cta: "Request a quote" }]
    }, fallback);

    expect(result.qualificationQuestions).toEqual(["Where is the property?"]);
    expect(result.creativeAngles[0].cta).toBe("Request a quote");
  });
});
