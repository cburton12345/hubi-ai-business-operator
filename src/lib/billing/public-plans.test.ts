import { describe, expect, it } from "vitest";
import { getPublicPlan } from "./public-plans";

describe("public Ferocity plans", () => {
  it("sells the core AI engine as part of Starter", () => {
    const starter = getPublicPlan("starter");

    expect(starter?.bullets).toContain("Command Engine: ask Ferocity in plain English");
    expect(starter?.bullets.some((item) => item.startsWith("AI Office Manager:"))).toBe(true);
    expect(starter?.bullets.some((item) => item.startsWith("Authority Lite:"))).toBe(true);
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
