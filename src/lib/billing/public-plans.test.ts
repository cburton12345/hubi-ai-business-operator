import { describe, expect, it } from "vitest";
import { getPublicPlan, isStripeSelfServePlanKey, managedVoicePricingLabel, publicEarnPlan, publicManagedSmsPricing, publicManagedVoicePricing, publicPlanPrice } from "./public-plans";

describe("public Ferocity plans", () => {
  it("offers a real no-card Free plan with deliberately bounded capabilities", () => {
    const free = getPublicPlan("free");

    expect(free?.priceCents).toBe(0);
    expect(free?.price).toBe("$0 forever");
    expect(free?.bullets.join(" ")).toMatch(/25 new leads each month/i);
    expect(free?.moreFeatures).toContain("No credit card required");
    expect(free?.moreFeatures.join(" ")).toMatch(/No managed voice or hosted SMS allowance/i);
    expect(isStripeSelfServePlanKey("free")).toBe(false);
  });

  it("sells the core AI engine as part of Starter", () => {
    const starter = getPublicPlan("starter");

    expect(starter?.bullets.some((item) => item.toLowerCase().includes("dashboard"))).toBe(true);
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

  it("keeps the Earn offer in shared public pricing copy", () => {
    expect(publicEarnPlan.name).toBe("Ferocity Earn");
    expect(publicEarnPlan.price).toBe("No fixed monthly fee");
    expect(publicEarnPlan.rates).toContain("0.9%");
    expect(publicEarnPlan.rates).toContain("6%");
    expect(publicEarnPlan.eligibility).toMatch(/actually collected/i);
    expect(publicEarnPlan.costs).toMatch(/^Provider usage.+remain separate/i);
    expect(publicEarnPlan.costs).toMatch(/written pilot exception/i);
  });

  it("keeps self-serve prices, annual savings, and sales-assisted pricing centralized", () => {
    const expected = {
      starter: [14900, 149000],
      growth: [34900, 349000]
    } as const;
    for (const [key, prices] of Object.entries(expected)) {
      const plan = getPublicPlan(key)!;
      expect(publicPlanPrice(plan, "month").cents).toBe(prices[0]);
      expect(publicPlanPrice(plan, "year").cents).toBe(prices[1]);
    }

    const operator = getPublicPlan("operator")!;
    expect(operator.salesAssisted).toBe(true);
    expect(operator.price).toMatch(/Custom.+from \$699\/mo/i);
    expect(publicPlanPrice(operator, "year").cents).toBe(69900);
    expect(operator.annualPriceCents).toBe(699000);
  });

  it("keeps newer intelligence capabilities represented without weakening the core plans", () => {
    const starter = getPublicPlan("starter");
    const growth = getPublicPlan("growth");
    const operator = getPublicPlan("operator");
    expect(starter?.moreFeatures.join(" ")).toMatch(/receipt.+statement intelligence/i);
    expect(growth?.bullets.join(" ")).toMatch(/collected cash.+capacity.+margin/i);
    expect(operator?.moreFeatures.join(" ")).toMatch(/closed-loop growth controller/i);
    for (const plan of [starter, growth, operator]) {
      expect(plan?.moreFeatures).toContain("One Ferocity Connect Android device included");
    }
  });

  it("keeps managed voice allowances and overage pricing in one source of truth", () => {
    expect(publicManagedVoicePricing.calls.includedMinutes).toBe(0);
    expect(publicManagedVoicePricing.starter.includedMinutes).toBe(25);
    expect(publicManagedVoicePricing.growth.includedMinutes).toBe(100);
    expect(publicManagedVoicePricing.operator.includedMinutes).toBe(300);
    for (const planKey of ["calls", "starter", "growth", "operator"] as const) {
      expect(publicManagedVoicePricing[planKey].overageCentsPerCompletedMinute).toBe(25);
      expect(managedVoicePricingLabel(planKey)).toContain("$0.25 per completed minute");
    }
  });

  it("includes useful hosted SMS allowances without advertising unlimited provider usage", () => {
    expect(publicManagedSmsPricing.starter.includedSegments).toBe(100);
    expect(publicManagedSmsPricing.growth.includedSegments).toBe(300);
    expect(publicManagedSmsPricing.operator.includedSegments).toBe(1000);
    expect(publicManagedSmsPricing.operator.overageCentsPerSegment).toBe(4);
  });
});
