import { describe, expect, it } from "vitest";
import { compareStatementClassifications } from "./statement-classification-review";

describe("independent statement classification review", () => {
  it("accepts only high-confidence agreement from both models", () => {
    const result = compareStatementClassifications(
      { classifications: [{ id: "a", category: "materials", confidence: 0.91 }, { id: "b", category: "fuel", confidence: 0.95 }] },
      { classifications: [{ id: "a", category: "materials", confidence: 0.88 }, { id: "b", category: "vehicle", confidence: 0.96 }] },
      ["a", "b", "c"],
    );
    expect(result[0]).toMatchObject({ agreed: true, category: "materials" });
    expect(result[1]).toMatchObject({ agreed: false, category: null });
    expect(result[2]).toMatchObject({ agreed: false, primary: null, reviewer: null });
  });

  it("rejects invented categories and low-confidence agreement", () => {
    const result = compareStatementClassifications(
      { classifications: [{ id: "a", category: "deductible", confidence: 1 }, { id: "b", category: "fuel", confidence: 0.79 }] },
      { classifications: [{ id: "a", category: "deductible", confidence: 1 }, { id: "b", category: "fuel", confidence: 0.99 }] },
      ["a", "b"],
    );
    expect(result.every((item) => !item.agreed)).toBe(true);
  });
});
