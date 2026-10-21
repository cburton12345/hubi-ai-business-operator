import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { queryPostgres } from "@/lib/db/postgres";
import { materializeOperatingGoalPlanSteps } from "@/lib/operations/goal-step-runner";

const ALLOWED_PLAN_ACTIONS = new Set([
  "inspect_domain_state",
  "assign_work",
  "prepare_communication",
  "await_event",
  "request_information",
  "verify_outcome",
]);

export type GoalPlanStep = {
  key: string;
  action: string;
  title: string;
  why: string;
  dependencyKeys: string[];
  ownerRequired: boolean;
  completionEvidence: string;
};

type GoalPlanResponse = {
  reasoningStatus: "proposed" | "unavailable";
  summary: string;
  assumptions: string[];
  steps: GoalPlanStep[];
};

function text(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export function normalizeGoalPlan(value: unknown, desiredOutcome?: string): GoalPlanResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { reasoningStatus: "unavailable", summary: "No valid plan was returned.", assumptions: [], steps: [] };
  }
  const raw = value as Record<string, unknown>;
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((step, index): GoalPlanStep | null => {
          if (!step || typeof step !== "object" || Array.isArray(step)) return null;
          const item = step as Record<string, unknown>;
          const action = text(item.action, 80);
          const title = text(item.title, 240);
          const completionEvidence = text(item.completionEvidence, 500);
          if (!ALLOWED_PLAN_ACTIONS.has(action) || !title || !completionEvidence) return null;
          return {
            key: text(item.key, 120) || `step-${index + 1}`,
            action,
            title,
            why: text(item.why, 500),
            dependencyKeys: Array.isArray(item.dependencyKeys)
              ? item.dependencyKeys.map((key) => text(key, 120)).filter(Boolean).slice(0, 20)
              : [],
            ownerRequired: item.ownerRequired === true,
            completionEvidence,
          };
        })
        .filter((step): step is GoalPlanStep => step !== null)
        .slice(0, 12)
    : [];
  const proposed = raw.reasoningStatus === "proposed" && steps.length > 0;
  if (proposed) {
    const suppliedVerification = steps.find((step) => step.action === "verify_outcome");
    const actionSteps = steps.filter((step) => step.action !== "verify_outcome");
    const verification = suppliedVerification ?? (desiredOutcome ? {
      key: "verify-outcome",
      action: "verify_outcome",
      title: "Verify the requested business outcome",
      why: "Completing planned actions is not proof that the requested business result occurred.",
      dependencyKeys: [],
      ownerRequired: false,
      completionEvidence: text(desiredOutcome, 500) || "Authoritative evidence that the requested outcome occurred",
    } : null);
    steps.splice(0, steps.length, ...actionSteps.slice(0, verification ? 11 : 12), ...(verification ? [verification] : []));
  }
  return {
    reasoningStatus: proposed ? "proposed" : "unavailable",
    summary: text(raw.summary, 1_000) || (proposed ? "A bounded goal plan was proposed." : "Planning is unavailable."),
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions.map((assumption) => text(assumption, 300)).filter(Boolean).slice(0, 20)
      : [],
    steps,
  };
}

type GoalPlanningRow = {
  id: string;
  brand_id: string | null;
  goal_key: string;
  goal_type: string;
  title: string;
  desired_outcome: string;
  status: string;
  priority: string;
  authority_mode: string;
  domain_system: string;
  target_at: Date | null;
  evaluation_version: number;
  current_state_json: Record<string, unknown> | null;
  constraints_json: Record<string, unknown> | null;
  blind_spots_json: unknown[] | null;
  dependencies_json: unknown[] | null;
};

function boundedPlanningConcurrency(value?: number) {
  const configured = Number(value ?? process.env.AUTOMATION_GOAL_PLANNING_CONCURRENCY ?? 2);
  return Number.isFinite(configured) ? Math.max(1, Math.min(Math.floor(configured), 3)) : 2;
}

