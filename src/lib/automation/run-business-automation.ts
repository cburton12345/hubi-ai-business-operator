import { runDueAgentWorkflows } from "@/lib/ai-workforce/agent-workflows";
import { ensureDefaultMonitorSetup } from "@/lib/ai-monitoring/get-ai-monitoring-center";
import { syncLinkAuthorityForTenant, type LinkAuthoritySyncResult } from "@/lib/authority/sync-link-authority";
import { scanActionQueueForTenant, type ActionQueueScanResult } from "@/lib/actions-queue/scan-action-queue";
import { processReadyMessagesForTenant, type ReadyMessageProcessingResult } from "@/lib/actions-queue/process-ready-messages";
import { getServiceGate } from "@/lib/controls/service-gates";
import { syncConstructionHealthForTenant } from "@/lib/construction/job-health";
import { queryPostgres } from "@/lib/db/postgres";
import { runRevenueLoopAutomationForTenant, type RevenueLoopAutomationResult } from "@/lib/revenue-growth/revenue-loop-automation";
import { syncMaturedUsageChargesForTenant, type MaturedUsageSyncResult } from "@/lib/billing/sync-matured-usage-charges";
import { processAdapterFactoryQueueForTenant } from "@/lib/integrations/adapter-factory";

export type BusinessAutomationRunResult = {
  ok: true;
  tenantsChecked: number;
  actionQueueScans: ActionQueueScanResult[];
  revenueLoops: Array<{ tenantId: string } & RevenueLoopAutomationResult>;
  constructionHealth: Array<{ tenantId: string; jobsChecked: number; highRiskJobs: number; fieldLogsToReview: number }>;
  linkAuthority: Array<{ tenantId: string } & LinkAuthoritySyncResult>;
  readyMessages: Array<{ tenantId: string } & ReadyMessageProcessingResult>;
  usageBilling: Array<{ tenantId: string } & MaturedUsageSyncResult>;
  adapterFactory: Array<{ tenantId: string } & Awaited<ReturnType<typeof processAdapterFactoryQueueForTenant>>>;
  dailyBriefs: Array<{ tenantId: string; status: "ready" | "blocked"; reason?: string }>;
  aiWorkforce: Awaited<ReturnType<typeof runDueAgentWorkflows>>;
  elapsedMs: number;
};

