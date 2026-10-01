import { FerocityOwnerChat } from "./FerocityOwnerChat";
import { getAttentionCommandDashboard } from "@/lib/attention-command/get-attention-command-dashboard";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { getApprovalQueueRows } from "@/lib/queues/get-queue-data";
import { getAutomationTimelineDashboard } from "@/lib/automation-timeline/get-automation-timeline";
import type { CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";

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
  const [brandResult, attention, session, actor, workspace, threadResult, approvals, timeline, setupResult] = await Promise.all([
    queryPostgres<{ industry: string | null }>(
      `select industry from public.brands where tenant_id = $1 order by created_at asc limit 1`,
      [workspaceId]
    ),
    getAttentionCommandDashboard(),
    getCurrentAppSession(),
    getCurrentActor(),
    getCurrentWorkspace(),
    queryPostgres<{ id: string; title: string; updated_at: string }>(
      `select id, title, updated_at from public.ferocity_chat_threads
       where tenant_id = $1 and status = 'active' order by updated_at desc limit 20`,
      [workspaceId]
    ),
    getApprovalQueueRows([]),
    getAutomationTimelineDashboard(),
    queryPostgres<{ connected_integrations: string; tenant_name: string; onboarding_status: string; brand_name: string | null; industry: string | null }>(
      `select t.name as tenant_name, t.onboarding_status,
        (select name from public.brands where tenant_id = t.id order by created_at asc limit 1) as brand_name,
        (select industry from public.brands where tenant_id = t.id order by created_at asc limit 1) as industry,
        (select count(*)::text from public.integration_connections where tenant_id = t.id and (status = 'connected' or credentials_status = 'configured')) as connected_integrations
       from public.tenants t where t.id = $1 limit 1`,
      [workspaceId]
    )
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
         order by created_at asc limit 100`,
        [workspaceId, activeThreadId]
      )
    : null;
  const messages = messageResult?.rows ?? [];
  const initialTurns = messages.reduce<Array<{
    id: string; command: string; message: string; prepared: string[]; blocked: string[];
    href?: string; runId?: string; needsInput?: boolean; uploaded?: { name: string; status: string }[]; recommended?: CapabilityRecommendation[];
  }>>((items, message, index) => {
    if (message.role !== "owner") return items;
    const answer = messages.slice(index + 1).find((candidate) => candidate.role === "ferocity");
    const detail = answer?.detail_json ?? {};
    items.push({
      id: answer?.id ?? message.id,
      command: message.body,
      message: answer?.body ?? "Ferocity is still working on this request.",
      prepared: Array.isArray(detail.prepared) ? detail.prepared.map(String) : [],
      blocked: Array.isArray(detail.blocked) ? detail.blocked.map(String) : [],
      href: typeof detail.href === "string" ? detail.href : undefined,
      runId: typeof detail.runId === "string" ? detail.runId : answer?.command_run_id ?? undefined,
      needsInput: answer?.status === "needs_input",
      uploaded: Array.isArray(detail.uploaded) ? detail.uploaded as { name: string; status: string }[] : [],
      recommended: Array.isArray(detail.recommended) ? detail.recommended as CapabilityRecommendation[] : []
    });
    return items;
  }, []);
  const setup = setupResult?.rows[0];
  const setupProgress = [
    { label: "Business basics", complete: Boolean(setup?.brand_name && setup?.industry), href: "/app/business-brain" },
    { label: "Connections", complete: Number(setup?.connected_integrations ?? 0) > 0, href: "/app/integrations" },
    { label: "Goals & authority", complete: setup?.onboarding_status === "completed", href: "/app/controls" }
  ];
  const customerSafeAttention = attention.doFirst.filter((item) =>
    actor.platformRole === "super_admin" || !isInternalControl(`${item.title} ${item.detail} ${item.href}`)
  );
  const safeOpportunityFocus = attention.opportunityBrief.focusNow.filter((item) =>
    actor.platformRole === "super_admin" || !isInternalControl(`${item.title} ${item.detail} ${item.evidence} ${item.href}`)
  );
  const safeOpportunityBrief = {
    ...attention.opportunityBrief,
    focusNow: safeOpportunityFocus.slice(0, 4),
    mattersNowCount: Math.min(attention.opportunityBrief.mattersNowCount, safeOpportunityFocus.length),
    ownerDecisionCount: safeOpportunityFocus.filter((item) => item.handling === "owner_decision").length,
    connectionRequiredCount: safeOpportunityFocus.filter((item) => item.handling === "connection_required").length
  };
  const safeActivity = timeline.events.filter((event) =>
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
      onboardingMode={params.onboarding === "1"}
      ownerName={session?.name ?? null}
      threads={threads}
      activeThreadId={activeThreadId}
      initialTurns={initialTurns}
      approvals={approvals.filter((approval) => approval.status === "pending").slice(0, 4)}
      activity={safeActivity.slice(0, 6).map((event) => ({
        id: event.id,
        title: event.title,
        detail: event.body,
        status: event.status,
        occurredAt: event.occurredAt
      }))}
      setupProgress={setupProgress}
      workspaceRole={workspace.role}
      leaderRecommendation={leaderRecommendation}
    />
  );
}

function isInternalControl(value: string) {
  const text = value.toLowerCase();
  return ["automation trust", "safety check", "safety-readiness", "operator alert", "app error", "action queue", "go-live checklist"].some((term) => text.includes(term));
}
