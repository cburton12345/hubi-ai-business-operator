import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("operating-goal owner review contract", () => {
  it("creates a canonical, deep-linked approval for a retained goal step", () => {
    const runner = source("src/lib/operations/goal-step-runner.ts");
    expect(runner).toContain("'office_manager_action_request'");
    expect(runner).toContain("/app/approvals?approval=${approvalId}");
    expect(runner).toContain("operatingGoalStepId");
    expect(runner).toContain("on conflict (tenant_id,target_type,target_id) where status='pending'");
  });

  it("wakes the same step and goal after the owner decides", () => {
    const approvals = source("src/app/app/approvals/actions.ts");
    const runner = source("src/lib/operations/goal-step-runner.ts");
    expect(approvals).toContain("recordOperatingGoalOwnerDecision");
    expect(approvals).toContain("set next_attempt_at=now(),updated_at=now()");
    expect(approvals).toContain("set next_evaluation_at=least(next_evaluation_at,now()),updated_at=now()");
    expect(approvals).toContain("['request_information', 'prepare_communication', 'verify_outcome']".replaceAll("'", '"'));
    expect(approvals).toContain("ownerDecisionByUserId");
    expect(runner).toContain("owner-attestation:");
    expect(runner).toContain("ferocity_owner_approval");
    expect(runner).toContain('step.action !== "verify_outcome"');
    expect(runner).toContain("priorPlanStepsComplete");
  });

  it("allows only one pending canonical approval per goal action request", () => {
    const migration = source("supabase/migrations/246_operating_goal_owner_review_approvals.sql");
    expect(migration).toContain("'office_manager_action_request'");
    expect(migration).toContain("approvals_pending_target_idx");
    expect(migration).toContain("where status='pending'");
  });
});
