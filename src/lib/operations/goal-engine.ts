import { createHash } from "node:crypto";
import {
  queryPostgres,
  withPostgresTransactionResult,
} from "@/lib/db/postgres";

export type OperatingGoalStatus =
  | "draft"
  | "active"
  | "progressing"
  | "waiting"
  | "blocked"
  | "needs_owner"
  | "paused"
  | "completed"
  | "verified"
  | "canceled";

export type OperatingGoalDependencyType =
  | "goal"
  | "commitment"
  | "work_assignment"
  | "service_task"
  | "outbound_action"
  | "capability"
  | "integration"
  | "information"
  | "person_response"
  | "external_event";

export type OperatingGoalDependency = {
  id: string;
  dependencyType: OperatingGoalDependencyType;
  title: string;
  status: "pending" | "waiting" | "satisfied" | "blocked" | "waived" | "failed";
  required: boolean;
  ownerActionRequired: boolean;
  nextCheckAt: string | Date | null;
  expectedBy: string | Date | null;
};

export type OperatingGoalWorkState = {
  commitmentsOpen: number;
  commitmentsCompleted: number;
  assignmentsOpen: number;
  assignmentsCompleted: number;
  serviceTasksOpen: number;
  serviceTasksCompleted: number;
  outboundActionsOpen: number;
  outboundActionsCompleted: number;
  outboundActionsFailed: number;
};

export type OperatingGoalEvaluation = {
  status: OperatingGoalStatus;
  summary: string;
  nextEvaluationAt: string;
  blindSpots: Array<{
    dependencyId: string;
    type: OperatingGoalDependencyType;
    title: string;
    ownerActionRequired: boolean;
  }>;
  requiresReplan: boolean;
  ownerAttention: boolean;
};

export type OperatingGoalControl = "pause" | "resume" | "retry" | "cancel";

