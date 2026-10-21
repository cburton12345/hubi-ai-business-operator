import { describe, expect, it } from "vitest";
import {
  clarificationQuestionForUnderstanding,
  commandSearchText,
  fallbackCommandUnderstanding,
  normalizeFerocityStringList,
  stronglySignaledCapabilities,
} from "./command-understanding";

describe("Ask Ferocity command understanding", () => {
  it("adds only canonical capability language for deterministic routing", () => {
    const text = commandSearchText("Stop opportunities from slipping away", ["lead_follow_up", "collections"]);
    expect(text).toContain("old lead");
    expect(text).toContain("unpaid");
    expect(text).not.toContain("publish");
    expect(text).not.toContain("spend");
  });

  it("falls back without blocking or inventing capabilities", () => {
    const result = fallbackCommandUnderstanding("Help me with this");
    expect(result.needsClarification).toBe(false);
    expect(result.requestedMode).toBe("read_only");
    expect(result.capabilities).toEqual([]);
    expect(result.plannedActions).toEqual([]);
    expect(result.goalIntent).toBe("one_time");
    expect(result.memoryCandidates).toEqual([]);
    expect(result.planningAiStatus).toBe("fallback");
    expect(result.responseAiStatus).toBe("fallback");
    expect(result.summary).toContain("Help me with this");
  });

  it("recovers owner-readable next steps when a model returns typed step objects", () => {
    expect(normalizeFerocityStringList([
      { key: "inspect_workspace", rationale: "Inspect the current financial records." },
      "Open the reviewed result.",
    ], 5, 280)).toEqual([
      "Inspect the current financial records.",
      "Open the reviewed result.",
    ]);
  });

  it("preserves explicit intent when a model omits an obvious routing family", () => {
    expect(stronglySignaledCapabilities("Remind me tomorrow to review the largest unpaid invoice"))
      .toEqual(expect.arrayContaining(["reminders", "collections"]));
    expect(stronglySignaledCapabilities("Review missed calls, callbacks, and human transfer rules"))
      .toContain("calls_office");
    expect(stronglySignaledCapabilities("Turn completed work into customer proof and review requests"))
      .toContain("reviews_proof");
    expect(stronglySignaledCapabilities("Reconcile Cash App statement deposits and tax expenses"))
      .toEqual(expect.arrayContaining(["payments_deposits", "expenses_tax"]));
    expect(stronglySignaledCapabilities("Check inventory and create a supplier purchase order"))
      .toEqual(expect.arrayContaining(["pos_inventory", "purchasing_suppliers"]));
  });

  it("asks only the first decisive question when no safe work can proceed", () => {
    expect(clarificationQuestionForUnderstanding({
      needsClarification: true,
      clarifyingQuestion: "Which property is this for? What amount should I use?",
      safePlannedActionCount: 0,
    })).toBe("Which property is this for?");
  });

  it("continues safe planned work before requesting missing context", () => {
    expect(clarificationQuestionForUnderstanding({
      needsClarification: true,
      clarifyingQuestion: "Which property is this for?",
      safePlannedActionCount: 1,
    })).toBeNull();
  });
});
