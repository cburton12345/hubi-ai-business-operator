import { describe, expect, it } from "vitest";
import { determineGoalStepDisposition } from "@/lib/operations/goal-step-runner";

describe("determineGoalStepDisposition", () => {
  it("does not bypass unresolved plan dependencies", () => {
    expect(determineGoalStepDisposition({
      action: "assign_work",
      dependenciesReady: false,
      authorityMode: "execute",
      ownerRequired: false,
      outcomeVerified: false,
    })).toBe("wait_for_dependencies");
  });

  it("executes internal assignment only under execute authority or explicit approval", () => {
    expect(determineGoalStepDisposition({
      action: "assign_work",
      dependenciesReady: true,
      authorityMode: "prepare",
      ownerRequired: false,
      outcomeVerified: false,
    })).toBe("prepare_owner_review");
    expect(determineGoalStepDisposition({
      action: "assign_work",
      dependenciesReady: true,
      authorityMode: "execute",
      ownerRequired: false,
      outcomeVerified: false,
    })).toBe("execute_assignment");
    expect(determineGoalStepDisposition({
      action: "assign_work",
      dependenciesReady: true,
      authorityMode: "prepare",
      ownerRequired: true,
      outcomeVerified: false,
      approved: true,
    })).toBe("execute_assignment");
  });

  it("keeps communication prepared for review and requires outcome evidence", () => {
    expect(determineGoalStepDisposition({
      action: "prepare_communication",
      dependenciesReady: true,
      authorityMode: "execute",
      ownerRequired: false,
      outcomeVerified: false,
    })).toBe("prepare_owner_review");
    expect(determineGoalStepDisposition({
      action: "verify_outcome",
      dependenciesReady: true,
      authorityMode: "execute",
      ownerRequired: false,
      outcomeVerified: false,
    })).toBe("wait_for_evidence");
    expect(determineGoalStepDisposition({
      action: "verify_outcome",
      dependenciesReady: true,
      authorityMode: "execute",
      ownerRequired: false,
      outcomeVerified: true,
    })).toBe("complete_verified_outcome");
  });

  it("records an approved owner attestation before completing an otherwise unbound outcome", () => {
    expect(determineGoalStepDisposition({
      action: "verify_outcome",
      dependenciesReady: true,
      authorityMode: "prepare",
      ownerRequired: false,
      outcomeVerified: false,
      approved: true,
    })).toBe("record_owner_verified_outcome");
  });
});
