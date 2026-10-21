import { queryPostgres } from "@/lib/db/postgres";
import { createGoalWorkAssignment, recordOperatingGoalOutcome } from "@/lib/operations/goal-engine";

const ALLOWED_ACTIONS = new Set([
  "inspect_domain_state",
  "assign_work",
  "prepare_communication",
  "await_event",
  "request_information",
  "verify_outcome",
]);

type MaterializedStep = {
  key: string;
  action: string;
  title: string;
  why: string;
  dependencyKeys: string[];
  ownerRequired: boolean;
  completionEvidence: string;
};

type GoalStepRow = {
  id: string;
  goal_id: string;
  plan_version: number;
  step_key: string;
  action: string;
  title: string;
  why: string | null;
  status: string;
  owner_required: boolean;
  dependency_keys_json: unknown;
  completion_evidence_requirement: string;
  reference_table: string | null;
  reference_id: string | null;
  authority_mode: "observe" | "prepare" | "execute";
  domain_system: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  priority: "low" | "normal" | "high" | "critical";
  outcome_verified: boolean;
  approval_status: string | null;
  approval_id: string | null;
  approval_notes: string | null;
  approval_reviewed_by_user_id: string | null;
  approval_reviewed_at: Date | null;
  generated_dependency_status: string | null;
};

export type GoalStepDisposition =
  | "wait_for_dependencies"
  | "inspect_related_entity"
  | "execute_assignment"
  | "prepare_owner_review"
  | "record_owner_verified_outcome"
  | "complete_verified_outcome"
  | "wait_for_evidence";

export function determineGoalStepDisposition(input: {
  action: string;
  dependenciesReady: boolean;
  authorityMode: "observe" | "prepare" | "execute";
  ownerRequired: boolean;
  outcomeVerified: boolean;
  approved?: boolean;
}): GoalStepDisposition {
  if (!input.dependenciesReady) return "wait_for_dependencies";
  if (input.action === "inspect_domain_state") return "inspect_related_entity";
  if (input.action === "assign_work") {
    return (input.authorityMode === "execute" && !input.ownerRequired) || input.approved
      ? "execute_assignment"
      : "prepare_owner_review";
  }
  if (input.action === "prepare_communication" || input.action === "request_information") {
    return "prepare_owner_review";
  }
  if (input.action === "verify_outcome" && input.outcomeVerified) {
    return "complete_verified_outcome";
  }
  if (input.action === "verify_outcome" && input.approved) {
    return "record_owner_verified_outcome";
  }
  return "wait_for_evidence";
}

const ENTITY_TABLES: Record<string, string> = {
  customer: "customers",
  lead: "leads",
  job: "service_jobs",
  service_job: "service_jobs",
  estimate: "service_estimates",
  invoice: "service_invoices",
  expense_document: "expense_documents",
};

function clean(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function normalizeMaterializedSteps(value: unknown): MaterializedStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const action = clean(item.action, 80);
    const title = clean(item.title, 240);
    const completionEvidence = clean(item.completionEvidence, 500);
    if (!ALLOWED_ACTIONS.has(action) || !title || !completionEvidence) return [];
    return [{
      key: clean(item.key, 120) || `step-${index + 1}`,
      action,
      title,
      why: clean(item.why, 500),
      dependencyKeys: Array.isArray(item.dependencyKeys)
        ? item.dependencyKeys.map((entry) => clean(entry, 120)).filter(Boolean).slice(0, 20)
        : [],
      ownerRequired: item.ownerRequired === true,
      completionEvidence,
    }];
  }).slice(0, 12);
}

export async function materializeOperatingGoalPlanSteps(input: {
  tenantId: string;
  goalId: string;
  planVersion: number;
  steps: unknown;
}) {
  const steps = normalizeMaterializedSteps(input.steps);
  let created = 0;
  for (const [index, step] of steps.entries()) {
    const result = await queryPostgres<{ id: string }>(
      `insert into public.operating_goal_steps (
         tenant_id,goal_id,plan_version,step_key,sequence_number,action,title,why,
         owner_required,dependency_keys_json,completion_evidence_requirement,metadata_json
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb)
       on conflict (tenant_id,goal_id,plan_version,step_key) do nothing
       returning id`,
      [
        input.tenantId,
        input.goalId,
        input.planVersion,
        step.key,
        index,
        step.action,
        step.title,
        step.why || null,
        step.ownerRequired,
        JSON.stringify(step.dependencyKeys),
        step.completionEvidence,
        JSON.stringify({ source: "bounded_goal_planner" }),
      ],
    );
    if (result?.rows[0]) created += 1;
  }
  return { found: steps.length, created };
}

