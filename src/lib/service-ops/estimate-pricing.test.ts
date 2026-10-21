import { describe, expect, it } from "vitest";
import { calculateEstimatePricing } from "./estimate-pricing";

describe("calculateEstimatePricing", () => {
  it("recalculates selected options, proportional taxable discount, tax, and margin", () => {
    const result = calculateEstimatePricing({
      lines: [
        { quantity: 2, unitPriceCents: 10_000, unitCostCents: 4_000, taxable: true, selected: true },
        { quantity: 1, unitPriceCents: 5_000, unitCostCents: 2_000, taxable: false, selected: true },
        { quantity: 1, unitPriceCents: 9_000, unitCostCents: 1_000, taxable: true, selected: false }
      ],
      discountCents: 2_500,
      taxRateBps: 500
    });

    expect(result).toMatchObject({
      subtotalCents: 25_000,
      taxableSubtotalCents: 20_000,
      discountCents: 2_500,
      taxCents: 900,
      totalCents: 23_400,
      estimatedCostCents: 10_000,
      grossProfitCents: 12_500,
      grossMarginPercent: 55.56,
      warnings: []
    });
  });

  it("bounds discounts and warns instead of treating missing costs as proven margin", () => {
    const result = calculateEstimatePricing({
      lines: [{ quantity: "1", unitPriceCents: 1_000, unitCostCents: 0, taxable: true, selected: true }],
      discountCents: 9_999,
      taxRateBps: 725
    });

    expect(result.discountCents).toBe(1_000);
    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.grossMarginPercent).toBeNull();
    expect(result.warnings).toContain("One or more selected line items do not have cost evidence.");
  });

  it("excludes unselected options and warns when the estimate has no selected scope", () => {
    const result = calculateEstimatePricing({
      lines: [{ quantity: 1, unitPriceCents: 5_000, unitCostCents: 3_000, taxable: true, selected: false }]
    });
    expect(result.totalCents).toBe(0);
    expect(result.warnings).toContain("No selected line items are included in the customer total.");
  });
});