export async function planDueOperatingGoalsForTenant(
  tenantId: string,
  limit = 8,
  concurrency?: number,
) {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 25)) : 8;
  const goals = await queryPostgres<GoalPlanningRow>(
    `select goal.id,goal.brand_id,goal.goal_key,goal.goal_type,goal.title,goal.desired_outcome,
       goal.status,goal.priority,goal.authority_mode,goal.domain_system,goal.target_at,
       goal.evaluation_version,goal.current_state_json,goal.constraints_json,goal.blind_spots_json,
       coalesce((select jsonb_agg(jsonb_build_object(
         'key',dependency.dependency_key,'type',dependency.dependency_type,'title',dependency.title,
         'status',dependency.status,'required',dependency.required,
         'ownerActionRequired',dependency.owner_action_required,'expectedBy',dependency.expected_by
       ) order by dependency.created_at)
       from public.operating_goal_dependencies dependency
       where dependency.tenant_id=goal.tenant_id and dependency.goal_id=goal.id),'[]'::jsonb) as dependencies_json
     from public.operating_goals goal
     where goal.tenant_id=$1
       and goal.status in ('active','progressing','waiting','blocked')
       and goal.current_state_json->>'requiresReplan'='true'
       and goal.plan_version < goal.evaluation_version
       and (
         goal.current_state_json->>'lastReasoningAttemptAt' is null
         or (goal.current_state_json->>'lastReasoningAttemptAt')::timestamptz <= now() - interval '6 hours'
       )
     order by case goal.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
       (goal.current_state_json->>'lastReasoningAttemptAt')::timestamptz nulls first,
       goal.target_at nulls last,goal.updated_at
     limit $2`,
    [tenantId, boundedLimit],
  );
  const rows = goals?.rows ?? [];
  let nextGoalIndex = 0;
  const outcomes: Array<"proposed" | "unavailable" | "failed" | "stale"> = [];
  const planGoal = async (goal: GoalPlanningRow) => {
    const fallback: GoalPlanResponse = {
      reasoningStatus: "unavailable",
      summary: "AI planning was unavailable; deterministic goal monitoring remains active and no action was executed.",
      assumptions: [],
      steps: [],
    };
    try {
      const rawPlan = await generateJsonWithAiService<GoalPlanResponse & Record<string, unknown>>({
        tenantId,
        brandId: goal.brand_id,
        featureKey: "ai_generation",
        runType: "persistent_goal_replan",
        temperature: 0.2,
        timeoutMs: 30_000,
        system: `You are Ferocity's bounded operating-goal planner. Propose a short plan from the supplied authoritative state. Return JSON only. Never claim an action happened. Never choose tenants, make legal judgments, move money, spend, publish, send, or bypass consent/approval. Use only these action values: inspect_domain_state, assign_work, prepare_communication, await_event, request_information, verify_outcome. Physical work must use assign_work. Consequential decisions must set ownerRequired true. A completed action is not the same as a completed outcome; every step needs explicit completionEvidence. End every proposed plan with verify_outcome tied to observable evidence from the authoritative system or an explicit owner attestation when no authoritative record exists. Do not ask for facts already present.`,
        user: JSON.stringify({
          goal: {
            key: goal.goal_key,
            type: goal.goal_type,
            title: goal.title,
            desiredOutcome: goal.desired_outcome,
            status: goal.status,
            priority: goal.priority,
            authorityMode: goal.authority_mode,
            domainSystem: goal.domain_system,
            targetAt: goal.target_at,
          },
          authoritativeState: goal.current_state_json ?? {},
          dependencies: goal.dependencies_json ?? [],
          blindSpots: goal.blind_spots_json ?? [],
          constraints: goal.constraints_json ?? {},
          outputContract: {
            reasoningStatus: "proposed",
            summary: "string",
            assumptions: ["string"],
            steps: [{
              key: "stable-string",
              action: "allowed action value",
              title: "concrete next step",
              why: "reason",
              dependencyKeys: ["existing dependency key"],
              ownerRequired: false,
              completionEvidence: "observable evidence",
            }],
          },
        }),
        fallback: fallback as GoalPlanResponse & Record<string, unknown>,
        metadata: { goalId: goal.id, evaluationVersion: goal.evaluation_version, domainSystem: goal.domain_system },
      });
      const plan = normalizeGoalPlan(rawPlan, goal.desired_outcome);
      const attemptedAt = new Date().toISOString();
      if (plan.reasoningStatus === "proposed") {
        const result = await queryPostgres<{ id: string }>(
          `with updated as (
             update public.operating_goals set plan_json=$3::jsonb,plan_version=evaluation_version,
               current_state_json=current_state_json || $4::jsonb,updated_at=now()
             where tenant_id=$1 and id=$2 and evaluation_version=$5 and plan_version < evaluation_version
             returning id
           )
           insert into public.operating_goal_events
             (tenant_id,goal_id,event_type,event_key,source_system,material_change,evidence_json)
           select $1,$2,'plan_proposed',$6,'ferocity',false,$7::jsonb from updated
           on conflict (tenant_id,goal_id,event_key) where event_key is not null do nothing
           returning id`,
          [
            tenantId,
            goal.id,
            JSON.stringify(plan),
            JSON.stringify({ requiresReplan: false, lastReasoningAttemptAt: attemptedAt, lastReasoningStatus: "proposed" }),
            goal.evaluation_version,
            `plan:${goal.evaluation_version}`,
            JSON.stringify({ summary: plan.summary, assumptions: plan.assumptions, stepCount: plan.steps.length }),
          ],
        );
        if (!result?.rows[0]) return "stale" as const;
        await materializeOperatingGoalPlanSteps({
          tenantId,
          goalId: goal.id,
          planVersion: goal.evaluation_version,
          steps: plan.steps,
        });
        return "proposed" as const;
      }
      await queryPostgres(
        `update public.operating_goals set
           current_state_json=current_state_json || $3::jsonb,
           next_evaluation_at=greatest(next_evaluation_at,now() + interval '6 hours'),updated_at=now()
         where tenant_id=$1 and id=$2 and evaluation_version=$4`,
        [
          tenantId,
          goal.id,
          JSON.stringify({ lastReasoningAttemptAt: attemptedAt, lastReasoningStatus: "unavailable" }),
          goal.evaluation_version,
        ],
      );
      return "unavailable" as const;
    } catch (error) {
      const safeError = error instanceof Error ? error.message.slice(0, 500) : "Goal planning failed safely.";
      await queryPostgres(
        `update public.operating_goals set last_safe_error=$3,
           current_state_json=current_state_json || jsonb_build_object(
             'lastReasoningAttemptAt',now(),'lastReasoningStatus','failed'
           ),next_evaluation_at=greatest(next_evaluation_at,now()+interval '1 hour'),updated_at=now()
         where tenant_id=$1 and id=$2 and evaluation_version=$4`,
        [tenantId, goal.id, safeError, goal.evaluation_version],
      );
      return "failed" as const;
    }
  };
  const worker = async () => {
    while (nextGoalIndex < rows.length) {
      const goal = rows[nextGoalIndex++];
      if (goal) outcomes.push(await planGoal(goal));
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(boundedPlanningConcurrency(concurrency), Math.max(rows.length, 1)) },
    () => worker(),
  ));
  return {
    checked: rows.length,
    proposed: outcomes.filter((outcome) => outcome === "proposed").length,
    unavailable: outcomes.filter((outcome) => outcome === "unavailable").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    stale: outcomes.filter((outcome) => outcome === "stale").length,
  };
}