async function backfillUnmaterializedPlans(tenantId: string, limit: number) {
  const result = await queryPostgres<{
    id: string;
    plan_version: number;
    plan_json: { steps?: unknown } | null;
  }>(
    `select goal.id,goal.plan_version,goal.plan_json
       from public.operating_goals goal
      where goal.tenant_id=$1 and goal.plan_version > 0
        and goal.status in ('active','progressing','waiting','blocked','needs_owner')
        and not exists (
          select 1 from public.operating_goal_steps step
          where step.tenant_id=goal.tenant_id and step.goal_id=goal.id
            and step.plan_version=goal.plan_version
        )
      order by goal.updated_at
      limit $2`,
    [tenantId, limit],
  );
  let created = 0;
  for (const goal of result?.rows ?? []) {
    const materialized = await materializeOperatingGoalPlanSteps({
      tenantId,
      goalId: goal.id,
      planVersion: goal.plan_version,
      steps: goal.plan_json?.steps,
    });
    created += materialized.created;
  }
  return created;
}

function dependencyKeys(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => clean(entry, 120)).filter(Boolean)
    : [];
}

async function dependenciesReady(tenantId: string, goalId: string, keys: string[]) {
  if (keys.length === 0) return true;
  const result = await queryPostgres<{ unresolved: string }>(
    `select count(*)::text as unresolved
       from unnest($3::text[]) key
      where not exists (
        select 1 from public.operating_goal_dependencies dependency
        where dependency.tenant_id=$1 and dependency.goal_id=$2
          and dependency.dependency_key=key
          and dependency.status in ('satisfied','waived')
      )`,
    [tenantId, goalId, keys],
  );
  return Number(result?.rows[0]?.unresolved ?? keys.length) === 0;
}

async function priorPlanStepsComplete(tenantId: string, step: GoalStepRow) {
  if (step.action !== "verify_outcome") return true;
  const result = await queryPostgres<{ incomplete: string }>(
    `select count(*)::text as incomplete
       from public.operating_goal_steps prior
      where prior.tenant_id=$1 and prior.goal_id=$2 and prior.plan_version=$3
        and prior.sequence_number < (
          select current.sequence_number from public.operating_goal_steps current
           where current.tenant_id=$1 and current.id=$4
        )
        and prior.status <> 'completed'`,
    [tenantId, step.goal_id, step.plan_version, step.id],
  );
  return Number(result?.rows[0]?.incomplete ?? 1) === 0;
}

async function updateStep(input: {
  tenantId: string;
  stepId: string;
  status: string;
  referenceTable?: string | null;
  referenceId?: string | null;
  href?: string | null;
  error?: string | null;
  evidence?: Record<string, unknown>;
  retryHours?: number;
}) {
  await queryPostgres(
    `update public.operating_goal_steps set status=$3,
       reference_table=coalesce($4,reference_table),reference_id=coalesce($5,reference_id),
       href=coalesce($6,href),last_safe_error=$7,
       evidence_json=evidence_json || $8::jsonb,attempt_count=attempt_count+1,
       last_attempt_at=now(),next_attempt_at=now()+make_interval(hours => $9),
       completed_at=case when $3='completed' then coalesce(completed_at,now()) else completed_at end,
       updated_at=now()
     where tenant_id=$1 and id=$2`,
    [
      input.tenantId,
      input.stepId,
      input.status,
      input.referenceTable ?? null,
      input.referenceId ?? null,
      input.href ?? null,
      input.error?.slice(0, 500) ?? null,
      JSON.stringify(input.evidence ?? {}),
      Math.max(1, Math.min(input.retryHours ?? 24, 168)),
    ],
  );
}

