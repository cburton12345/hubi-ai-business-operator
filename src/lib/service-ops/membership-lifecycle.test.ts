import { describe, expect, it } from "vitest";
import { membershipTransitionAllowed } from "@/lib/service-ops/membership-lifecycle";

describe("membership lifecycle", () => {
  it("supports pause, resume, and cancellation while preserving canceled history", () => {
    expect(membershipTransitionAllowed("active", "paused")).toBe(true);
    expect(membershipTransitionAllowed("paused", "active")).toBe(true);
    expect(membershipTransitionAllowed("active", "canceled")).toBe(true);
    expect(membershipTransitionAllowed("canceled", "active")).toBe(false);
    expect(membershipTransitionAllowed("canceled", "paused")).toBe(false);
  });
});
