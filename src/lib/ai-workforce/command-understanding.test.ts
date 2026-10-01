import { describe, expect, it } from "vitest";
import { commandSearchText, fallbackCommandUnderstanding, stronglySignaledCapabilities } from "./command-understanding";

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
    expect(result.summary).toContain("Help me with this");
  });

  it("preserves explicit intent when a model omits an obvious routing family", () => {
    expect(stronglySignaledCapabilities("Remind me tomorrow to review the largest unpaid invoice"))
      .toEqual(expect.arrayContaining(["reminders", "collections"]));
    expect(stronglySignaledCapabilities("Review missed calls, callbacks, and human transfer rules"))
      .toContain("calls_office");
    expect(stronglySignaledCapabilities("Turn completed work into customer proof and review requests"))
      .toContain("reviews_proof");
  });
});
