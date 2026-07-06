import { queryPostgres } from "@/lib/db/postgres";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { getOwnerNeeds, type OwnerNeed } from "@/lib/owner-command-center/get-owner-needs";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

export type OwnerCommandEvent = {
  id: string;
  platformKey: string;
  platformName: string;
  eventType: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  ownerAttention: boolean;
  aiHandled: boolean;
  aiSummary: string | null;
  recommendedAction: string | null;
  actionHref: string;
  moneyCents: number;
  riskType: string | null;
  confidenceScore: number;
  occurredAt: string;
};

export type OwnerCommandCenter = {
  workspaceName: string;
  briefing: string;
  metrics: {
    needsOwner: number;
    critical: number;
    aiHandled: number;
    openMoneyCents: number;
    activeAlerts: number;
    openPipelineCents: number;
    collectedRevenueCents: number;
  };
  events: OwnerCommandEvent[];
  ownerRequests: OwnerNeed[];
  needsOwner: OwnerCommandEvent[];
  criticalIssues: OwnerCommandEvent[];
  aiActions: OwnerCommandEvent[];
  moneyRadar: OwnerCommandEvent[];
  makeMoneyNext: {
    title: string;
    detail: string;
    href: string;
    valueCents: number;
  }[];
  platformFilters: string[];
};

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function mapEvent(row: {
  id: string;
  platform_key: string;
  platform_name: string;
  event_type: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  owner_attention: boolean;
  ai_handled: boolean;
  ai_summary: string | null;
  recommended_action: string | null;
  action_href: string | null;
  money_cents: number;
  risk_type: string | null;
  confidence_score: number;
  occurred_at: Date;
}): OwnerCommandEvent {
  return {
    id: row.id,
    platformKey: row.platform_key,
    platformName: row.platform_name,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    ownerAttention: row.owner_attention,
    aiHandled: row.ai_handled,
    aiSummary: row.ai_summary,
    recommendedAction: row.recommended_action,
    actionHref: row.action_href ?? "/app",
    moneyCents: Number(row.money_cents ?? 0),
    riskType: row.risk_type,
    confidenceScore: Number(row.confidence_score ?? 0),
    occurredAt: row.occurred_at.toISOString()
  };
}

function buildBriefing(input: {
  needsOwner: number;
  critical: number;
  openMoneyCents: number;
  aiHandled: number;
  activeAlerts: number;
  openPipelineCents: number;
}) {
  const pieces = [
    input.critical ? `${input.critical} critical issue${input.critical === 1 ? "" : "s"}` : "no critical issues",
    input.needsOwner ? `${input.needsOwner} item${input.needsOwner === 1 ? "" : "s"} need owner attention` : "nothing urgent needs owner attention",
    input.openMoneyCents ? `${dollars(input.openMoneyCents)} in visible money opportunities or risk` : "no money amount is attached yet",
    input.aiHandled ? `AI handled ${input.aiHandled} item${input.aiHandled === 1 ? "" : "s"}` : "AI has not marked anything handled yet",
    input.activeAlerts ? `${input.activeAlerts} workspace alert${input.activeAlerts === 1 ? "" : "s"} remain active` : "workspace alerts are quiet",
    `${dollars(input.openPipelineCents)} open pipeline`
  ];

  return pieces.join(". ") + ".";
}

export async function getOwnerCommandCenter(): Promise<OwnerCommandCenter> {
  const workspace = await getCurrentWorkspace();
  const [snapshot, report, ownerRequests, eventsResult, platformResult] = await Promise.all([
    getDashboardSnapshot(),
    getReportingDashboard(),
    getOwnerNeeds(),
    queryPostgres<{
      id: string;
      platform_key: string;
      platform_name: string;
      event_type: string;
      title: string;
      summary: string;
      severity: string;
      status: string;
      owner_attention: boolean;
      ai_handled: boolean;
      ai_summary: string | null;
      recommended_action: string | null;
      action_href: string | null;
      money_cents: number;
      risk_type: string | null;
      confidence_score: number;
      occurred_at: Date;
    }>(
      `
      select id, platform_key, platform_name, event_type, title, summary, severity, status,
        owner_attention, ai_handled, ai_summary, recommended_action, action_href,
        money_cents, risk_type, confidence_score, occurred_at
      from public.owner_command_events
      where tenant_id = $1 or tenant_id is null
      order by
        case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
        owner_attention desc,
        occurred_at desc
      limit 60
      `,
      [workspace.id]
    ),
    queryPostgres<{ platform_name: string }>(
      `
      select distinct platform_name
      from public.owner_command_events
      where tenant_id = $1 or tenant_id is null
      order by platform_name
      `,
      [workspace.id]
    )
  ]);

  const events = (eventsResult?.rows ?? []).map(mapEvent);
  const needsOwner = events.filter((event) => event.ownerAttention || event.status === "needs_owner").slice(0, 12);
  const criticalIssues = events.filter((event) => event.severity === "critical" || event.status === "critical").slice(0, 8);
  const aiActions = events.filter((event) => event.aiHandled || event.status === "ai_handled").slice(0, 12);
  const moneyRadar = events.filter((event) => event.moneyCents > 0 || event.riskType === "revenue" || event.riskType === "financial").slice(0, 12);
  const openMoneyCents = moneyRadar.reduce((sum, event) => sum + event.moneyCents, 0);

  const makeMoneyNext = [
    ...moneyRadar.slice(0, 3).map((event) => ({
      title: event.title,
      detail: event.recommendedAction ?? event.summary,
      href: event.actionHref,
      valueCents: event.moneyCents
    })),
    ...snapshot.todayPlan
      .filter((item) => item.urgency !== "low")
      .slice(0, 2)
      .map((item) => ({
        title: item.title,
        detail: item.detail,
        href: item.href,
        valueCents: 0
      }))
  ].slice(0, 5);

  const metrics = {
    needsOwner: needsOwner.length + ownerRequests.length,
    critical: criticalIssues.length,
    aiHandled: aiActions.length,
    openMoneyCents,
    activeAlerts: report.activeAlerts,
    openPipelineCents: report.leadToRevenue.openPipelineCents,
    collectedRevenueCents: report.leadToRevenue.collectedRevenueCents
  };

  return {
    workspaceName: workspace.name,
    briefing: buildBriefing(metrics),
    metrics,
    events,
    ownerRequests,
    needsOwner,
    criticalIssues,
    aiActions,
    moneyRadar,
    makeMoneyNext,
    platformFilters: (platformResult?.rows ?? []).map((row) => row.platform_name)
  };
}
