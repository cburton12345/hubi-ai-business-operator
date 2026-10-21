import { describe, expect, it } from "vitest";
import { compareDocumentExtractions, deterministicDocumentIssues, hasUsableDocumentExtraction, needsIndependentDocumentReview } from "./independent-review";
import type { NormalizedExpenseDocument } from "./types";

const base: NormalizedExpenseDocument = {
  documentType: "receipt", vendorName: "Store", merchantAddress: null, merchantCity: null, merchantState: null,
  merchantPostalCode: null, documentNumber: null, documentDate: "2026-10-01", documentTime: null, currency: "USD",
  subtotalCents: 1000, taxCents: 80, discountCents: 0, feeCents: 0, tipCents: 0, totalCents: 1080,
  paymentMethod: null, suggestedCategory: "supplies", lineItems: [], statementTransactions: [], extractedText: "",
  fieldConfidence: {}, overallConfidence: 0.96, reviewReasons: [],
};

describe("independent financial document review", () => {
  it("passes matching arithmetic and an independent extraction", () => {
    expect(deterministicDocumentIssues(base)).toEqual([]);
    expect(compareDocumentExtractions(base, { ...base }).status).toBe("passed");
    expect(needsIndependentDocumentReview(base)).toBe(false);
  });

  it("forces review when totals disagree", () => {
    const reviewer = { ...base, totalCents: 1180 };
    const result = compareDocumentExtractions(base, reviewer);
    expect(result.status).toBe("disagreed");
    expect(result.disagreements).toContain("Total differs between the primary and independent review.");
    expect(result.humanReviewRequired).toBe(true);
  });

  it("treats statements as critical and never trusts a missing reviewer", () => {
    const statement = { ...base, documentType: "statement" as const, subtotalCents: null, taxCents: null, totalCents: null };
    const result = compareDocumentExtractions(statement, null);
    expect(result.tier).toBe("critical");
    expect(result.status).toBe("reviewer_unavailable");
    expect(result.humanReviewRequired).toBe(true);
  });

  it("never treats two empty fallbacks as agreement", () => {
    const empty = {
      ...base,
      documentType: "other" as const,
      vendorName: null,
      documentDate: null,
      subtotalCents: null,
      taxCents: null,
      totalCents: null,
      overallConfidence: 0.1,
    };

    expect(hasUsableDocumentExtraction(empty)).toBe(false);
    const result = compareDocumentExtractions(empty, { ...empty });
    expect(result.status).toBe("disagreed");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.deterministicIssues).toContain("No usable document details were extracted.");
    expect(result.deterministicIssues).toContain("Independent review: No usable document details were extracted.");
  });

  it("rejects an empty statement before model agreement can be shown", () => {
    const statement = {
      ...base,
      documentType: "statement" as const,
      subtotalCents: null,
      taxCents: null,
      totalCents: null,
      statementTransactions: [],
    };

    expect(hasUsableDocumentExtraction(statement)).toBe(false);
    expect(deterministicDocumentIssues(statement)).toEqual(expect.arrayContaining([
      "No usable document details were extracted.",
      "No statement transactions were extracted.",
    ]));
    expect(compareDocumentExtractions(statement, { ...statement }).status).toBe("disagreed");
  });

  it("blocks a partial statement even when later pages produced transactions", () => {
    const partial = {
      ...base,
      documentType: "statement" as const,
      subtotalCents: null,
      taxCents: null,
      totalCents: null,
      statementTransactions: [{
        sourceKey: "row-1", transactionDate: "2025-12-31", postedDate: null, description: "Purchase",
        merchantName: "Store", counterpartyName: null, counterpartyHandle: null, note: null,
        transactionType: "purchase", providerStatus: null, referenceNumber: null, amountCents: 100,
        direction: "debit" as const, balanceCents: null, suggestedCategory: "supplies", isTransfer: false,
        transferReason: null, confidence: 0.9,
      }],
      sourceCoverage: {
        totalPages: 13,
        attemptedPages: Array.from({ length: 13 }, (_, index) => index + 1),
        readablePages: [11, 12, 13],
        failedPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        omittedPages: [],
      },
    };

    expect(hasUsableDocumentExtraction(partial)).toBe(false);
    expect(deterministicDocumentIssues(partial)).toContain("PDF extraction failed on page(s) 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.");
  });

  it("allows legitimate repeated charges but rejects duplicate source-row identities", () => {
    const transaction = {
      sourceKey: "row-1", transactionDate: "2025-12-31", postedDate: null, description: "Parking meter",
      merchantName: "Parking meter", counterpartyName: null, counterpartyHandle: null, note: null,
      transactionType: "purchase", providerStatus: "completed", referenceNumber: null, amountCents: 500,
      direction: "debit" as const, balanceCents: null, suggestedCategory: "parking", isTransfer: false,
      transferReason: null, confidence: 0.99,
    };
    const legitimateRepeat = {
      ...base,
      documentType: "statement" as const,
      subtotalCents: null,
      taxCents: null,
      totalCents: null,
      statementTransactions: [transaction, { ...transaction, sourceKey: "row-2" }],
    };

    expect(deterministicDocumentIssues(legitimateRepeat)).toEqual([]);
    expect(deterministicDocumentIssues({
      ...legitimateRepeat,
      statementTransactions: [transaction, { ...transaction }],
    })).toContain("The extraction contains duplicate or missing source-row identities.");
  });

  it("carries deterministic parser reconciliation failures into independent review", () => {
    const statement = {
      ...base,
      documentType: "statement" as const,
      subtotalCents: null,
      taxCents: null,
      totalCents: null,
      reviewReasons: ["Parsed transaction totals do not reconcile to the statement summary."],
      statementTransactions: [{
        sourceKey: "row-1", transactionDate: "2025-12-31", postedDate: null, description: "Purchase",
        merchantName: "Store", counterpartyName: null, counterpartyHandle: null, note: null,
        transactionType: "purchase", providerStatus: "completed", referenceNumber: null, amountCents: 100,
        direction: "debit" as const, balanceCents: null, suggestedCategory: "supplies", isTransfer: false,
        transferReason: null, confidence: 0.99,
      }],
    };

    const result = compareDocumentExtractions(statement, { ...statement });
    expect(result.status).toBe("disagreed");
    expect(result.deterministicIssues).toContain("Parsed transaction totals do not reconcile to the statement summary.");
    expect(result.humanReviewRequired).toBe(true);
  });
});
