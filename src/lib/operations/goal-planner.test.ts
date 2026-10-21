import { describe, expect, it } from "vitest";
import { normalizeGoalPlan } from "./goal-planner";

describe("bounded persistent-goal planning", () => {
  it("accepts only bounded, evidence-bearing plan steps", () => {
    const plan = normalizeGoalPlan({
      reasoningStatus: "proposed",
      summary: "Finish the physical work, then verify readiness.",
      assumptions: ["Unit record is current"],
      steps: [
        {
          key: "finish-window",
          action: "assign_work",
          title: "Replace the broken window",
          why: "The unit cannot be rent-ready until this is complete.",
          dependencyKeys: ["window-repair"],
          ownerRequired: false,
          completionEvidence: "Worker completion plus reviewed photo evidence",
        },
      ],
    }, "The unit is rent-ready with reviewed completion evidence.");
    expect(plan.reasoningStatus).toBe("proposed");
    expect(plan.steps[0]).toMatchObject({ action: "assign_work", ownerRequired: false });
    expect(plan.steps.at(-1)).toMatchObject({
      key: "verify-outcome",
      action: "verify_outcome",
      completionEvidence: "The unit is rent-ready with reviewed completion evidence.",
    });
  });

  it("rejects invented direct execution actions", () => {
    const plan = normalizeGoalPlan({
      reasoningStatus: "proposed",
      summary: "Select and sign.",
      steps: [
        {
          key: "pick-applicant",
          action: "select_tenant_and_sign_lease",
          title: "Choose the tenant",
          completionEvidence: "Lease signed",
        },
      ],
    });
    expect(plan.reasoningStatus).toBe("unavailable");
    expect(plan.steps).toEqual([]);
  });

  it("does not present an empty provider fallback as a real plan", () => {
    expect(normalizeGoalPlan({ reasoningStatus: "proposed", steps: [] })).toMatchObject({
      reasoningStatus: "unavailable",
      steps: [],
    });
  });

  it("does not duplicate an explicit outcome-verification step", () => {
    const plan = normalizeGoalPlan({
      reasoningStatus: "proposed",
      steps: [{
        key: "verify-payment",
        action: "verify_outcome",
        title: "Verify settlement",
        completionEvidence: "Settled provider transaction",
      }],
    }, "The invoice is paid.");

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.key).toBe("verify-payment");
  });

  it("keeps exactly one outcome-verification step at the end", () => {
    const plan = normalizeGoalPlan({
      reasoningStatus: "proposed",
      steps: [
        { key: "verify-early", action: "verify_outcome", title: "Verify", completionEvidence: "Provider receipt" },
        { key: "do-work", action: "assign_work", title: "Do the work", completionEvidence: "Completed assignment" },
        { key: "verify-duplicate", action: "verify_outcome", title: "Verify again", completionEvidence: "Duplicate" },
      ],
    }, "The requested result occurred.");

    expect(plan.steps.map((step) => step.key)).toEqual(["do-work", "verify-early"]);
  });
});
