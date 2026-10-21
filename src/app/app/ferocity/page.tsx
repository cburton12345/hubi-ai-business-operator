import { FerocityOwnerChat } from "./FerocityOwnerChat";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { getWorkspaceSettings } from "@/lib/workspace/get-workspace-settings";
import type { CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";
import { getFerocityCustomerRuntime, type FerocityArtifactLink } from "@/lib/ferocity/conversation-runtime";
import { getFerocityChatOverview } from "@/lib/ferocity/get-chat-overview";
import { pairFerocityChatMessages } from "@/lib/ferocity/pair-chat-messages";
import { getCustomerOnboardingState } from "@/lib/onboarding/customer-onboarding";
import { getOwnerChatCapabilities } from "@/lib/ferocity/owner-chat-access";

type SourceEvent = {
  platformName: string;
  title: string;
  summary: string;
  severity: string;
  recommendedAction: string | null;
};

export default async function FerocityChatPage({
  searchParams
}: {
  searchParams: Promise<{ command?: string; source?: string; externalEventId?: string; onboarding?: string; thread?: string }>;
}) {
  const params = await searchParams;
  const actor = await requirePermission("ai:queue");
  const access = getOwnerChatCapabilities(actor);

  let sourceEvent: SourceEvent | null = null;
  if (params.source === "h4r" && params.externalEventId?.startsWith("h4r:leasing-owner-alert:")) {
    const workspaceId = await getCurrentWorkspaceId();
    const result = await queryPostgres<{
      platform_name: string;
      title: string;
      summary: string;
      severity: string;
      recommended_action: string | null;
    }>(
      `
      select platform_name, title, summary, severity, recommended_action
      from public.owner_command_events
      where tenant_id = $1
        and platform_key = 'h4r'
        and external_event_id = $2
      limit 1
      `,
      [workspaceId, params.externalEventId]
    );
    const row = result?.rows[0];
    if (row) {
      sourceEvent = {
        platformName: row.platform_name,
        title: row.title,
        summary: row.summary,
        severity: row.severity,
        recommendedAction: row.recommended_action
      };
    }
  }

  const contextualCommand = sourceEvent
    ? `Review this ${sourceEvent.platformName} alert and advise me on the next step: ${sourceEvent.title}. ${sourceEvent.summary}`.slice(0, 2000)
    : params.command?.slice(0, 2000) ?? "";

  const workspaceId = await getCurrentWorkspaceId();
  const onboardingMode = params.onboarding === "1" && access.canConfigureOnboarding;
  const [brandResult, overview, session, settings, threadResult, approvalResult, activityResult, onboardingState, customerRuntime, goalsResult] = await Promise.all([
    queryPostgres<{ industry: string | null }>(
      `select industry from public.brands where tenant_id = $1 order by created_at asc limit 1`,
      [workspaceId]
    ),
    getFerocityChatOverview(workspaceId),
    getCurrentAppSession(),
    getWorkspaceSettings(),
    queryPostgres<{ id: string; title: string; updated_at: string }>(
      `select id, title, updated_at from public.ferocity_chat_threads
       where tenant_id = $1 and audience = 'owner' and status = 'active'
         and ($2::boolean or created_by_user_id = $3)
       order by updated_at desc limit 20`,
      [workspaceId, access.canConfigureOnboarding, actor.userId]
    ),
    queryPostgres<{ id: string; target_type: string; risk_level: string; notes: string | null; created_at: string }>(
      `select id,target_type,risk_level,notes,created_at from public.approvals
       where tenant_id=$1 and status='pending' order by created_at desc limit 8`,
      [workspaceId],
    ),
    queryPostgres<{ id: string; title: string; body: string | null; status: string; occurred_at: string }>(
      `select id,title,body,
         case
           when lower(title || ' ' || coalesce(body,'')) like any(array['%blocked%','%failed%']) then 'blocked'
           when lower(title || ' ' || coalesce(body,'')) like any(array['%approval%','%review%']) then 'needs_approval'
           when lower(title || ' ' || coalesce(body,'')) like any(array['%prepared%','%draft%','%queued%']) then 'prepared'
           when lower(title || ' ' || coalesce(body,'')) like any(array['%handled%','%resolved%']) then 'handled'
           else 'logged'
         end as status,
         occurred_at
       from public.operator_timeline_events where tenant_id=$1 order by occurred_at desc limit 6`,
      [workspaceId],
    ),
    onboardingMode ? getCustomerOnboardingState(workspaceId) : Promise.resolve(null),
    getFerocityCustomerRuntime(workspaceId),
    queryPostgres<{
      id: string; title: string; status: string; priority: string; authority_mode: string;
      last_evaluation_summary: string | null; next_evaluation_at: string;
      outcome_verified: boolean;
      active_goal_count: string;
      steps_total: string; steps_completed: string; steps_active: string; steps_needs_owner: string;
      current_step_title: string | null; current_step_href: string | null;
    }>(
      `select goal.id,goal.title,goal.status,goal.priority,goal.authority_mode,
         goal.last_evaluation_summary,goal.next_evaluation_at,
         coalesce((goal.current_state_json->>'outcomeVerified')::boolean,false) as outcome_verified,
         count(*) over()::text as active_goal_count,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version) as steps_total,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status='completed') as steps_completed,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status in ('planned','ready','in_progress','waiting','blocked')) as steps_active,
         (select count(*)::text from public.operating_goal_steps step
           where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
             and step.status='needs_owner') as steps_needs_owner,
         current_step.title as current_step_title,current_step.href as current_step_href
         from public.operating_goals goal
         left join lateral (
           select step.title,step.href from public.operating_goal_steps step
            where step.tenant_id=goal.tenant_id and step.goal_id=goal.id and step.plan_version=goal.plan_version
              and step.status not in ('completed','canceled')
            order by step.sequence_number limit 1
         ) current_step on true
        where goal.tenant_id=$1 and goal.status in ('active','progressing','waiting','blocked','needs_owner','paused')
        order by case goal.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
                 goal.next_evaluation_at asc
        limit 8`,
      [workspaceId],
    ),
  ]);

  const threads = threadResult?.rows ?? [];
  const requestedThread = params.thread && threads.some((thread) => thread.id === params.thread) ? params.thread : null;
  const activeThreadId = requestedThread ?? threads[0]?.id ?? null;
  const messageResult = activeThreadId
    ? await queryPostgres<{
        id: string; role: "owner" | "ferocity" | "system"; body: string; status: string;
        command_run_id: string | null; detail_json: Record<string, unknown>; created_at: string;
      }>(
        `select id, role, body, status, command_run_id, detail_json, created_at
         from public.ferocity_chat_messages where tenant_id = $1 and thread_id = $2
         order by created_at asc,
           case role when 'owner' then 0 when 'ferocity' then 1 else 2 end asc,
           id asc limit 100`,
        [workspaceId, activeThreadId]
      )
    : null;
  const messages = messageResult?.rows ?? [];
  const initialTurns = pairFerocityChatMessages(messages).map<{
    id: string; command: string; message: string; prepared: string[]; blocked: string[];
    href?: string; actionLabel?: string; runId?: string; intent?: string; needsInput?: boolean; uploaded?: { name: string; status: string }[]; recommended?: CapabilityRecommendation[]; artifacts?: FerocityArtifactLink[];
  }>(({ owner: message, answer }) => {
    const detail = answer?.detail_json ?? {};
    const persistedBlocked = Array.isArray(detail.blocked) ? detail.blocked.map(String) : [];
    return {
      id: answer?.id ?? message.id,
      command: message.body,
      message: answer?.body ?? "This request did not finish, and Ferocity is not still working on it. Send it again to retry.",
      prepared: Array.isArray(detail.prepared) ? detail.prepared.map(String) : [],
      blocked: answer ? persistedBlocked : ["The prior request has no completed result."],
      href: typeof detail.href === "string" ? detail.href : undefined,
      actionLabel: typeof detail.actionLabel === "string" ? detail.actionLabel : undefined,
      runId: typeof detail.runId === "string" ? detail.runId : answer?.command_run_id ?? undefined,
      intent: typeof detail.intent === "string" ? detail.intent : undefined,
      needsInput: answer?.status === "needs_input",
      uploaded: Array.isArray(detail.uploaded) ? detail.uploaded as { name: string; status: string }[] : [],
      recommended: Array.isArray(detail.recommended) ? detail.recommended as CapabilityRecommendation[] : [],
      artifacts: Array.isArray(detail.artifacts) ? detail.artifacts as FerocityArtifactLink[] : [],
    };
  });
  const setupProgress = onboardingState?.steps ?? [];
  const customerSafeAttention = overview.attentionItems.filter((item) =>
    actor.platformRole === "super_admin" || !isInternalControl(`${item.title} ${item.detail} ${item.href}`)
  );
  const safeOpportunityFocus = overview.opportunityBrief.focusNow.filter((item) =>
    actor.platformRole === "super_admin" || !isInternalControl(`${item.title} ${item.detail} ${item.evidence} ${item.href}`)
  );
  const safeOpportunityBrief = {
    ...overview.opportunityBrief,
    focusNow: safeOpportunityFocus.slice(0, 4),
    mattersNowCount: Math.min(overview.opportunityBrief.mattersNowCount, safeOpportunityFocus.length),
    ownerDecisionCount: safeOpportunityFocus.filter((item) => item.handling === "owner_decision").length,
    connectionRequiredCount: safeOpportunityFocus.filter((item) => item.handling === "connection_required").length
  };
  const safeActivity = (activityResult?.rows ?? []).filter((event) =>
    actor.platformRole === "super_admin" || !isInternalControl(`${event.title} ${event.body ?? ""}`)
  );
  const topOpportunity = safeOpportunityFocus[0] ?? customerSafeAttention[0] ?? null;
  const leaderRecommendation = topOpportunity ? {
    title: topOpportunity.title,
    detail: topOpportunity.detail,
    href: topOpportunity.href,
    command: `Take the lead on this priority: ${topOpportunity.title}. ${topOpportunity.detail} Inspect the evidence, safely handle every authorized internal step now, prepare anything consequential for approval, and tell me the result and only the decision you truly need from me.`
  } : {
    title: "The business is stable enough for a proactive scan",
    detail: "I do not see an urgent exception at the top of the current workspace. Ferocity can inspect growth, customer follow-up, jobs, cash, connections, and operations for the strongest next move.",
    href: "/app/attention-command",
    command: "Lead the next business cycle. Inspect every connected area, choose the single highest-value bottleneck or opportunity, handle every safe authorized step, prepare approvals where required, and bring me only the result and decisions that truly need me."
  };

  return (
    <FerocityOwnerChat
      initialCommand={contextualCommand}
      sourceEvent={sourceEvent}
      industry={brandResult?.rows[0]?.industry ?? null}
      attentionItems={customerSafeAttention.slice(0, 5)}
      opportunityBrief={safeOpportunityBrief}
      onboardingMode={onboardingMode}
      ownerName={session?.name ?? null}
      threads={threads}
      activeThreadId={activeThreadId}
      initialTurns={initialTurns}
      approvals={(approvalResult?.rows ?? []).filter((approval) => access.canReviewApproval(approval.risk_level)).slice(0, 4).map((approval) => ({
        id: approval.id,
        targetType: approval.target_type,
        riskLevel: approval.risk_level,
        notes: approval.notes ?? "",
        createdAt: approval.created_at,
      }))}
      activity={safeActivity.slice(0, 6).map((event) => ({
        id: event.id,
        title: event.title,
        detail: event.body,
        status: event.status,
        occurredAt: event.occurred_at
      }))}
      setupProgress={setupProgress}
      workspaceRole={actor.tenantRole ?? "viewer"}
      canControlGoals={access.canControlGoals}
      customerMode={customerRuntime.mode}
      workspaceTimeZone={settings.timezone}
      leaderRecommendation={leaderRecommendation}
      operatingGoalTotal={Number(goalsResult?.rows[0]?.active_goal_count ?? 0)}
      operatingGoals={(goalsResult?.rows ?? []).map((goal) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status,
        priority: goal.priority,
        authorityMode: goal.authority_mode,
        summary: goal.last_evaluation_summary,
        nextEvaluationAt: goal.next_evaluation_at,
        outcomeVerified: goal.outcome_verified,
        stepsTotal: Number(goal.steps_total ?? 0),
        stepsCompleted: Number(goal.steps_completed ?? 0),
        stepsActive: Number(goal.steps_active ?? 0),
        stepsNeedOwner: Number(goal.steps_needs_owner ?? 0),
        currentStepTitle: goal.current_step_title,
        currentStepHref: goal.current_step_href,
      }))}
    />
  );
}

function isInternalControl(value: string) {
  const text = value.toLowerCase();
  return ["automation trust", "safety check", "safety-readiness", "operator alert", "app error", "action queue", "go-live checklist"].some((term) => text.includes(term));
}
