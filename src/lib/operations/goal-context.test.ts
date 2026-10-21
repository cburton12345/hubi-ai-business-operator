import { describe, expect, it } from "vitest";
import { formatActiveOperatingGoalContext } from "./goal-engine";

describe("durable operating-goal conversation context", () => {
  it("preserves stable identifiers, status, authority, domain, and current step", () => {
    const context = formatActiveOperatingGoalContext([{
      id: "00000000-0000-4000-8000-000000000001",
      title: "Collect the overdue balance",
      desired_outcome: "The balance is paid, disputed, or moved to an owner-approved path.",
      status: "waiting",
      priority: "high",
      authority_mode: "prepare",
      domain_system: "ferocity",
      current_step_title: "Wait for the customer's reply",
    }]);
    expect(context).toContain("Goal 00000000-0000-4000-8000-000000000001");
    expect(context).toContain("status=waiting");
    expect(context).toContain("authority=prepare");
    expect(context).toContain("current step=Wait for the customer's reply");
    expect(context).toContain("Do not start a duplicate outcome");
  });

  it("does not fabricate active context when no thread goal exists", () => {
    expect(formatActiveOperatingGoalContext([])).toBe("");
  });
});