async function recordStepEvent(input: {
  tenantId: string;
  goalId: string;
  step: GoalStepRow;
  status: string;
  evidence?: Record<string, unknown>;
}) {
  await queryPostgres(
    `insert into public.operating_goal_events
       (tenant_id,goal_id,event_type,event_key,source_system,source_table,source_id,material_change,evidence_json)
     values ($1,$2,'plan_step_updated',$3,'ferocity','operating_goal_steps',$4,true,$5::jsonb)
     on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing`,
    [
      input.tenantId,
      input.goalId,
      `step:${input.step.plan_version}:${input.step.step_key}:${input.status}`,
      input.step.id,
      JSON.stringify({
        stepKey: input.step.step_key,
        action: input.step.action,
        status: input.status,
        ...(input.evidence ?? {}),
      }),
    ],
  );
}

async function prepareOwnerReview(tenantId: string, step: GoalStepRow) {
  const actionType = step.action === "assign_work"
    ? "assign_worker"
    : step.action === "prepare_communication"
      ? "marketing_followup"
      : "custom";
  const result = await queryPostgres<{ id: string }>(
    `insert into public.office_manager_action_requests (
       tenant_id,action_type,status,priority,confidence_score,title,summary,recommended_action,
       target_table,target_id,idempotency_key,requires_owner,metadata_json
     ) values ($1,$2,'needs_review',$3,80,$4,$5,$6,'operating_goals',$7,$8,true,$9::jsonb)
     on conflict (tenant_id,idempotency_key) do update set
       title=excluded.title,summary=excluded.summary,recommended_action=excluded.recommended_action,
       metadata_json=public.office_manager_action_requests.metadata_json || excluded.metadata_json,
       updated_at=now()
     returning id`,
    [
      tenantId,
      actionType,
      step.priority === "critical" ? "urgent" : step.priority === "high" ? "high" : step.priority,
      step.title,
      step.why || step.completion_evidence_requirement,
      step.action === "assign_work"
        ? "Choose or confirm the worker and timing. Ferocity will retain this step and continue after approval."
        : step.action === "prepare_communication"
          ? "Confirm the exact recipient, channel, and message. Sending remains governed by consent, provider, and approval policy."
          : step.action === "verify_outcome"
            ? `Confirm only if you observed the requested result. Add a source, reference, or correction in the review note when useful. Expected evidence: ${step.completion_evidence_requirement}`
          : "Provide the missing decision or information so Ferocity can continue the same goal.",
      step.goal_id,
      `operating-goal-step:${step.goal_id}:${step.plan_version}:${step.step_key}`,
      JSON.stringify({
        operatingGoalId: step.goal_id,
        operatingGoalStepId: step.id,
        planVersion: step.plan_version,
        stepKey: step.step_key,
        requestedAction: step.action,
        completionEvidence: step.completion_evidence_requirement,
      }),
    ],
  );
  const requestId = result?.rows[0]?.id;
  if (!requestId) throw new Error("The review request could not be prepared.");
  const brandResult = await queryPostgres<{ id: string }>(
    `select id from public.brands where tenant_id=$1 and status='active' order by created_at limit 1`,
    [tenantId],
  );
  const brandId = brandResult?.rows[0]?.id;
  if (!brandId) throw new Error("The review request needs an active workspace brand.");
  const approvalResult = await queryPostgres<{ id: string }>(
    `insert into public.approvals
       (tenant_id,brand_id,target_type,target_id,status,risk_level,notes)
     values ($1,$2,'office_manager_action_request',$3,'pending',$4,$5)
     on conflict (tenant_id,target_type,target_id) where status='pending' do update set
       risk_level=excluded.risk_level,notes=excluded.notes
     returning id`,
    [
      tenantId,
      brandId,
      requestId,
      step.priority === "critical" || step.priority === "high" ? "high" : "medium",
      `${step.title}\n\n${step.why || step.completion_evidence_requirement}`.slice(0, 1000),
    ],
  );
  const approvalId = approvalResult?.rows[0]?.id;
  if (!approvalId) throw new Error("The canonical approval could not be prepared.");
  await queryPostgres(
    `insert into public.operating_goal_dependencies
       (tenant_id,goal_id,dependency_key,dependency_type,title,status,required,owner_action_required,
        reference_table,reference_id,evidence_json,metadata_json)
     values ($1,$2,$3,'information',$4,'blocked',true,true,'office_manager_action_requests',$5,$6::jsonb,$7::jsonb)
     on conflict (tenant_id,goal_id,dependency_key) do update set
       title=excluded.title,status=case
         when public.operating_goal_dependencies.status in ('satisfied','waived') then public.operating_goal_dependencies.status
         else 'blocked' end,
       owner_action_required=true,reference_table=excluded.reference_table,reference_id=excluded.reference_id,
       evidence_json=public.operating_goal_dependencies.evidence_json || excluded.evidence_json,updated_at=now()`,
    [
      tenantId,
      step.goal_id,
      `plan-step:${step.plan_version}:${step.step_key}:owner`,
      step.title,
      requestId,
      JSON.stringify({ actionRequestId: requestId }),
      JSON.stringify({ operatingGoalStepId: step.id }),
    ],
  );
  await updateStep({
    tenantId,
    stepId: step.id,
    status: "needs_owner",
    referenceTable: "office_manager_action_requests",
    referenceId: requestId,
    href: `/app/approvals?approval=${approvalId}`,
  });
  await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "needs_owner", evidence: { actionRequestId: requestId, approvalId } });
}

