import { describe, expect, it } from "vitest";
import { analyzeProviderPromotion, resolvePromotionSafetyBoundaries } from "./provider-promotions";

const now = new Date("2026-08-01T00:00:00.000Z");

describe("analyzeProviderPromotion", () => {
  it("recommends accepting when planned spend already qualifies", () => {
    const result = analyzeProviderPromotion({
      creditCents: 30000,
      requiredSpendCents: 50000,
      plannedSpendWithoutOfferCents: 50000,
      qualifyingPeriodEndsAt: "2026-09-01T00:00:00.000Z"
    }, now);
    expect(result.recommendation).toBe("accept");
    expect(result.incrementalSpendCents).toBe(0);
  });

  it("recommends review when the credit exceeds unplanned spend", () => {
    const result = analyzeProviderPromotion({
      creditCents: 30000,
      requiredSpendCents: 50000,
      plannedSpendWithoutOfferCents: 25000,
      qualifyingPeriodEndsAt: "2026-09-01T00:00:00.000Z"
    }, now);
    expect(result.recommendation).toBe("review");
    expect(result.conservativeNetValueCents).toBe(5000);
  });

  it("recommends skipping an expired or value-negative offer", () => {
    expect(analyzeProviderPromotion({
      creditCents: 10000,
      requiredSpendCents: 50000,
      plannedSpendWithoutOfferCents: 0,
      qualifyingPeriodEndsAt: "2026-09-01T00:00:00.000Z"
    }, now).recommendation).toBe("skip");
    expect(analyzeProviderPromotion({
      creditCents: 30000,
      requiredSpendCents: 50000,
      plannedSpendWithoutOfferCents: 50000,
      claimDeadline: "2026-07-01T00:00:00.000Z"
    }, now).recommendation).toBe("skip");
  });

  it("tracks qualifying progress and required daily spend", () => {
    const result = analyzeProviderPromotion({
      creditCents: 30000,
      requiredSpendCents: 50000,
      plannedSpendWithoutOfferCents: 50000,
      qualifyingSpendRecordedCents: 20000,
      qualifyingPeriodEndsAt: "2026-08-11T00:00:00.000Z"
    }, now);
    expect(result.progressPercent).toBe(40);
    expect(result.requiredDailySpendCents).toBe(3000);
  });
});

describe("resolvePromotionSafetyBoundaries", () => {
  it("uses conservative automatic boundaries when the customer leaves optional limits blank", () => {
    expect(resolvePromotionSafetyBoundaries({ requiredSpendCents: 50000, requiredDailySpendCents: 5000 })).toEqual({
      budgetCents: 50000,
      dailyCents: 5000
    });
  });

  it("honors valid customer-selected limits", () => {
    expect(resolvePromotionSafetyBoundaries({
      requiredSpendCents: 50000,
      requiredDailySpendCents: 5000,
      customBudgetCents: 75000,
      customDailyLimitCents: 3000
    })).toEqual({ budgetCents: 75000, dailyCents: 3000 });
  });

  it("rejects a customer limit that makes the promotion impossible to qualify for", () => {
    expect(() => resolvePromotionSafetyBoundaries({
      requiredSpendCents: 50000,
      requiredDailySpendCents: 5000,
      customBudgetCents: 40000
    })).toThrow(/qualifying spend/i);
  });
});
