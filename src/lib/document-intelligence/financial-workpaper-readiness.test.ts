import { describe, expect, it } from "vitest";
import { evaluateFinancialWorkpaperReadiness, type FinancialWorkpaperReadinessInput } from "./financial-workpaper-readiness";
import { summarizeStatementYearCoverage } from "./statement-year-coverage";

function complete(overrides: Partial<FinancialWorkpaperReadinessInput> = {}): FinancialWorkpaperReadinessInput {
  return {
    year: 2025,
    sourceDocumentCount: 12,
    statementDocumentCount: 12,
    transactionCount: 1_995,
    coverage: summarizeStatementYearCoverage(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    incompleteBatchCount: 0,
    failedDocumentCount: 0,
    unusableExtractionCount: 0,
    incompletePageCoverageCount: 0,
    unreconciledStatementCount: 0,
    unresolvedDuplicateCount: 0,
    unsafeTransferCount: 0,
    unsupportedAllocationCount: 0,
    reviewerUnavailableCount: 0,
    reviewerDisagreementCount: 0,
    humanReviewPendingCount: 0,
    unclassifiedExpenseCount: 0,
    unassignedExpenseCount: 0,
    unclassifiedDepositCount: 0,
    ...overrides,
  };
}

describe("financial workpaper readiness", () => {
  it("allows a reconciled and reviewed packet to claim only preparer-review readiness", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete());
    expect(result.status).toBe("ready_for_preparer");
    expect(result.canClaimReadyForPreparer).toBe(true);
    expect(result.canClaimComplete).toBe(false);
    expect(result.blocks).toEqual([]);
  });

  it("blocks completion when a statement month is missing", () => {
    const coverage = summarizeStatementYearCoverage(2025, [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    const result = evaluateFinancialWorkpaperReadiness(complete({ coverage, sourceDocumentCount: 11, statementDocumentCount: 11 }));
    expect(result.status).toBe("needs_sources");
    expect(result.blocks.map((block) => block.code)).toContain("missing_statement_periods");
    expect(result.nextAction).toContain("May");
  });

  it("blocks empty or partial extraction even when models agree", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete({
      transactionCount: 0,
      unusableExtractionCount: 1,
      incompletePageCoverageCount: 1,
    }));
    expect(result.status).toBe("needs_sources");
    expect(result.blocks.map((block) => block.code)).toEqual(expect.arrayContaining([
      "unusable_extraction",
      "incomplete_page_coverage",
    ]));
    expect(result.canClaimReadyForPreparer).toBe(false);
  });

  it("blocks unsafe transfer inclusion and unresolved duplicates", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete({
      unsafeTransferCount: 2,
      unresolvedDuplicateCount: 3,
    }));
    expect(result.status).toBe("needs_review");
    expect(result.blocks.map((block) => block.code)).toEqual(expect.arrayContaining([
      "unsafe_transfer_treatment",
      "unresolved_duplicate",
    ]));
  });

  it("keeps unsupported property formulas out of a preparer-ready claim", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete({ unsupportedAllocationCount: 18 }));
    expect(result.status).toBe("needs_review");
    expect(result.blocks.find((block) => block.code === "unsupported_property_assignment")?.nextAction)
      .toContain("direct evidence");
  });

  it("allows a printable draft while assignments and deposit classifications remain unresolved", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete({
      unclassifiedExpenseCount: 28,
      unassignedExpenseCount: 49,
      unclassifiedDepositCount: 143,
    }));
    expect(result.printableDraft).toBe(true);
    expect(result.canClaimReadyForPreparer).toBe(false);
    expect(result.status).toBe("needs_review");
    expect(result.blocks.map((block) => block.code)).toContain("unclassified_expense");
  });

  it("requires a distinct or recorded human review for high-impact documents", () => {
    const result = evaluateFinancialWorkpaperReadiness(complete({
      reviewerUnavailableCount: 1,
      humanReviewPendingCount: 1,
    }));
    expect(result.blocks.map((block) => block.code)).toEqual(expect.arrayContaining([
      "independent_review_unavailable",
      "human_review_pending",
    ]));
  });
});
