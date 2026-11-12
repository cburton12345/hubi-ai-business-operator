import { describe, expect, it } from "vitest";
import { compareInsuranceAnalyses, deterministicInsuranceIssues, normalizeInsuranceAnalysis } from "./insurance-analysis";

const coverage = { totalPages: 1, attemptedPages: [1], readablePages: [1], failedPages: [], omittedPages: [] };

describe("insurance document intelligence", () => {
  it("normalizes typed dates, money, evidence, and unknown cancellation truthfully", () => {
    const result = normalizeInsuranceAnalysis({
      facts: { insurer: "Example Mutual", policy_number: "P-1", named_insured: ["Jane Tenant"], effective_date: "2026-01-01", expiration_date: "2027-01-01", liability_limit_cents: 10000000, cancellation_status: "not sure" },
      evidence: [{ field: "expiration_date", page_number: 1, evidence: "Policy period ends 01/01/2027", confidence: 0.97 }], overall_confidence: 0.91,
    }, coverage);
    expect(result.facts.expirationDate).toBe("2027-01-01");
    expect(result.facts.liabilityLimitCents).toBe(10000000);
    expect(result.facts.cancellationStatus).toBe("unknown");
    expect(result.evidence[0]?.field).toBe("expirationDate");
  });

  it("requires complete pages and exact H4R identity/address review", () => {
    const primary = normalizeInsuranceAnalysis({ facts: { insurer: "A", policy_number: "1", named_insured: ["Other Person"], insured_address: "Wrong", expiration_date: "2027-01-01", cancellation_status: "active" } }, coverage);
    expect(deterministicInsuranceIssues(primary, { tenantName: "Jane Tenant", insuredAddress: "1 Main St" })).toEqual(expect.arrayContaining([
      "The H4R tenant name was not an exact normalized match to a named insured.", "The insured address differs from the H4R rental address.",
    ]));
  });

  it("never removes human review even when two passes agree", () => {
    const result = normalizeInsuranceAnalysis({ facts: { insurer: "A", policy_number: "1", named_insured: ["Jane"], insured_address: "1 Main St", expiration_date: "2027-01-01", cancellation_status: "active" } }, coverage);
    expect(compareInsuranceAnalyses(result, result, { tenantName: "Jane", insuredAddress: "1 Main St" })).toMatchObject({ status: "passed", humanReviewRequired: true });
  });
});