async function inspectRelatedEntity(tenantId: string, step: GoalStepRow) {
  const table = step.related_entity_type ? ENTITY_TABLES[step.related_entity_type] : null;
  if (!table || !step.related_entity_id || step.domain_system !== "ferocity") return false;
  const result = await queryPostgres<{ found: boolean }>(
    `select exists(select 1 from public.${table} where tenant_id=$1 and id=$2) as found`,
    [tenantId, step.related_entity_id],
  );
  if (result?.rows[0]?.found !== true) return false;
  const evidence = { table, id: step.related_entity_id, inspectedAt: new Date().toISOString() };
  await updateStep({ tenantId, stepId: step.id, status: "completed", referenceTable: table, referenceId: step.related_entity_id, evidence });
  await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "completed", evidence });
  return true;
}

async function createUnambiguousAssignment(tenantId: string, step: GoalStepRow) {
  const workers = await queryPostgres<{ id: string }>(
    `select id from public.operations_workers
      where tenant_id=$1 and availability_status='available'
      order by case role_type when 'owner' then 3 when 'manager' then 2 else 1 end,updated_at desc
      limit 2`,
    [tenantId],
  );
  if ((workers?.rows.length ?? 0) !== 1) return null;
  const assignment = await createGoalWorkAssignment({
    tenantId,
    goalId: step.goal_id,
    workerId: workers!.rows[0].id,
    title: step.title,
    priority: step.priority === "critical" ? "urgent" : step.priority,
    tasks: [step.title],
    dispatchNotes: [step.why, `Completion evidence: ${step.completion_evidence_requirement}`].filter(Boolean).join(" "),
  });
  await updateStep({
    tenantId,
    stepId: step.id,
    status: "in_progress",
    referenceTable: "operations_assignments",
    referenceId: assignment.id,
    href: "/app/operations-workforce",
    evidence: { assignmentId: assignment.id },
  });
  await queryPostgres(
    `update public.operating_goal_dependencies set status='satisfied',satisfied_at=coalesce(satisfied_at,now()),
       evidence_json=evidence_json || $4::jsonb,updated_at=now()
     where tenant_id=$1 and goal_id=$2 and dependency_key=$3 and status not in ('satisfied','waived')`,
    [
      tenantId,
      step.goal_id,
      `plan-step:${step.plan_version}:${step.step_key}:owner`,
      JSON.stringify({ approvedActionExecuted: true, assignmentId: assignment.id }),
    ],
  );
  await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "in_progress", evidence: { assignmentId: assignment.id } });
  return assignment.id;
}

async function createWaitingDependency(tenantId: string, step: GoalStepRow) {
  const dependencyType = step.action === "verify_outcome" ? "external_event" : "external_event";
  await queryPostgres(
    `insert into public.operating_goal_dependencies
       (tenant_id,goal_id,dependency_key,dependency_type,title,status,required,owner_action_required,next_check_at,evidence_json,metadata_json)
     values ($1,$2,$3,$4,$5,'waiting',true,false,now()+interval '24 hours',$6::jsonb,$7::jsonb)
     on conflict (tenant_id,goal_id,dependency_key) do update set
       title=excluded.title,next_check_at=excluded.next_check_at,
       status=case when public.operating_goal_dependencies.status in ('satisfied','waived')
         then public.operating_goal_dependencies.status else 'waiting' end,
       updated_at=now()`,
    [
      tenantId,
      step.goal_id,
      `plan-step:${step.plan_version}:${step.step_key}:event`,
      dependencyType,
      step.title,
      JSON.stringify({ expectedEvidence: step.completion_evidence_requirement }),
      JSON.stringify({ operatingGoalStepId: step.id }),
    ],
  );
  await updateStep({ tenantId, stepId: step.id, status: "waiting", retryHours: 24 });
  await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "waiting" });
}

