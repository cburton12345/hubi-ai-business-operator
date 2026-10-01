import { describe, expect, it } from "vitest";

import { buildFerocitySalesFollowUpPlan } from "./ferocity-sales-followup-plan";

describe("buildFerocitySalesFollowUpPlan", () => {
  it("uses the saved diagnosis, gives a real next step, and stops after three touches", () => {
    const plan = buildFerocitySalesFollowUpPlan({
      formPublicKey: "ferocity-public",
      source: "website_chat",
      sourceDetail: "ferocity_public_diagnostic_plan",
      name: "Taylor Owner",
      email: "taylor@example.com",
      leadType: "demo",
      consentToContact: true,
      utm: {},
      details: {
        diagnosticTranscript: [
          { speaker: "visitor", body: "We lose estimates after sending them." },
          { speaker: "assistant", body: "Ferocity should first connect estimate follow-up to the sales pipeline and stop sequences when a customer replies." }
        ]
      }
    });

    expect(plan).toHaveLength(3);
    expect(plan[0].delayHours).toBe(2);
    expect(plan[0].message).toContain("estimate follow-up");
    expect(plan[0].message).toContain("https://ferocity.live/pricing");
    expect(plan[2].message).toContain("close the loop");
  });
});