async function getAutomationTenantIds(limit: number) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.tenants
    where status in ('active', 'trial')
    order by created_at asc
    limit $1
    `,
    [limit]
  );
  return result?.rows.map((row) => row.id) ?? [];
}

async function generateTenantDailyBrief(tenantId: string) {
  const gate = await getServiceGate(tenantId, "ai_monitoring_briefing");
  if (!gate.enabled) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
      values ($1, 'system', 'service_control_blocked', 'Daily owner brief blocked', $2, $3::jsonb)
      `,
      [
        tenantId,
        gate.reason,
        JSON.stringify({
          featureKey: gate.featureKey,
          planKey: gate.planKey,
          minimumPlanKey: gate.minimumPlanKey,
          currentUsage: gate.currentUsage,
          usageLimit: gate.usageLimit
        })
      ]
    );
    return { tenantId, status: "blocked" as const, reason: gate.reason };
  }

  const stats = await queryPostgres<{
    open_leads: string;
    stale_followups: string;
    unpaid_invoices: string;
    action_review: string;
    action_failed: string;
    owner_attention: string;
    ai_handled: string;
    critical: string;
  }>(
    `
    select
      (select count(*) from public.leads where tenant_id = $1 and status in ('new','qualified'))::text as open_leads,
      (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled','missed'))::text as stale_followups,
      (select count(*) from public.service_invoices where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue'))::text as unpaid_invoices,
      (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('needs_review','approved','queued'))::text as action_review,
      (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('failed','blocked'))::text as action_failed,
      (select count(*) from public.owner_command_events where tenant_id = $1 and (owner_attention = true or status = 'needs_owner'))::text as owner_attention,
      (select count(*) from public.owner_command_events where tenant_id = $1 and ai_handled = true and occurred_at >= now() - interval '1 day')::text as ai_handled,
      (select count(*) from public.owner_command_events where tenant_id = $1 and severity = 'critical' and status not in ('resolved','ai_handled'))::text as critical
    `,
    [tenantId]
  );

  const row = stats?.rows[0];
  const openLeads = Number(row?.open_leads ?? 0);
  const staleFollowups = Number(row?.stale_followups ?? 0);
  const unpaidInvoices = Number(row?.unpaid_invoices ?? 0);
  const actionReview = Number(row?.action_review ?? 0);
  const actionFailed = Number(row?.action_failed ?? 0);
  const ownerAttention = Number(row?.owner_attention ?? 0);
  const aiHandled = Number(row?.ai_handled ?? 0);
  const critical = Number(row?.critical ?? 0);
  const priority = critical > 0 ? "critical" : ownerAttention + actionFailed > 0 ? "high" : staleFollowups + unpaidInvoices + actionReview > 0 ? "medium" : "low";

  const ownerItems = [
    critical > 0 ? { title: "Critical issue needs a decision", detail: `${critical} critical item(s) are open.`, href: "/app/owner-command-center", priority: "critical" } : null,
    ownerAttention > 0 ? { title: "Owner input needed", detail: `${ownerAttention} item(s) need a decision or approval.`, href: "/app/owner-command-center", priority: "high" } : null,
    actionFailed > 0 ? { title: "Automation failed or blocked", detail: `${actionFailed} action(s) need retry, provider setup, consent, or tier review.`, href: "/app/actions", priority: "high" } : null,
    actionReview > 0 ? { title: "Actions need review", detail: `${actionReview} email, manual text, publishing, review, calendar, or billing action(s) are waiting.`, href: "/app/actions", priority: "medium" } : null,
    unpaidInvoices > 0 ? { title: "Money needs collection", detail: `${unpaidInvoices} invoice(s) are still unpaid or overdue.`, href: "/app/cash-collection", priority: "medium" } : null,
    staleFollowups > 0 ? { title: "Follow-up can recover money", detail: `${staleFollowups} follow-up workflow(s) are open, scheduled, or missed.`, href: "/app/lead-command", priority: "medium" } : null
  ].filter(Boolean);

  const today = [
    `${openLeads} open lead(s) are visible.`,
    `${staleFollowups} follow-up item(s) are open or due.`,
    `${unpaidInvoices} invoice(s) are unpaid or overdue.`,
    `${actionReview} queued action(s) need review.`,
    `${actionFailed} action(s) are failed or blocked.`
  ];

  const summary = [
    `Ferocity checked leads, follow-ups, invoices, queued actions, failed automations, and owner events.`,
    ownerAttention > 0 ? `${ownerAttention} item(s) need owner attention.` : "No owner decision backlog was found.",
    `${aiHandled} item(s) were marked AI-handled in the last day.`
  ].join(" ");

  await queryPostgres(
    `
    insert into public.owner_daily_briefings (
      tenant_id, brief_date, status, priority, title, summary,
      yesterday_json, today_json, owner_attention_json, ai_handled_json, sections_json, metadata_json, generated_at
    )
    values ($1, current_date, 'ready', $2, 'Daily owner brief', $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, now())
    on conflict (tenant_id, brief_date)
    do update set
      status = 'ready',
      priority = excluded.priority,
      title = excluded.title,
      summary = excluded.summary,
      yesterday_json = excluded.yesterday_json,
      today_json = excluded.today_json,
      owner_attention_json = excluded.owner_attention_json,
      ai_handled_json = excluded.ai_handled_json,
      sections_json = excluded.sections_json,
      metadata_json = public.owner_daily_briefings.metadata_json || excluded.metadata_json,
      generated_at = now(),
      updated_at = now()
    `,
    [
      tenantId,
      priority,
      summary,
      JSON.stringify([`${aiHandled} item(s) were handled by AI or automation in the last day.`]),
      JSON.stringify(today),
      JSON.stringify(ownerItems),
      JSON.stringify([{ title: "AI handled work", detail: `${aiHandled} item(s) recorded as handled.`, href: "/app/owner-command-center", priority: "low" }]),
      JSON.stringify({
        leads: openLeads,
        followUps: staleFollowups,
        invoices: unpaidInvoices,
        actionReview,
        actionFailed,
        ownerAttention,
        aiHandled,
        critical
      }),
      JSON.stringify({ generatedBy: "production_business_automation_runner", gateMode: gate.mode })
    ]
  );

  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href, risk_type, confidence_score, metadata_json
    )
    values ($1, 'ferocity', 'Ferocity', $2, 'daily_brief.generated', 'Daily owner brief generated', $3, $4, 'ai_handled', false, true, $3, 'Open the Owner Command Center.', '/app/owner-command-center', 'approval', 91, $5::jsonb)
    on conflict (tenant_id, platform_key, external_event_id)
    do update set
      summary = excluded.summary,
      severity = excluded.severity,
      status = excluded.status,
      ai_handled = true,
      ai_summary = excluded.ai_summary,
      occurred_at = now(),
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json
    `,
    [
      tenantId,
      `daily-brief:${new Date().toISOString().slice(0, 10)}`,
      summary,
      priority === "critical" ? "critical" : priority === "high" ? "high" : "medium",
      JSON.stringify({ generatedBy: "production_business_automation_runner" })
    ]
  );

  return { tenantId, status: "ready" as const };
}

export async function runBusinessAutomationLoop(input: { tenantLimit?: number; agentLimit?: number; tenantId?: string | null } = {}): Promise<BusinessAutomationRunResult> {
  const startedAt = Date.now();
  const tenantIds = input.tenantId ? [input.tenantId] : await getAutomationTenantIds(input.tenantLimit ?? 100);
  const actionQueueScans: ActionQueueScanResult[] = [];
  const revenueLoops: BusinessAutomationRunResult["revenueLoops"] = [];
  const constructionHealth: BusinessAutomationRunResult["constructionHealth"] = [];
  const linkAuthority: BusinessAutomationRunResult["linkAuthority"] = [];
  const readyMessages: BusinessAutomationRunResult["readyMessages"] = [];
  const usageBilling: BusinessAutomationRunResult["usageBilling"] = [];
  const adapterFactory: BusinessAutomationRunResult["adapterFactory"] = [];
  const dailyBriefs: BusinessAutomationRunResult["dailyBriefs"] = [];

  for (const tenantId of tenantIds) {
    await ensureDefaultMonitorSetup(tenantId);
    revenueLoops.push({ tenantId, ...(await runRevenueLoopAutomationForTenant(tenantId)) });
    constructionHealth.push({ tenantId, ...(await syncConstructionHealthForTenant(tenantId)) });
    linkAuthority.push({ tenantId, ...(await syncLinkAuthorityForTenant(tenantId)) });
    actionQueueScans.push(await scanActionQueueForTenant(tenantId));
    readyMessages.push({ tenantId, ...(await processReadyMessagesForTenant(tenantId)) });
    usageBilling.push({ tenantId, ...(await syncMaturedUsageChargesForTenant(tenantId)) });
    adapterFactory.push({ tenantId, ...(await processAdapterFactoryQueueForTenant(tenantId, 1)) });
    dailyBriefs.push(await generateTenantDailyBrief(tenantId));
  }

  const aiWorkforce = await runDueAgentWorkflows({ limit: input.agentLimit ?? 25, tenantId: input.tenantId ?? null });

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    select id, 'system', 'business_automation_loop', 'Business automation loop ran',
      'Ferocity ran due AI workflows, scanned action queues, prepared retries, and generated owner briefs behind plan/provider/consent gates.',
      $2::jsonb
    from public.tenants
    where id = any($1::uuid[])
    `,
    [
      tenantIds,
      JSON.stringify({
        tenantsChecked: tenantIds.length,
        actionQueueScans,
        revenueLoops,
        constructionHealth,
        linkAuthority,
        readyMessages,
        usageBilling,
        adapterFactory,
        dailyBriefs,
        aiWorkforce,
        elapsedMs: Date.now() - startedAt,
        liveActionsStillGated: true
      })
    ]
  );

  return {
    ok: true,
    tenantsChecked: tenantIds.length,
    actionQueueScans,
    revenueLoops,
    constructionHealth,
    linkAuthority,
    readyMessages,
    usageBilling,
    adapterFactory,
    dailyBriefs,
    aiWorkforce,
    elapsedMs: Date.now() - startedAt
  };
}