async function reconcileStepReferences(tenantId: string) {
  await queryPostgres(
    `update public.operating_goal_steps step set
       status=case when assignment.status='completed' then 'completed' else 'failed' end,
       completed_at=case when assignment.status='completed' then coalesce(step.completed_at,now()) else step.completed_at end,
       last_safe_error=case when assignment.status in ('blocked','missed') then 'The linked assignment needs replanning.' else null end,
       evidence_json=step.evidence_json || jsonb_build_object('linkedAssignmentStatus',assignment.status,'checkedAt',now()),
       updated_at=now()
     from public.operations_assignments assignment
     where step.tenant_id=$1 and step.reference_table='operations_assignments'
       and step.reference_id=assignment.id and assignment.tenant_id=step.tenant_id
       and step.status='in_progress' and assignment.status in ('completed','blocked','missed')`,
    [tenantId],
  );
}

export async function advanceOperatingGoalStepsForTenant(tenantId: string, limit = 50) {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
  const materialized = await backfillUnmaterializedPlans(tenantId, boundedLimit);
  await reconcileStepReferences(tenantId);
  const result = await queryPostgres<GoalStepRow>(
    `select step.id,step.goal_id,step.plan_version,step.step_key,step.action,step.title,step.why,
       step.status,step.owner_required,step.dependency_keys_json,step.completion_evidence_requirement,
       step.reference_table,step.reference_id,goal.authority_mode,goal.domain_system,
       goal.related_entity_type,goal.related_entity_id,goal.priority,
       coalesce((goal.current_state_json->>'outcomeVerified')::boolean,false) as outcome_verified,
       case when request.status='approved' and approval.id is not null then 'approved' else request.status end as approval_status,
       approval.id as approval_id,approval.notes as approval_notes,
       approval.reviewed_by_user_id as approval_reviewed_by_user_id,approval.reviewed_at as approval_reviewed_at,
       generated_dependency.status as generated_dependency_status,
       row_number() over (
         partition by step.goal_id
         order by step.plan_version desc,step.sequence_number,step.next_attempt_at
       ) as goal_round
     from public.operating_goal_steps step
     join public.operating_goals goal on goal.tenant_id=step.tenant_id and goal.id=step.goal_id
     left join public.office_manager_action_requests request
       on step.reference_table='office_manager_action_requests' and request.tenant_id=step.tenant_id and request.id=step.reference_id
     left join lateral (
       select item.id,item.notes,item.reviewed_by_user_id,item.reviewed_at
         from public.approvals item
        where item.tenant_id=step.tenant_id and item.target_type='office_manager_action_request'
          and item.target_id=request.id and item.status='approved'
        order by item.reviewed_at desc nulls last,item.created_at desc limit 1
     ) approval on true
     left join public.operating_goal_dependencies generated_dependency
       on generated_dependency.tenant_id=step.tenant_id and generated_dependency.goal_id=step.goal_id
       and generated_dependency.dependency_key in (
         'plan-step:' || step.plan_version::text || ':' || step.step_key || ':event',
         'plan-step:' || step.plan_version::text || ':' || step.step_key || ':owner'
       )
     where step.tenant_id=$1 and goal.status in ('active','progressing','waiting','blocked','needs_owner')
       and step.status in ('planned','ready','waiting','blocked','needs_owner')
       and step.next_attempt_at <= now()
     order by case goal.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
       goal_round,goal.next_evaluation_at,step.next_attempt_at,step.sequence_number
     limit $2`,
    [tenantId, boundedLimit],
  );
  let completed = 0;
  let inProgress = 0;
  let waiting = 0;
  let needsOwner = 0;
  let failed = 0;

  for (const step of result?.rows ?? []) {
    try {
      if (step.action !== "verify_outcome" && ["satisfied", "waived"].includes(step.generated_dependency_status ?? "")) {
        const evidence = { dependencyStatus: step.generated_dependency_status };
        await updateStep({ tenantId, stepId: step.id, status: "completed", evidence });
        await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "completed", evidence });
        completed += 1;
        continue;
      }
      if (step.status === "needs_owner" && step.approval_status === "dismissed") {
        await queryPostgres(
          `update public.operating_goal_dependencies set status='waived',satisfied_at=coalesce(satisfied_at,now()),updated_at=now()
            where tenant_id=$1 and goal_id=$2 and dependency_key=$3 and status not in ('satisfied','waived')`,
          [tenantId, step.goal_id, `plan-step:${step.plan_version}:${step.step_key}:owner`],
        );
        await updateStep({ tenantId, stepId: step.id, status: "canceled", evidence: { ownerDismissed: true } });
        await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "canceled", evidence: { ownerDismissed: true } });
        continue;
      }
      const dependenciesSatisfied = await dependenciesReady(tenantId, step.goal_id, dependencyKeys(step.dependency_keys_json));
      const ready = dependenciesSatisfied && await priorPlanStepsComplete(tenantId, step);
      const disposition = determineGoalStepDisposition({
        action: step.action,
        dependenciesReady: ready,
        authorityMode: step.authority_mode,
        ownerRequired: step.owner_required,
        outcomeVerified: step.outcome_verified,
        approved: step.approval_status === "approved",
      });
      if (disposition === "wait_for_dependencies") {
        await updateStep({ tenantId, stepId: step.id, status: "waiting", retryHours: 6 });
        waiting += 1;
        continue;
      }
      if (disposition === "inspect_related_entity") {
        if (await inspectRelatedEntity(tenantId, step)) completed += 1;
        else {
          await createWaitingDependency(tenantId, step);
          waiting += 1;
        }
      } else if (disposition === "execute_assignment") {
        if (await createUnambiguousAssignment(tenantId, step)) inProgress += 1;
        else {
          await prepareOwnerReview(tenantId, step);
          needsOwner += 1;
        }
      } else if (disposition === "prepare_owner_review") {
        await prepareOwnerReview(tenantId, step);
        needsOwner += 1;
      } else if (disposition === "record_owner_verified_outcome") {
        if (!step.approval_id || !step.reference_id) {
          throw new Error("Approved outcome evidence is missing its canonical approval reference.");
        }
        const evidence = {
          evidenceKind: "owner_attestation",
          expectedEvidence: step.completion_evidence_requirement,
          approvalId: step.approval_id,
          actionRequestId: step.reference_id,
          ownerNote: step.approval_notes || null,
          reviewedByUserId: step.approval_reviewed_by_user_id,
          reviewedAt: step.approval_reviewed_at?.toISOString() ?? new Date().toISOString(),
        };
        await recordOperatingGoalOutcome({
          tenantId,
          goalId: step.goal_id,
          outcomeVerified: true,
          eventKey: `owner-attestation:${step.approval_id}`,
          sourceSystem: "ferocity_owner_approval",
          evidence,
        });
        await queryPostgres(
          `update public.operating_goal_dependencies
              set status='satisfied',satisfied_at=coalesce(satisfied_at,now()),
                  evidence_json=evidence_json || $4::jsonb,updated_at=now()
            where tenant_id=$1 and goal_id=$2 and dependency_key=$3
              and status not in ('satisfied','waived')`,
          [
            tenantId,
            step.goal_id,
            `plan-step:${step.plan_version}:${step.step_key}:owner`,
            JSON.stringify(evidence),
          ],
        );
        await updateStep({ tenantId, stepId: step.id, status: "completed", evidence });
        await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "completed", evidence });
        completed += 1;
      } else if (disposition === "complete_verified_outcome") {
        const evidence = { outcomeVerified: true, verifiedAt: new Date().toISOString() };
        await updateStep({ tenantId, stepId: step.id, status: "completed", evidence });
        await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "completed", evidence });
        completed += 1;
      } else {
        if (step.action === "verify_outcome" && step.domain_system === "ferocity") {
          await prepareOwnerReview(tenantId, step);
          needsOwner += 1;
        } else {
          await createWaitingDependency(tenantId, step);
          waiting += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The goal step could not advance safely.";
      await updateStep({ tenantId, stepId: step.id, status: "blocked", error: message, retryHours: 6 });
      await recordStepEvent({ tenantId, goalId: step.goal_id, step, status: "blocked", evidence: { safeError: message.slice(0, 240) } });
      failed += 1;
    }
  }
  return {
    materialized,
    checked: result?.rows.length ?? 0,
    completed,
    inProgress,
    waiting,
    needsOwner,
    failed,
  };
}
