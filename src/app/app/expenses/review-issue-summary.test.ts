import { describe, expect, it } from "vitest";
import { summarizeDocumentReviewIssues } from "@/lib/document-intelligence/review-issue-summary";

describe("document review issue summary", () => {
  it("collapses per-row model disagreements without hiding their count", () => {
    const summary = summarizeDocumentReviewIssues([
      "Financial institution could not be read confidently.",
      "Statement transaction 1 differs between reviews.",
      "Statement transaction 2 differs between reviews.",
      "Statement transaction 2 differs between reviews.",
    ]);
    expect(summary).toEqual([
      "Financial institution could not be read confidently.",
      "2 statement transactions differed between the first and second reading.",
    ]);
  });

  it("bounds long miscellaneous review output", () => {
    const summary = summarizeDocumentReviewIssues(["One", "Two", "Three", "Four", "Five", "Six"]);
    expect(summary).toHaveLength(5);
    expect(summary.at(-1)).toBe("2 additional review issues are retained in the audit record.");
  });
});
