import { describe, expect, it } from "vitest";
import { summarizeStatementYearCoverage } from "./statement-year-coverage";

describe("summarizeStatementYearCoverage", () => {
  it("names a single missing statement and marks the year incomplete", () => {
    const result = summarizeStatementYearCoverage(2025, [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12], 11);
    expect(result.complete).toBe(false);
    expect(result.missingMonths).toEqual(["May"]);
    expect(result.message).toBe("May statement was not provided for 2025. This covers 11 of 12 monthly statement periods and is incomplete.");
  });

  it("deduplicates repeat uploads without hiding gaps", () => {
    const result = summarizeStatementYearCoverage(2025, [1, 1, 2, 12], 4);
    expect(result.presentMonths).toEqual(["January", "February", "December"]);
    expect(result.missingMonths).toHaveLength(9);
    expect(result.statementCount).toBe(4);
  });

  it("recognizes complete annual coverage", () => {
    const result = summarizeStatementYearCoverage(2025, Array.from({ length: 12 }, (_, index) => index + 1));
    expect(result.complete).toBe(true);
    expect(result.missingMonths).toEqual([]);
    expect(result.message).toBe("All 12 monthly statement periods are represented for 2025.");
  });
});
