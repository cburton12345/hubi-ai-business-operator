import { describe, expect, it } from "vitest";
import { calculateJobMargin } from "@/lib/service-ops/job-margin";

describe("calculateJobMargin", () => {
  it("separates invoiced margin from actual cash margin and subtracts refunds once", () => {
    const margin = calculateJobMargin({
      invoicedCents: 20_000,
      collectedCents: 15_000,
      refundedCents: 2_000,
      writtenOffCents: 1_000,
      laborCents: 4_000,
      materialCents: 3_000,
      directExpenseCents: 1_000,
      approvedOverheadCents: 500
    }, { hasInvoice: true, hasLaborEvidence: true, hasMaterialEvidence: true, hasExpenseEvidence: true, overheadPolicyApplied: true });
    expect(margin.netCollectedCents).toBe(13_000);
    expect(margin.totalCostCents).toBe(8_500);
    expect(margin.invoiceMarginCents).toBe(10_500);
    expect(margin.cashMarginCents).toBe(4_500);
    expect(margin.complete).toBe(true);
  });

  it("never hides missing evidence behind zeroes", () => {
    const margin = calculateJobMargin({ invoicedCents: 0, collectedCents: 0, refundedCents: 0, writtenOffCents: 0, laborCents: 0, materialCents: 0, directExpenseCents: 0, approvedOverheadCents: 0 }, {
      hasInvoice: false, hasLaborEvidence: false, hasMaterialEvidence: false, hasExpenseEvidence: false, overheadPolicyApplied: false
    });
    expect(margin.complete).toBe(false);
    expect(margin.missingEvidence).toEqual(["invoice", "labor", "materials", "direct expenses", "overhead policy"]);
    expect(margin.invoiceMarginPercent).toBeNull();
  });
});
