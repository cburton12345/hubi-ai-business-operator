import { describe, expect, it } from "vitest";
import { compareLeaseAnalyses, deterministicLeaseIssues, type LeaseAnalysis } from "./lease-analysis";

function analysis(overrides: Partial<LeaseAnalysis> = {}): LeaseAnalysis {
  return {
    terms: {
      propertyAddress: "123 Main St", unitLabel: "2A", landlordNames: ["Owner LLC"], tenantNames: ["Jane Doe"], occupantNames: [],
      startDate: "2026-11-01", endDate: "2027-10-31", monthlyRentCents: 125000, securityDepositCents: 125000,
      rentDueDay: 1, lateFeeSummary: null, utilitiesSummary: null, petSummary: null, renewalSummary: null, terminationSummary: null,
    },
    fields: [{
      sourceKey: "2:signature:tenant signature:0", pageNumber: 2, type: "signature", label: "Tenant signature",
      signerRole: "tenant", proposedValue: null, x: 0.1, y: 0.8, width: 0.3, height: 0.08, confidence: 0.95, evidence: "Tenant signature",
    }],
    clauseSummaries: [],
    sourceCoverage: { totalPages: 2, attemptedPages: [1, 2], readablePages: [1, 2], failedPages: [], omittedPages: [] },
    overallConfidence: 0.94,
    reviewReasons: [],
    ...overrides,
  };
}

describe("lease document review", () => {
  it("passes deterministic checks only when all pages and a visible signature field are present", () => {
    expect(deterministicLeaseIssues(analysis())).toEqual([]);
    expect(deterministicLeaseIssues(analysis({ fields: [], sourceCoverage: { totalPages: 2, attemptedPages: [1], readablePages: [1], failedPages: [2], omittedPages: [] } })))
      .toEqual(["Not every lease page produced a usable analysis.", "No visible signature field was identified."]);
  });

  it("requires human review even when independent models agree", () => {
    expect(compareLeaseAnalyses(analysis(), analysis())).toEqual({
      status: "passed", deterministicIssues: [], disagreements: [], humanReviewRequired: true,
    });
  });

  it("flags source-record and independent-model disagreements", () => {
    const reviewer = analysis({ terms: { ...analysis().terms, monthlyRentCents: 130000 } });
    const result = compareLeaseAnalyses(analysis(), reviewer, { securityDepositCents: 100000 });
    expect(result.status).toBe("disagreed");
    expect(result.deterministicIssues).toContain("securityDepositCents differs from the Homes4Rent record.");
    expect(result.disagreements).toContain("monthlyRentCents differs between the primary and independent review.");
    expect(result.humanReviewRequired).toBe(true);
  });

  it("never treats a missing distinct reviewer as successful review", () => {
    expect(compareLeaseAnalyses(analysis(), null).status).toBe("reviewer_unavailable");
  });
});
