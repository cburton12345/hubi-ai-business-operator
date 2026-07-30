import { describe, expect, it } from "vitest";
import { getPublicPlan } from "./public-plans";

describe("public Ferocity plans", () => {
  it("sells the core AI engine as part of Starter", () => {
    const starter = getPublicPlan("starter");

    expect(starter?.bullets.some((item) => item.includes("Ask Ferocity"))).toBe(true);
    expect(starter?.bestFor).toMatch(/handles routine work/i);
    expect(starter?.bestFor).toMatch(/authority level the owner chooses/i);
  });

  it("does not advertise arbitrary AI run quotas", () => {
    for (const planKey of ["starter", "growth", "operator"]) {
      const plan = getPublicPlan(planKey);
      expect(plan?.bullets.join(" ")).not.toMatch(/\d[\d,]* included AI runs/i);
    }
  });

  it("provides expandable plan depth without crowding the cards", () => {
    expect(getPublicPlan("starter")!.moreFeatures.length).toBeGreaterThanOrEqual(12);
    expect(getPublicPlan("growth")!.moreFeatures.length).toBeGreaterThanOrEqual(15);
    expect(getPublicPlan("operator")!.moreFeatures.length).toBeGreaterThanOrEqual(15);
    expect(getPublicPlan("job_tracker")!.moreFeatures.length).toBeGreaterThanOrEqual(6);
  });
});
