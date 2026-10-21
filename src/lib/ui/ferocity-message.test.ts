import { describe, expect, it } from "vitest";
import { presentFerocityMessage } from "./ferocity-message";

describe("presentFerocityMessage", () => {
  it("keeps the owner-facing answer primary and separates planning diagnostics", () => {
    const result = presentFerocityMessage(
      "Review the 46 transactions that need attention.\n\nWorkspace evidence was still checked, but AI action planning used the safe fallback. I did not execute an inferred action plan.\n\nI checked the relevant workspace records directly.",
    );

    expect(result.message).toBe(
      "Review the 46 transactions that need attention.\n\nI checked the relevant workspace records directly.",
    );
    expect(result.technicalNotices).toHaveLength(1);
  });

  it("does not alter ordinary conversation", () => {
    expect(presentFerocityMessage("Ferocity prepared the next step.")).toEqual({
      message: "Ferocity prepared the next step.",
      technicalNotices: [],
    });
  });
});
