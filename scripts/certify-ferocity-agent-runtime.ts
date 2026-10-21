import { randomUUID } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import {
  applyFerocityConversationMemory,
  getFerocityConversationMemory,
  recordFerocityActionReceipts,
} from "@/lib/ferocity/conversation-runtime";
import {
  controlOperatingGoal,
  createOperatingGoal,
  syncOperatingGoalsForTenant,
} from "@/lib/operations/goal-engine";
import { operatingGoalCandidateFromCommand } from "@/lib/operations/goal-intake";
import {
  advanceOperatingGoalStepsForTenant,
  materializeOperatingGoalPlanSteps,
} from "@/lib/operations/goal-step-runner";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const workspace = await queryPostgres<{ tenant_id: string; user_id: string }>(
    `select tenant.id as tenant_id,member.user_id
       from public.tenants tenant
       join public.tenant_users member on member.tenant_id=tenant.id and member.status='active'
      where tenant.slug='ferocity-qa-demo'
      order by case member.role when 'owner' then 1 when 'admin' then 2 else 3 end
      limit 1`,
  );
  const target = workspace?.rows[0];
  assert(target, "Ferocity QA Demo workspace or active member was not found.");

  const marker = `agent-runtime-certification-${randomUUID()}`;
  let memoryId: string | null = null;
  let receiptId: string | null = null;
  let goalId: string | null = null;
  let actionRequestId: string | null = null;
  let approvalId: string | null = null;
  const additionalGoalIds: string[] = [];
  try {
    const memoryResult = await applyFerocityConversationMemory({
      tenantId: target.tenant_id,
      userId: target.user_id,
      command: `Remember that ${marker}`,
      candidates: [],
    });
    assert(memoryResult.available && memoryResult.saved === 1, "Durable memory did not save the QA marker.");

    const storedMemory = await queryPostgres<{ id: string }>(
      `select id from public.ferocity_conversation_memories
        where tenant_id=$1 and value_text=$2 and status='active' limit 1`,
      [target.tenant_id, marker],
    );
    memoryId = storedMemory?.rows[0]?.id ?? null;
    assert(memoryId, "The saved memory could not be read from its tenant.");
    const recalled = await getFerocityConversationMemory({
      tenantId: target.tenant_id,
      userId: target.user_id,
      query: marker,
    });
    assert(recalled.includes(marker), "The saved memory was not returned to the same workspace/user context.");

    const naturalLanguageGoal = `Keep handling ${marker} until it is completely resolved`;
    const candidate = operatingGoalCandidateFromCommand(naturalLanguageGoal);
    assert(candidate, "Ordinary Ask Ferocity language did not create a persistent-goal candidate.");
    const goal = await createOperatingGoal({
      tenantId: target.tenant_id,
      ...candidate,
      authorityMode: "observe",
      completionRules: { temporaryCertification: true },
    });
    goalId = goal.id;
    assert(goal.status === "active", "The persistent operating goal was not activated.");

    const paused = await controlOperatingGoal({
      tenantId: target.tenant_id,
      goalId,
      control: "pause",
      actorUserId: target.user_id,
    });
    assert(paused.status === "paused", "The persistent goal did not pause.");
    const resumed = await controlOperatingGoal({
      tenantId: target.tenant_id,
      goalId,
      control: "resume",
      actorUserId: target.user_id,
    });
    assert(resumed.status === "active", "The persistent goal did not resume.");
    const retried = await controlOperatingGoal({
      tenantId: target.tenant_id,
      goalId,
      control: "retry",
      actorUserId: target.user_id,
    });
    assert(retried.status === "active", "The persistent goal did not accept a retry.");

    const materialized = await materializeOperatingGoalPlanSteps({
      tenantId: target.tenant_id,
      goalId,
      planVersion: 1,
      steps: [{
        key: "verify-certification-outcome",
        action: "verify_outcome",
        title: "Verify the temporary certification outcome",
        why: "Certify that an ordinary Ask Ferocity goal retains explicit outcome evidence.",
        dependencyKeys: [],
        ownerRequired: false,
        completionEvidence: `Owner observed the isolated QA outcome ${marker}`,
      }],
    });
    assert(materialized.created === 1, "The durable goal step was not materialized.");
    for (let index = 1; index <= 3; index += 1) {
      const parallelCandidate = operatingGoalCandidateFromCommand(
        `Keep handling parallel outcome ${index} for ${marker} until it is completely resolved`,
      );
      assert(parallelCandidate, `Parallel goal ${index} did not pass ordinary-language intake.`);
      const parallelGoal = await createOperatingGoal({
        tenantId: target.tenant_id,
        ...parallelCandidate,
        authorityMode: "observe",
        completionRules: { temporaryCertification: true },
      });
      additionalGoalIds.push(parallelGoal.id);
      const parallelSteps = await materializeOperatingGoalPlanSteps({
        tenantId: target.tenant_id,
        goalId: parallelGoal.id,
        planVersion: 1,
        steps: [{
          key: "await-parallel-evidence",
          action: "await_event",
          title: `Wait for isolated parallel evidence ${index}`,
          why: "Certify that multiple independent outcomes advance in the same run.",
          dependencyKeys: [],
          ownerRequired: false,
          completionEvidence: `${marker}:parallel:${index}`,
        }],
      });
      assert(parallelSteps.created === 1, `Parallel goal ${index} did not retain its step.`);
    }
    const advanced = await advanceOperatingGoalStepsForTenant(target.tenant_id, 5);
    assert(advanced.needsOwner >= 1, "The unbound outcome did not request explicit owner evidence.");
    assert(advanced.waiting >= 3, "Multiple independent outcomes did not advance in the same run.");
    const parallelStatuses = await queryPostgres<{ goal_id: string; status: string }>(
      `select goal_id,status from public.operating_goal_steps
        where tenant_id=$1 and goal_id=any($2::uuid[]) and step_key='await-parallel-evidence'`,
      [target.tenant_id, additionalGoalIds],
    );
    assert(parallelStatuses?.rows.length === 3, "Not every parallel goal retained execution state.");
    assert(parallelStatuses.rows.every((step) => step.status === "waiting"), "A parallel goal failed to reach its resumable state.");
    const storedStep = await queryPostgres<{ status: string; reference_id: string | null }>(
      `select status,reference_id from public.operating_goal_steps
        where tenant_id=$1 and goal_id=$2 and step_key='verify-certification-outcome' limit 1`,
      [target.tenant_id, goalId],
    );
    assert(storedStep?.rows[0]?.status === "needs_owner", "The owner-evidence step was not retained.");
    actionRequestId = storedStep?.rows[0]?.reference_id ?? null;
    assert(actionRequestId, "The owner-evidence request was not linked to the retained step.");
    const approval = await queryPostgres<{ id: string }>(
      `update public.approvals set status='approved',notes=$3,reviewed_by_user_id=$4,reviewed_at=now()
        where tenant_id=$1 and target_type='office_manager_action_request' and target_id=$2 and status='pending'
        returning id`,
      [target.tenant_id, actionRequestId, marker, target.user_id],
    );
    approvalId = approval?.rows[0]?.id ?? null;
    assert(approvalId, "The canonical outcome-evidence approval was not available.");
    await queryPostgres(
      `update public.office_manager_action_requests set status='approved',
         metadata_json=metadata_json || jsonb_build_object(
           'ownerDecision','approved','ownerDecisionNote',$3::text,
           'ownerDecisionByUserId',$4::text,'ownerDecidedAt',now()
         ),updated_at=now()
       where tenant_id=$1 and id=$2`,
      [target.tenant_id, actionRequestId, marker, target.user_id],
    );
    await queryPostgres(
      `update public.operating_goal_dependencies set status='satisfied',satisfied_at=now(),updated_at=now()
        where tenant_id=$1 and goal_id=$2 and dependency_key='plan-step:1:verify-certification-outcome:owner'`,
      [target.tenant_id, goalId],
    );
    await queryPostgres(
      `update public.operating_goal_steps set next_attempt_at=now(),updated_at=now()
        where tenant_id=$1 and goal_id=$2 and step_key='verify-certification-outcome'`,
      [target.tenant_id, goalId],
    );
    const verifiedAdvance = await advanceOperatingGoalStepsForTenant(target.tenant_id, 5);
    assert(verifiedAdvance.completed >= 1, "The approved owner evidence did not complete the verification step.");
    await syncOperatingGoalsForTenant(target.tenant_id, 5);
    const completedGoal = await queryPostgres<{ status: string; outcome_verified: boolean }>(
      `select status,coalesce((current_state_json->>'outcomeVerified')::boolean,false) as outcome_verified
         from public.operating_goals where tenant_id=$1 and id=$2`,
      [target.tenant_id, goalId],
    );
    assert(completedGoal?.rows[0]?.outcome_verified === true, "Owner evidence was not persisted as outcome evidence.");
    assert(completedGoal?.rows[0]?.status === "completed", "The evidence-backed goal did not complete.");

    const links = await recordFerocityActionReceipts({
      tenantId: target.tenant_id,
      receipts: [{
        receiptKind: "result",
        title: "Temporary agent-runtime certification",
        summary: marker,
        status: "completed",
        href: "/app/qa",
        operatingGoalId: goalId,
        evidence: { certification: true, marker },
      }],
    });
    receiptId = links[0]?.id ?? null;
    assert(receiptId && links[0]?.href === "/app/qa", "The action receipt did not return an exact artifact link.");

    console.log(JSON.stringify({
      ok: true,
      memory: "saved_and_recalled",
      persistentGoal: "stored_with_audit_event",
      naturalLanguageGoalIntake: "ordinary_ask_ferocity_language_persisted",
      goalControls: "pause_resume_retry_verified",
      goalSteps: "materialized_owner_reviewed_and_evidence_verified",
      multiGoalThroughput: "four_independent_outcomes_advanced_in_one_run",
      receipt: "stored_with_exact_link",
    }));
  } finally {
    if (receiptId) {
      await queryPostgres(`delete from public.ferocity_chat_action_receipts where tenant_id=$1 and id=$2`, [target.tenant_id, receiptId]);
    }
    if (memoryId) {
      await queryPostgres(`delete from public.ferocity_conversation_memories where tenant_id=$1 and id=$2`, [target.tenant_id, memoryId]);
    }
    if (approvalId) {
      await queryPostgres(`delete from public.approvals where tenant_id=$1 and id=$2`, [target.tenant_id, approvalId]);
    }
    if (actionRequestId) {
      await queryPostgres(`delete from public.office_manager_action_requests where tenant_id=$1 and id=$2`, [target.tenant_id, actionRequestId]);
    }
    if (goalId) {
      await queryPostgres(`delete from public.operating_goals where tenant_id=$1 and id=$2`, [target.tenant_id, goalId]);
    }
    if (additionalGoalIds.length) {
      await queryPostgres(`delete from public.operating_goals where tenant_id=$1 and id=any($2::uuid[])`, [target.tenant_id, additionalGoalIds]);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Agent runtime certification failed.");
  process.exitCode = 1;
});