const TERMINAL_STATUSES = new Set<OperatingGoalStatus>([
  "completed",
  "verified",
  "canceled",
]);
const EXTERNAL_DEPENDENCIES = new Set<OperatingGoalDependencyType>([
  "person_response",
  "external_event",
]);
const BLIND_SPOT_DEPENDENCIES = new Set<OperatingGoalDependencyType>([
  "capability",
  "integration",
  "information",
]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function safeDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function addMilliseconds(now: Date, milliseconds: number) {
  return new Date(now.getTime() + milliseconds);
}

function earliestDate(values: Array<string | Date | null | undefined>) {
  const valid = values
    .map(safeDate)
    .filter((value): value is Date => value !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  return valid[0] ?? null;
}

function nextCheck(input: {
  status: OperatingGoalStatus;
  dependencies: OperatingGoalDependency[];
  targetAt?: string | Date | null;
  now: Date;
}) {
  const dependencyCheck = earliestDate(
    input.dependencies
      .filter((dependency) => !["satisfied", "waived"].includes(dependency.status))
      .flatMap((dependency) => [dependency.nextCheckAt, dependency.expectedBy]),
  );
  const target = safeDate(input.targetAt);
  const fallbackHours =
    input.status === "progressing"
      ? 6
      : input.status === "needs_owner"
        ? 24
        : input.status === "blocked"
          ? 12
          : 24;
  const fallback = addMilliseconds(input.now, fallbackHours * 60 * 60 * 1_000);
  const candidate = earliestDate([dependencyCheck, target, fallback].filter((value) => {
    const parsed = safeDate(value);
    return parsed !== null && parsed.getTime() > input.now.getTime();
  })) ?? fallback;
  return candidate;
}

export function evaluateOperatingGoal(input: {
  currentStatus: OperatingGoalStatus;
  priority: "low" | "normal" | "high" | "critical";
  targetAt?: string | Date | null;
  outcomeVerified?: boolean;
  materialChangeObserved?: boolean;
  dependencies: OperatingGoalDependency[];
  work: OperatingGoalWorkState;
  now?: Date;
}): OperatingGoalEvaluation {
  const now = input.now ?? new Date();
  if (input.currentStatus === "paused") {
    return {
      status: "paused",
      summary: "This outcome is paused by the owner and will not advance until resumed.",
      nextEvaluationAt: addMilliseconds(now, 365 * 24 * 60 * 60 * 1_000).toISOString(),
      blindSpots: [],
      requiresReplan: false,
      ownerAttention: false,
    };
  }
  if (TERMINAL_STATUSES.has(input.currentStatus)) {
    return {
      status: input.currentStatus,
      summary: `Goal remains ${input.currentStatus}.`,
      nextEvaluationAt: addMilliseconds(now, 365 * 24 * 60 * 60 * 1_000).toISOString(),
      blindSpots: [],
      requiresReplan: false,
      ownerAttention: false,
    };
  }

  const unresolved = input.dependencies.filter(
    (dependency) => dependency.required && !["satisfied", "waived"].includes(dependency.status),
  );
  const blindSpots = unresolved
    .filter((dependency) => BLIND_SPOT_DEPENDENCIES.has(dependency.dependencyType))
    .map((dependency) => ({
      dependencyId: dependency.id,
      type: dependency.dependencyType,
      title: dependency.title,
      ownerActionRequired: dependency.ownerActionRequired,
    }));
  const ownerDependency = unresolved.find(
    (dependency) => dependency.ownerActionRequired,
  );
  const failedDependency = unresolved.find(
    (dependency) => ["blocked", "failed"].includes(dependency.status),
  );
  const openWork =
    input.work.commitmentsOpen +
    input.work.assignmentsOpen +
    input.work.serviceTasksOpen +
    input.work.outboundActionsOpen;
  const failedWork = input.work.outboundActionsFailed;
  const allRequiredSatisfied = input.dependencies
    .filter((dependency) => dependency.required)
    .every((dependency) => ["satisfied", "waived"].includes(dependency.status));
  const hasRequiredDependencies = input.dependencies.some(
    (dependency) => dependency.required,
  );
  const target = safeDate(input.targetAt);
  const targetMissed = Boolean(target && target.getTime() < now.getTime());

  let status: OperatingGoalStatus;
  let summary: string;
  let ownerAttention = false;
  let requiresReplan = Boolean(input.materialChangeObserved);

  if (input.outcomeVerified && allRequiredSatisfied && openWork === 0) {
    status = "completed";
    summary = "The desired outcome has completion evidence and every required dependency is resolved.";
  } else if (ownerDependency) {
    status = "needs_owner";
    ownerAttention = true;
    summary = `Owner action is required: ${ownerDependency.title}`;
  } else if (failedDependency || failedWork > 0) {
    status = "blocked";
    requiresReplan = true;
    summary = failedDependency
      ? `A required dependency is blocked: ${failedDependency.title}`
      : `${failedWork} linked outbound action(s) failed or were blocked.`;
  } else if (targetMissed && openWork === 0) {
    status = input.priority === "critical" ? "needs_owner" : "blocked";
    ownerAttention = input.priority === "critical";
    requiresReplan = true;
    summary = "The target time passed without completion evidence or active work.";
  } else if (
    unresolved.length > 0 &&
    unresolved.every(
      (dependency) =>
        dependency.status === "waiting" ||
        EXTERNAL_DEPENDENCIES.has(dependency.dependencyType),
    )
  ) {
    status = "waiting";
    summary = `Waiting on ${unresolved.length} external response or event${unresolved.length === 1 ? "" : "s"}.`;
  } else if (openWork > 0) {
    status = "progressing";
    summary = `${openWork} linked action${openWork === 1 ? " is" : "s are"} still in progress.`;
  } else if (hasRequiredDependencies && allRequiredSatisfied && !input.outcomeVerified) {
    status = "active";
    requiresReplan = true;
    summary = "All planned dependencies are resolved, but the actual outcome still needs verification.";
  } else {
    status = "active";
    requiresReplan = true;
    summary = unresolved.length
      ? `${unresolved.length} required dependency${unresolved.length === 1 ? " remains" : "ies remain"} without active execution work.`
      : "The goal needs a concrete plan or completion rule before Ferocity can advance it.";
  }

  return {
    status,
    summary,
    nextEvaluationAt: nextCheck({
      status,
      dependencies: input.dependencies,
      targetAt: input.targetAt,
      now,
    }).toISOString(),
    blindSpots,
    requiresReplan,
    ownerAttention,
  };
}

export async function controlOperatingGoal(input: {
  tenantId: string;
  goalId: string;
  control: OperatingGoalControl;
  actorUserId?: string | null;
}) {
  const result = await withPostgresTransactionResult(async (client) => {
    const selected = await client.query<{
      id: string;
      status: OperatingGoalStatus;
      evaluation_version: number;
      title: string;
    }>(
      `select id,status,evaluation_version,title
         from public.operating_goals
        where tenant_id=$1 and id=$2
        for update`,
      [input.tenantId, input.goalId],
    );
    const goal = selected.rows[0];
    if (!goal) throw new Error("The operating goal is unavailable in this workspace.");

    if (["completed", "verified"].includes(goal.status)) {
      throw new Error("A completed or verified outcome cannot be changed with a runtime control.");
    }
    if (goal.status === "canceled") {
      if (input.control === "cancel") return { changed: false, status: goal.status, title: goal.title };
      throw new Error("A canceled outcome cannot be resumed. Create a new outcome if the work is needed again.");
    }

    let nextStatus: OperatingGoalStatus;
    let summary: string;
    let requiresReplan = false;
    if (input.control === "pause") {
      if (goal.status === "paused") return { changed: false, status: goal.status, title: goal.title };
      nextStatus = "paused";
      summary = "Paused by the owner. Ferocity will retain the evidence and plan without advancing the outcome.";
    } else if (input.control === "cancel") {
      nextStatus = "canceled";
      summary = "Canceled by the owner. Existing audit evidence remains available.";
    } else {
      if (input.control === "resume" && goal.status !== "paused") {
        throw new Error("Only a paused outcome can be resumed. Use retry to re-evaluate blocked or waiting work.");
      }
      nextStatus = "active";
      requiresReplan = true;
      summary = input.control === "resume"
        ? "Resumed by the owner. Ferocity will re-evaluate the same outcome without duplicating it."
        : "Retry requested by the owner. Ferocity will re-check dependencies and replan safely.";
    }

    const eventKey = `manual-control:${input.control}:${goal.status}:${goal.evaluation_version}`;
    const updated = await client.query<{ id: string }>(
      `update public.operating_goals
          set status=$3,
              next_evaluation_at=case when $3='active' then now() else now()+interval '365 days' end,
              last_evaluation_summary=$4,
              consecutive_failures=case when $3='active' then 0 else consecutive_failures end,
              current_state_json=current_state_json || $5::jsonb,
              canceled_at=case when $3='canceled' then coalesce(canceled_at,now()) else canceled_at end,
              updated_at=now()
        where tenant_id=$1 and id=$2
        returning id`,
      [
        input.tenantId,
        input.goalId,
        nextStatus,
        summary,
        JSON.stringify({
          requiresReplan,
          lastManualControl: input.control,
          lastManualControlAt: new Date().toISOString(),
          lastManualControlBy: input.actorUserId ?? null,
        }),
      ],
    );
    if (!updated.rows[0]) throw new Error("The operating goal could not be updated.");

    await client.query(
      `insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,previous_status,next_status,material_change,evidence_json)
       values ($1,$2,'owner_control',$3,'ferocity',$4,$5,true,$6::jsonb)
       on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing`,
      [
        input.tenantId,
        input.goalId,
        eventKey,
        goal.status,
        nextStatus,
        JSON.stringify({ control: input.control, summary, actorUserId: input.actorUserId ?? null }),
      ],
    );

    if (["active", "canceled", "paused"].includes(nextStatus)) {
      await client.query(
        `update public.owner_command_events
            set status='resolved',owner_attention=false,ai_handled=true,
                ai_summary=$3,updated_at=now()
          where tenant_id=$1 and platform_key='ferocity'
            and external_event_id=$2 and status='needs_owner'`,
        [input.tenantId, `operating-goal:${input.goalId}:needs-owner`, summary],
      );
    }
    return { changed: true, status: nextStatus, title: goal.title };
  });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function createOperatingGoal(input: {
  tenantId: string;
  brandId?: string | null;
  goalKey: string;
  goalType: string;
  title: string;
  desiredOutcome: string;
  priority?: "low" | "normal" | "high" | "critical";
  authorityMode?: "observe" | "prepare" | "execute";
  domainSystem?: string;
  sourceType?: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  externalWorkspaceId?: string | null;
  externalEntityType?: string | null;
  externalEntityId?: string | null;
  targetAt?: string | null;
  completionRules?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}) {
  const goalKey = cleanText(input.goalKey, 240);
  const goalType = cleanText(input.goalType, 120);
  const title = cleanText(input.title, 240);
  const desiredOutcome = cleanText(input.desiredOutcome, 2_000);
  if (!goalKey || !goalType || !title || !desiredOutcome) {
    throw new Error("Goal key, type, title, and desired outcome are required.");
  }
  const targetAt = input.targetAt ? safeDate(input.targetAt)?.toISOString() : null;
  if (input.targetAt && !targetAt) throw new Error("Goal target time is invalid.");

  const result = await withPostgresTransactionResult(async (client) => {
    const created = await client.query<{ id: string; status: OperatingGoalStatus }>(
      `insert into public.operating_goals (
         tenant_id,brand_id,goal_key,goal_type,title,desired_outcome,priority,authority_mode,
         domain_system,source_type,related_entity_type,related_entity_id,external_workspace_id,
         external_entity_type,external_entity_id,target_at,completion_rules_json,constraints_json
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb)
       on conflict (tenant_id,goal_key) do update set
         title=excluded.title,desired_outcome=excluded.desired_outcome,priority=excluded.priority,
         target_at=coalesce(excluded.target_at,public.operating_goals.target_at),
         completion_rules_json=public.operating_goals.completion_rules_json || excluded.completion_rules_json,
         constraints_json=public.operating_goals.constraints_json || excluded.constraints_json,
         next_evaluation_at=least(public.operating_goals.next_evaluation_at,now()),updated_at=now()
       returning id,status`,
      [
        input.tenantId,
        input.brandId ?? null,
        goalKey,
        goalType,
        title,
        desiredOutcome,
        input.priority ?? "normal",
        input.authorityMode ?? "observe",
        cleanText(input.domainSystem ?? "ferocity", 80) || "ferocity",
        cleanText(input.sourceType ?? "owner_instruction", 120) || "owner_instruction",
        cleanText(input.relatedEntityType, 120) || null,
        input.relatedEntityId ?? null,
        cleanText(input.externalWorkspaceId, 180) || null,
        cleanText(input.externalEntityType, 120) || null,
        cleanText(input.externalEntityId, 240) || null,
        targetAt,
        JSON.stringify(input.completionRules ?? {}),
        JSON.stringify(input.constraints ?? {}),
      ],
    );
    const goal = created.rows[0];
    if (!goal) throw new Error("Goal could not be persisted.");
    await client.query(
      `insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,next_status,evidence_json)
       values ($1,$2,'goal_declared',$3,$4,$5,$6::jsonb)
       on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing`,
      [
        input.tenantId,
        goal.id,
        `declared:${createHash("sha256").update(`${goalKey}:${desiredOutcome}`).digest("hex")}`,
        cleanText(input.domainSystem ?? "ferocity", 80) || "ferocity",
        goal.status,
        JSON.stringify({ title, desiredOutcome, targetAt }),
      ],
    );
    return goal;
  });
  if (!result.ok) throw new Error("Goal could not be persisted safely.");
  return result.value;
}

type ActiveOperatingGoalContextRow = {
  id: string;
  title: string;
  desired_outcome: string;
  status: OperatingGoalStatus;
  priority: string;
  authority_mode: string;
  domain_system: string;
  current_step_title: string | null;
};

export function formatActiveOperatingGoalContext(rows: ActiveOperatingGoalContextRow[]) {
  if (!rows.length) return "";
  return [
    "Active durable outcomes in this exact Ferocity conversation:",
    ...rows.slice(0, 8).map((goal) => [
      `- Goal ${goal.id}: ${cleanText(goal.title, 240)}`,
      `desired outcome=${cleanText(goal.desired_outcome, 1_000)}`,
      `status=${goal.status}`,
      `priority=${cleanText(goal.priority, 20)}`,
      `authority=${cleanText(goal.authority_mode, 20)}`,
      `authoritative domain=${cleanText(goal.domain_system, 80)}`,
      goal.current_step_title ? `current step=${cleanText(goal.current_step_title, 300)}` : "current step=not yet materialized",
    ].join("; ")),
    "Use these stable goal IDs for follow-ups and corrections. Do not start a duplicate outcome merely because the owner's wording changed.",
  ].join("\n");
}

export async function getActiveOperatingGoalContextForThread(input: {
  tenantId: string;
  threadId?: string | null;
}) {
  const threadId = cleanText(input.threadId, 240);
  if (!threadId) return "";
  const result = await queryPostgres<ActiveOperatingGoalContextRow>(
    `select goal.id,goal.title,goal.desired_outcome,goal.status,goal.priority,
       goal.authority_mode,goal.domain_system,current_step.title as current_step_title
     from public.operating_goals goal
     left join lateral (
       select step.title from public.operating_goal_steps step
        where step.tenant_id=goal.tenant_id and step.goal_id=goal.id
          and step.plan_version=goal.plan_version
          and step.status not in ('completed','canceled','failed')
        order by step.sequence_number limit 1
     ) current_step on true
     where goal.tenant_id=$1
       and goal.constraints_json->>'sourceThreadId'=$2
       and goal.status in ('draft','active','progressing','waiting','blocked','needs_owner','paused')
     order by goal.updated_at desc limit 8`,
    [input.tenantId, threadId],
  );
  return formatActiveOperatingGoalContext(result?.rows ?? []);
}

export async function correctLatestOperatingGoalFromThread(input: {
  tenantId: string;
  threadId: string;
  correctedOutcome: string;
  correctedTitle?: string | null;
  actorUserId?: string | null;
}) {
  const threadId = cleanText(input.threadId, 240);
  const correctedOutcome = cleanText(input.correctedOutcome, 2_000);
  const correctedTitle = cleanText(input.correctedTitle, 240);
  if (!threadId || !correctedOutcome) {
    throw new Error("A chat and corrected outcome are required.");
  }

  const result = await withPostgresTransactionResult(async (client) => {
    const selected = await client.query<{
      id: string;
      title: string;
      desired_outcome: string;
      status: OperatingGoalStatus;
      evaluation_version: number;
    }>(
      `select id,title,desired_outcome,status,evaluation_version
         from public.operating_goals
        where tenant_id=$1
          and constraints_json->>'sourceThreadId'=$2
          and status in ('draft','active','progressing','waiting','blocked','needs_owner','paused')
        order by updated_at desc,created_at desc
        limit 1
        for update`,
      [input.tenantId, threadId],
    );
    const goal = selected.rows[0];
    if (!goal) return null;

    const canceledSteps = await client.query<{
      plan_version: number;
      step_key: string;
      reference_table: string | null;
      reference_id: string | null;
    }>(
      `update public.operating_goal_steps
          set status='canceled',
              last_safe_error='Superseded by an explicit owner correction before execution.',
              evidence_json=evidence_json || jsonb_build_object(
                'supersededByOwnerCorrection',true,'supersededAt',now()
              ),
              updated_at=now()
        where tenant_id=$1 and goal_id=$2
          and status in ('planned','ready','waiting','blocked','needs_owner')
        returning plan_version,step_key,reference_table,reference_id`,
      [input.tenantId, goal.id],
    );

    for (const step of canceledSteps.rows) {
      await client.query(
        `update public.operating_goal_dependencies
            set status='waived',satisfied_at=coalesce(satisfied_at,now()),
                evidence_json=evidence_json || jsonb_build_object(
                  'supersededByOwnerCorrection',true,'supersededAt',now()
                ),updated_at=now()
          where tenant_id=$1 and goal_id=$2
            and dependency_key like $3
            and status not in ('satisfied','waived')`,
        [input.tenantId, goal.id, `plan-step:${step.plan_version}:${step.step_key}:%`],
      );
      if (step.reference_table === "office_manager_action_requests" && step.reference_id) {
        await client.query(
          `update public.office_manager_action_requests
              set status='dismissed',
                  metadata_json=metadata_json || jsonb_build_object(
                    'supersededByOwnerCorrection',true,'supersededAt',now()
                  ),updated_at=now()
            where tenant_id=$1 and id=$2
              and status in ('draft','needs_review','approved','blocked')`,
          [input.tenantId, step.reference_id],
        );
      }
    }

    const inProgress = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.operating_goal_steps
        where tenant_id=$1 and goal_id=$2 and status='in_progress'`,
      [input.tenantId, goal.id],
    );
    const inProgressCount = Number(inProgress.rows[0]?.count ?? 0);
    const nextStatus = goal.status === "paused" ? "paused" : "active";
    const nextTitle = correctedTitle || correctedOutcome.slice(0, 240);
    const correctionHash = createHash("sha256")
      .update(`${goal.id}:${goal.evaluation_version}:${correctedOutcome}`)
      .digest("hex");

    await client.query(
      `update public.operating_goals
          set title=$3,desired_outcome=$4,status=$5,
              evaluation_version=evaluation_version+1,
              current_state_json=current_state_json || $6::jsonb,
              plan_json='[]'::jsonb,
              next_evaluation_at=case when $5='paused' then next_evaluation_at else now() end,
              last_evaluation_summary='Owner corrected the desired outcome; stale unstarted steps were canceled and replanning is required.',
              completed_at=null,verified_at=null,last_safe_error=null,updated_at=now()
        where tenant_id=$1 and id=$2`,
      [
        input.tenantId,
        goal.id,
        nextTitle,
        correctedOutcome,
        nextStatus,
        JSON.stringify({
          requiresReplan: goal.status !== "paused",
          outcomeVerified: false,
          inProgressReviewRequired: inProgressCount > 0,
          lastOwnerCorrectionAt: new Date().toISOString(),
          lastOwnerCorrectionBy: input.actorUserId ?? null,
        }),
      ],
    );
    await client.query(
      `insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,previous_status,next_status,material_change,evidence_json)
       values ($1,$2,'owner_correction',$3,'ferocity',$4,$5,true,$6::jsonb)
       on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing`,
      [
        input.tenantId,
        goal.id,
        `owner-correction:${correctionHash}`,
        goal.status,
        nextStatus,
        JSON.stringify({
          previousTitle: goal.title,
          previousDesiredOutcome: goal.desired_outcome,
          correctedTitle: nextTitle,
          correctedOutcome,
          canceledUnstartedStepCount: canceledSteps.rowCount ?? canceledSteps.rows.length,
          inProgressStepCount: inProgressCount,
          actorUserId: input.actorUserId ?? null,
        }),
      ],
    );

    return {
      id: goal.id,
      title: nextTitle,
      desiredOutcome: correctedOutcome,
      status: nextStatus,
      canceledUnstartedStepCount: canceledSteps.rowCount ?? canceledSteps.rows.length,
      inProgressStepCount: inProgressCount,
    };
  });
  if (!result.ok) throw new Error("The correction could not be applied safely.");
  return result.value;
}

export async function recordOperatingGoalObservation(input: {
  tenantId: string;
  goalId: string;
  eventType: string;
  eventKey: string;
  sourceSystem: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  materialChange?: boolean;
  evidence?: Record<string, unknown>;
}) {
  const eventType = cleanText(input.eventType, 120);
  const eventKey = cleanText(input.eventKey, 240);
  if (!eventType || !eventKey) throw new Error("Observation type and idempotency key are required.");
  const result = await queryPostgres<{ id: string }>(
    `with inserted as (
       insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,source_table,source_id,material_change,evidence_json)
       select $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
       where exists (select 1 from public.operating_goals where tenant_id=$1 and id=$2)
       on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing
       returning id
     ), woken as (
       update public.operating_goals set next_evaluation_at=least(next_evaluation_at,now()),updated_at=now()
       where tenant_id=$1 and id=$2 and exists (select 1 from inserted)
       returning id
     ) select id from inserted`,
    [
      input.tenantId,
      input.goalId,
      eventType,
      eventKey,
      cleanText(input.sourceSystem, 80) || "ferocity",
      cleanText(input.sourceTable, 120) || null,
      cleanText(input.sourceId, 240) || null,
      input.materialChange !== false,
      JSON.stringify(input.evidence ?? {}),
    ],
  );
  return { recorded: Boolean(result?.rows[0]) };
}

export async function addOperatingGoalDependency(input: {
  tenantId: string;
  goalId: string;
  dependencyKey: string;
  dependencyType: OperatingGoalDependencyType;
  title: string;
  status?: OperatingGoalDependency["status"];
  required?: boolean;
  ownerActionRequired?: boolean;
  referenceTable?: string | null;
  referenceId?: string | null;
  externalReference?: string | null;
  nextCheckAt?: string | null;
  expectedBy?: string | null;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const dependencyKey = cleanText(input.dependencyKey, 240);
  const title = cleanText(input.title, 500);
  if (!dependencyKey || !title) {
    throw new Error("Dependency key and title are required.");
  }
  const nextCheckAt = input.nextCheckAt
    ? safeDate(input.nextCheckAt)?.toISOString()
    : null;
  const expectedBy = input.expectedBy
    ? safeDate(input.expectedBy)?.toISOString()
    : null;
  if (input.nextCheckAt && !nextCheckAt) throw new Error("Dependency check time is invalid.");
  if (input.expectedBy && !expectedBy) throw new Error("Dependency expected time is invalid.");
  const result = await queryPostgres<{ id: string }>(
    `with upserted as (
       insert into public.operating_goal_dependencies
         (tenant_id,goal_id,dependency_key,dependency_type,title,status,satisfied_at,required,owner_action_required,
          reference_table,reference_id,external_reference,next_check_at,expected_by,evidence_json,metadata_json)
       select $1,$2,$3,$4,$5,$6,
         case when $6 in ('satisfied','waived') then now() else null end,
         $7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb
       where exists (select 1 from public.operating_goals where tenant_id=$1 and id=$2)
       on conflict (tenant_id,goal_id,dependency_key) do update set
         title=excluded.title,status=excluded.status,required=excluded.required,
         satisfied_at=case when excluded.status in ('satisfied','waived')
           then coalesce(public.operating_goal_dependencies.satisfied_at,now()) else null end,
         owner_action_required=excluded.owner_action_required,
         reference_table=coalesce(excluded.reference_table,public.operating_goal_dependencies.reference_table),
         reference_id=coalesce(excluded.reference_id,public.operating_goal_dependencies.reference_id),
         external_reference=coalesce(excluded.external_reference,public.operating_goal_dependencies.external_reference),
         next_check_at=excluded.next_check_at,expected_by=excluded.expected_by,
         evidence_json=public.operating_goal_dependencies.evidence_json || excluded.evidence_json,
         metadata_json=public.operating_goal_dependencies.metadata_json || excluded.metadata_json,updated_at=now()
       returning id
     ), woken as (
       update public.operating_goals set next_evaluation_at=least(next_evaluation_at,now()),updated_at=now()
       where tenant_id=$1 and id=$2 and exists(select 1 from upserted) returning id
     ) select id from upserted`,
    [
      input.tenantId,
      input.goalId,
      dependencyKey,
      input.dependencyType,
      title,
      input.status ?? "pending",
      input.required !== false,
      input.ownerActionRequired === true,
      cleanText(input.referenceTable, 120) || null,
      input.referenceId ?? null,
      cleanText(input.externalReference, 500) || null,
      nextCheckAt,
      expectedBy,
      JSON.stringify(input.evidence ?? {}),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const dependency = result?.rows[0];
  if (!dependency) throw new Error("Dependency could not be linked to the goal.");
  return dependency;
}

export async function createGoalWorkAssignment(input: {
  tenantId: string;
  goalId: string;
  workerId: string;
  title: string;
  jobsite?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  tasks: string[];
  dispatchNotes?: string | null;
}) {
  const title = cleanText(input.title, 240);
  const tasks = Array.from(
    new Set(input.tasks.map((task) => cleanText(task, 240)).filter(Boolean)),
  ).slice(0, 50);
  if (!title || tasks.length === 0) {
    throw new Error("A work assignment needs a title and at least one task.");
  }
  const scheduledStart = input.scheduledStart
    ? safeDate(input.scheduledStart)?.toISOString()
    : null;
  const scheduledEnd = input.scheduledEnd
    ? safeDate(input.scheduledEnd)?.toISOString()
    : null;
  if (input.scheduledStart && !scheduledStart) throw new Error("Assignment start time is invalid.");
  if (input.scheduledEnd && !scheduledEnd) throw new Error("Assignment end time is invalid.");
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
    throw new Error("Assignment end time must be after its start time.");
  }

  const result = await withPostgresTransactionResult(async (client) => {
    const allowed = await client.query<{ allowed: boolean }>(
      `select exists(
         select 1 from public.operations_workers
         where tenant_id=$1 and id=$2 and availability_status <> 'inactive'
       ) and exists(
         select 1 from public.operating_goals
         where tenant_id=$1 and id=$3 and status not in ('completed','verified','canceled')
       ) as allowed`,
      [input.tenantId, input.workerId, input.goalId],
    );
    if (allowed.rows[0]?.allowed !== true) {
      throw new Error("The goal or worker is unavailable in this workspace.");
    }
    const assignment = await client.query<{ id: string }>(
      `insert into public.operations_assignments
         (tenant_id,goal_id,worker_id,title,jobsite,scheduled_start,scheduled_end,priority,
          task_list_json,ai_dispatch_notes,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
       returning id`,
      [
        input.tenantId,
        input.goalId,
        input.workerId,
        title,
        cleanText(input.jobsite, 500) || null,
        scheduledStart,
        scheduledEnd,
        input.priority ?? "normal",
        JSON.stringify(tasks.map((taskTitle) => ({ title: taskTitle, status: "open" }))),
        cleanText(input.dispatchNotes, 1_000) ||
          "Confirm access, materials, safety requirements, and completion evidence before starting.",
        JSON.stringify({ createdBy: "persistent_goal_engine", requiresOutcomeFollowThrough: true }),
      ],
    );
    const assignmentId = assignment.rows[0]?.id;
    if (!assignmentId) throw new Error("Work assignment could not be created.");
    await client.query(
      `insert into public.operating_goal_dependencies
         (tenant_id,goal_id,dependency_key,dependency_type,title,status,required,reference_table,reference_id,expected_by,metadata_json)
       values ($1,$2,$3,'work_assignment',$4,'pending',true,'operations_assignments',$5,$6,$7::jsonb)
       on conflict (tenant_id,goal_id,dependency_key) do update set
         reference_table='operations_assignments',reference_id=excluded.reference_id,status='pending',
         expected_by=excluded.expected_by,metadata_json=public.operating_goal_dependencies.metadata_json || excluded.metadata_json,updated_at=now()`,
      [
        input.tenantId,
        input.goalId,
        `work-assignment:${assignmentId}`,
        title,
        assignmentId,
        scheduledEnd,
        JSON.stringify({ taskCount: tasks.length, workerId: input.workerId }),
      ],
    );
    await client.query(
      `insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,source_table,source_id,evidence_json)
       values ($1,$2,'human_work_assigned',$3,'ferocity','operations_assignments',$4,$5::jsonb)`,
      [
        input.tenantId,
        input.goalId,
        `human-work:${assignmentId}`,
        assignmentId,
        JSON.stringify({ workerId: input.workerId, tasks, scheduledStart, scheduledEnd }),
      ],
    );
    return { id: assignmentId, taskCount: tasks.length };
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export async function recordOperatingGoalOutcome(input: {
  tenantId: string;
  goalId: string;
  outcomeVerified: boolean;
  eventKey: string;
  sourceSystem: string;
  evidence: Record<string, unknown>;
}) {
  if (input.outcomeVerified && Object.keys(input.evidence).length === 0) {
    throw new Error("Completion evidence is required before an outcome can be verified.");
  }
  const eventKey = cleanText(input.eventKey, 240);
  if (!eventKey) throw new Error("Outcome observation needs an idempotency key.");
  const result = await withPostgresTransactionResult(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into public.operating_goal_events
         (tenant_id,goal_id,event_type,event_key,source_system,material_change,evidence_json)
       select $1,$2,'outcome_observed',$3,$4,true,$5::jsonb
       where exists(select 1 from public.operating_goals where tenant_id=$1 and id=$2)
       on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing
       returning id`,
      [
        input.tenantId,
        input.goalId,
        eventKey,
        cleanText(input.sourceSystem, 80) || "ferocity",
        JSON.stringify(input.evidence),
      ],
    );
    if (!inserted.rows[0]) return false;
    await client.query(
      `update public.operating_goals set
         current_state_json=current_state_json || jsonb_build_object(
           'outcomeVerified',$3::boolean,'outcomeEvidence',$4::jsonb,'outcomeObservedAt',now()
         ),next_evaluation_at=least(next_evaluation_at,now()),updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, input.goalId, input.outcomeVerified, JSON.stringify(input.evidence)],
    );
    return true;
  });
  if (!result.ok) throw new Error("Outcome evidence could not be persisted safely.");
  return { recorded: result.value };
}

async function reconcileLinkedDependencies(tenantId: string) {
  await queryPostgres(
    `update public.operating_goal_dependencies dependency
     set status=case
       when commitment.status in ('completed','verified') then 'satisfied'
       when commitment.status in ('blocked','canceled') then 'blocked'
       else dependency.status end,
       satisfied_at=case when commitment.status in ('completed','verified') then coalesce(dependency.satisfied_at,now()) else dependency.satisfied_at end,
       evidence_json=dependency.evidence_json || jsonb_build_object('linkedStatus',commitment.status,'checkedAt',now()),updated_at=now()
     from public.operating_commitments commitment
     where dependency.tenant_id=$1 and dependency.dependency_type='commitment'
       and dependency.reference_id=commitment.id and commitment.tenant_id=dependency.tenant_id
       and dependency.status not in ('satisfied','waived')`,
    [tenantId],
  );
  await queryPostgres(
    `update public.operating_goal_dependencies dependency
     set status=case
       when assignment.status='completed' then 'satisfied'
       when assignment.status in ('blocked','missed','archived') then 'blocked'
       else dependency.status end,
       satisfied_at=case when assignment.status='completed' then coalesce(dependency.satisfied_at,now()) else dependency.satisfied_at end,
       evidence_json=dependency.evidence_json || jsonb_build_object('linkedStatus',assignment.status,'checkedAt',now()),updated_at=now()
     from public.operations_assignments assignment
     where dependency.tenant_id=$1 and dependency.dependency_type='work_assignment'
       and dependency.reference_id=assignment.id and assignment.tenant_id=dependency.tenant_id
       and dependency.status not in ('satisfied','waived')`,
    [tenantId],
  );
  await queryPostgres(
    `update public.operating_goal_dependencies dependency
     set status=case
       when task.status='done' then 'satisfied'
       when task.status='dismissed' then 'blocked'
       else dependency.status end,
       satisfied_at=case when task.status='done' then coalesce(dependency.satisfied_at,now()) else dependency.satisfied_at end,
       evidence_json=dependency.evidence_json || jsonb_build_object('linkedStatus',task.status,'checkedAt',now()),updated_at=now()
     from public.service_operational_tasks task
     where dependency.tenant_id=$1 and dependency.dependency_type='service_task'
       and dependency.reference_id=task.id and task.tenant_id=dependency.tenant_id
       and dependency.status not in ('satisfied','waived')`,
    [tenantId],
  );
  await queryPostgres(
    `update public.operating_goal_dependencies dependency
     set status=case
       when action.status in ('sent','sent_manually') then 'satisfied'
       when action.status in ('failed','blocked','canceled') then 'failed'
       else dependency.status end,
       satisfied_at=case when action.status in ('sent','sent_manually') then coalesce(dependency.satisfied_at,now()) else dependency.satisfied_at end,
       evidence_json=dependency.evidence_json || jsonb_build_object('linkedStatus',action.status,'checkedAt',now()),updated_at=now()
     from public.outbound_action_queue action
     where dependency.tenant_id=$1 and dependency.dependency_type='outbound_action'
       and dependency.reference_id=action.id and action.tenant_id=dependency.tenant_id
       and dependency.status not in ('satisfied','waived')`,
    [tenantId],
  );
  await queryPostgres(
    `update public.operating_goal_dependencies dependency
     set status=case
       when child.status in ('completed','verified') then 'satisfied'
       when child.status in ('blocked','canceled') then 'blocked'
       else dependency.status end,
       satisfied_at=case when child.status in ('completed','verified') then coalesce(dependency.satisfied_at,now()) else dependency.satisfied_at end,
       evidence_json=dependency.evidence_json || jsonb_build_object('linkedStatus',child.status,'checkedAt',now()),updated_at=now()
     from public.operating_goals child
     where dependency.tenant_id=$1 and dependency.dependency_type='goal'
       and dependency.reference_id=child.id and child.tenant_id=dependency.tenant_id
       and dependency.status not in ('satisfied','waived')`,
    [tenantId],
  );
}

type GoalRow = {
  id: string;
  title: string;
  status: OperatingGoalStatus;
  priority: "low" | "normal" | "high" | "critical";
  target_at: Date | null;
  current_state_json: Record<string, unknown> | null;
  evaluation_version: number;
  material_change_observed: boolean;
  commitments_open: string;
  commitments_completed: string;
  assignments_open: string;
  assignments_completed: string;
  service_tasks_open: string;
  service_tasks_completed: string;
  outbound_actions_open: string;
  outbound_actions_completed: string;
  outbound_actions_failed: string;
};

function count(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncOperatingGoalsForTenant(tenantId: string, limit = 100) {
  await reconcileLinkedDependencies(tenantId);
  const goals = await queryPostgres<GoalRow>(
    `select goal.id,goal.title,goal.status,goal.priority,goal.target_at,goal.current_state_json,
       goal.evaluation_version,
       exists(select 1 from public.operating_goal_events event where event.tenant_id=goal.tenant_id
         and event.goal_id=goal.id and event.material_change=true
         and event.observed_at > coalesce(goal.last_evaluated_at,'epoch'::timestamptz)) as material_change_observed,
       (select count(*) from public.operating_commitments item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('needs_confirmation','active','due_soon','overdue','blocked'))::text as commitments_open,
       (select count(*) from public.operating_commitments item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('completed','verified'))::text as commitments_completed,
       (select count(*) from public.operations_assignments item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('scheduled','in_progress','blocked','missed'))::text as assignments_open,
       (select count(*) from public.operations_assignments item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status='completed')::text as assignments_completed,
       (select count(*) from public.service_operational_tasks item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('open','scheduled'))::text as service_tasks_open,
       (select count(*) from public.service_operational_tasks item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status='done')::text as service_tasks_completed,
       (select count(*) from public.outbound_action_queue item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('draft','needs_review','approved','queued','provider_queued'))::text as outbound_actions_open,
       (select count(*) from public.outbound_action_queue item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('sent','sent_manually'))::text as outbound_actions_completed,
       (select count(*) from public.outbound_action_queue item where item.tenant_id=goal.tenant_id and item.goal_id=goal.id and item.status in ('failed','blocked'))::text as outbound_actions_failed
     from public.operating_goals goal
     where goal.tenant_id=$1 and goal.status in ('active','progressing','waiting','blocked','needs_owner')
       and goal.next_evaluation_at <= now()
     order by case goal.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
       goal.next_evaluation_at,goal.created_at limit $2`,
    [tenantId, Math.max(1, Math.min(limit, 250))],
  );
  const rows = goals?.rows ?? [];
  if (rows.length === 0) return { checked: 0, updated: 0, ownerEscalations: 0, replansRequested: 0 };
  const ids = rows.map((row) => row.id);
  const dependencyRows = await queryPostgres<{
    id: string;
    goal_id: string;
    dependency_type: OperatingGoalDependencyType;
    title: string;
    status: OperatingGoalDependency["status"];
    required: boolean;
    owner_action_required: boolean;
    next_check_at: Date | null;
    expected_by: Date | null;
  }>(
    `select id,goal_id,dependency_type,title,status,required,owner_action_required,next_check_at,expected_by
     from public.operating_goal_dependencies where tenant_id=$1 and goal_id=any($2::uuid[])
     order by created_at`,
    [tenantId, ids],
  );
  const dependenciesByGoal = new Map<string, OperatingGoalDependency[]>();
  for (const dependency of dependencyRows?.rows ?? []) {
    const list = dependenciesByGoal.get(dependency.goal_id) ?? [];
    list.push({
      id: dependency.id,
      dependencyType: dependency.dependency_type,
      title: dependency.title,
      status: dependency.status,
      required: dependency.required,
      ownerActionRequired: dependency.owner_action_required,
      nextCheckAt: dependency.next_check_at,
      expectedBy: dependency.expected_by,
    });
    dependenciesByGoal.set(dependency.goal_id, list);
  }

  let updated = 0;
  let ownerEscalations = 0;
  let replansRequested = 0;
  for (const row of rows) {
    const evaluation = evaluateOperatingGoal({
      currentStatus: row.status,
      priority: row.priority,
      targetAt: row.target_at,
      outcomeVerified: row.current_state_json?.outcomeVerified === true,
      materialChangeObserved: row.material_change_observed,
      dependencies: dependenciesByGoal.get(row.id) ?? [],
      work: {
        commitmentsOpen: count(row.commitments_open),
        commitmentsCompleted: count(row.commitments_completed),
        assignmentsOpen: count(row.assignments_open),
        assignmentsCompleted: count(row.assignments_completed),
        serviceTasksOpen: count(row.service_tasks_open),
        serviceTasksCompleted: count(row.service_tasks_completed),
        outboundActionsOpen: count(row.outbound_actions_open),
        outboundActionsCompleted: count(row.outbound_actions_completed),
        outboundActionsFailed: count(row.outbound_actions_failed),
      },
    });
    const nextVersion = row.evaluation_version + 1;
    const result = await withPostgresTransactionResult(async (client) => {
      const changed = await client.query<{ id: string }>(
        `update public.operating_goals set status=$3,next_evaluation_at=$4,last_evaluated_at=now(),
           evaluation_version=$5,blind_spots_json=$6::jsonb,last_evaluation_summary=$7,
           current_state_json=current_state_json || $8::jsonb,
           completed_at=case when $3='completed' then coalesce(completed_at,now()) else completed_at end,
           last_safe_error=null,consecutive_failures=0,updated_at=now()
         where tenant_id=$1 and id=$2 and evaluation_version=$9 returning id`,
        [
          tenantId,
          row.id,
          evaluation.status,
          evaluation.nextEvaluationAt,
          nextVersion,
          JSON.stringify(evaluation.blindSpots),
          evaluation.summary,
          JSON.stringify({
            requiresReplan: evaluation.requiresReplan,
            lastDeterministicEvaluationAt: new Date().toISOString(),
          }),
          row.evaluation_version,
        ],
      );
      if (!changed.rows[0]) return false;
      await client.query(
        `insert into public.operating_goal_events
           (tenant_id,goal_id,event_type,event_key,source_system,previous_status,next_status,material_change,evidence_json)
         values ($1,$2,'evaluated',$3,'ferocity',$4,$5,false,$6::jsonb)
         on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing`,
        [
          tenantId,
          row.id,
          `evaluation:${nextVersion}`,
          row.status,
          evaluation.status,
          JSON.stringify({
            summary: evaluation.summary,
            requiresReplan: evaluation.requiresReplan,
            blindSpots: evaluation.blindSpots,
          }),
        ],
      );
      return true;
    });
    if (!result.ok || !result.value) continue;
    updated += 1;
    if (evaluation.requiresReplan) replansRequested += 1;

    if (evaluation.ownerAttention) {
      const event = await queryPostgres<{ id: string }>(
        `insert into public.owner_command_events
           (tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
            owner_attention,ai_handled,recommended_action,action_href,risk_type,confidence_score,metadata_json)
         values ($1,'ferocity','Ferocity',$2,'operating_goal.needs_owner',$3,$4,$5,'needs_owner',true,false,$6,
           '/app/owner-command-center','approval',100,$7::jsonb)
         on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update set
           title=excluded.title,summary=excluded.summary,severity=excluded.severity,status='needs_owner',
           owner_attention=true,ai_handled=false,recommended_action=excluded.recommended_action,
           occurred_at=now(),metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json
         returning id`,
        [
          tenantId,
          `operating-goal:${row.id}:needs-owner`,
          `Goal needs a decision: ${row.title}`,
          evaluation.summary,
          row.priority === "critical" ? "critical" : "high",
          "Resolve the stated dependency or set the policy Ferocity needs, then the goal will resume automatically.",
          JSON.stringify({ goalId: row.id, evaluationVersion: nextVersion, blindSpots: evaluation.blindSpots }),
        ],
      );
      if (event?.rows[0]) ownerEscalations += 1;
    } else {
      await queryPostgres(
        `update public.owner_command_events set status='resolved',owner_attention=false,ai_handled=true,
           ai_summary='The blocking owner dependency was resolved; Ferocity resumed the goal.',updated_at=now()
         where tenant_id=$1 and platform_key='ferocity' and external_event_id=$2
           and status='needs_owner'`,
        [tenantId, `operating-goal:${row.id}:needs-owner`],
      );
    }
  }
  return { checked: rows.length, updated, ownerEscalations, replansRequested };
}
