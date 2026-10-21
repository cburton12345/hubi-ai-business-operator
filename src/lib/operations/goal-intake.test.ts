import { describe, expect, it } from "vitest";
import {
  correctedOperatingGoalOutcome,
  isExplicitOperatingGoalCorrection,
  operatingGoalCandidateFromCommand,
  operatingGoalCandidateFromPlannedOutcome,
} from "./goal-intake";

describe("Ask Ferocity persistent-goal intake", () => {
  it("recognizes a property outcome instead of a one-time task", () => {
    expect(operatingGoalCandidateFromCommand("Get Unit 3 rent-ready and occupied by October 15")).toMatchObject({
      goalType: "leasing_outcome",
      domainSystem: "h4r",
      priority: "normal",
    });
  });

  it("recognizes tenant onboarding as an ongoing outcome", () => {
    expect(operatingGoalCandidateFromCommand("Set John up as the tenant at 123 Main St and get him moved in")).toMatchObject({
      goalType: "onboarding_outcome",
      domainSystem: "h4r",
    });
  });

  it("recognizes urgent maintenance without making a legal or vendor decision", () => {
    expect(operatingGoalCandidateFromCommand("Resolve the no heat furnace emergency until the unit is safe again")).toMatchObject({
      goalType: "maintenance_resolution",
      domainSystem: "h4r",
      priority: "critical",
    });
  });

  it("does not turn questions or reminders into operating goals", () => {
    expect(operatingGoalCandidateFromCommand("How should I get this property occupied?")).toBeNull();
    expect(operatingGoalCandidateFromCommand("Remind me to call John tomorrow")).toBeNull();
  });

  it("uses a stable idempotency key for repeated wording", () => {
    const first = operatingGoalCandidateFromCommand("Get this invoice completely paid");
    const second = operatingGoalCandidateFromCommand("  Get   this invoice completely paid  ");
    expect(first?.goalKey).toBe(second?.goalKey);
  });

  it("turns a model-confirmed long-running business outcome into a durable goal", () => {
    expect(operatingGoalCandidateFromPlannedOutcome({
      command: "Own this until our overdue invoices are resolved",
      goalIntent: "persistent",
      goalTitle: "Resolve overdue invoices",
      desiredOutcome: "Every overdue invoice is paid, disputed, or moved to an owner-approved collection path.",
      capabilities: ["collections"],
    })).toMatchObject({
      goalType: "collection_resolution",
      title: "Resolve overdue invoices",
      domainSystem: "ferocity",
    });
  });

  it("does not persist one-time advice as a goal", () => {
    expect(operatingGoalCandidateFromPlannedOutcome({
      command: "How should I improve cash flow?",
      goalIntent: "one_time",
      capabilities: ["growth_revenue"],
    })).toBeNull();
  });

  it("recognizes explicit corrections without treating ordinary follow-up as a correction", () => {
    expect(isExplicitOperatingGoalCorrection("Actually, use 408 Cedar instead")).toBe(true);
    expect(isExplicitOperatingGoalCorrection("No, I meant the lower unit")).toBe(true);
    expect(isExplicitOperatingGoalCorrection("That is wrong; the amount is $825")).toBe(true);
    expect(isExplicitOperatingGoalCorrection("What is the current amount?")).toBe(false);
  });

  it("extracts the corrected outcome while retaining a meaningful fallback", () => {
    expect(correctedOperatingGoalOutcome("Correction: move John into Unit 2")).toBe("move John into Unit 2");
    expect(correctedOperatingGoalOutcome("Actually")).toBe("Actually");
    expect(correctedOperatingGoalOutcome("Please use Unit 2")).toBeNull();
  });
});
