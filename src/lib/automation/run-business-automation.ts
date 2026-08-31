import { randomUUID } from "node:crypto";
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
import { syncDueEarnSettlementForTenant, type EarnSettlementSyncResult } from "@/lib/billing/earn-settlement";
import { processAdapterFactoryQueueForTenant } from "@/lib/integrations/adapter-factory";
import { processExternalCallLogQueueForTenant } from "@/lib/integrations/call-log/processor";
import { evaluateProviderFundingAlerts } from "@/lib/usage/provider-funding";
import { evaluatePlatformCapacity } from "@/lib/observability/platform-capacity";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";
import { sendPlatformAdminDailyBrief } from "@/lib/observability/platform-admin-daily-brief";
import { safeLogAppError } from "@/lib/observability/log-error";
import { syncGoldenBusinessLoopsForTenant, type GoldenLoopSyncResult } from "@/lib/business-loop/sync-golden-loop";
import { runCapabilityReliabilityWatchdog, syncCapabilityTrustHealthForTenant } from "@/lib/reliability/capability-runtime";
import { evaluateConnectorHeartbeatAlerts } from "@/lib/observability/connector-heartbeats";

export type BusinessAutomationCompletedResult = {
  ok: true;
  skipped: false;
  tenantsChecked: number;
  actionQueueScans: ActionQueueScanResult[];
  revenueLoops: Array<{ tenantId: string } & RevenueLoopAutomationResult>;
  constructionHealth: Array<{ tenantId: string; jobsChecked: number; highRiskJobs: number; fieldLogsToReview: number }>;
  linkAuthority: Array<{ tenantId: string } & LinkAuthoritySyncResult>;
  readyMessages: Array<{ tenantId: string } & ReadyMessageProcessingResult>;
  usageBilling: Array<{ tenantId: string } & MaturedUsageSyncResult>;
  earnSettlements: Array<{ tenantId: string } & EarnSettlementSyncResult>;
  adapterFactory: Array<{ tenantId: string } & Awaited<ReturnType<typeof processAdapterFactoryQueueForTenant>>>;
  externalCallLogs: Array<{ tenantId: string } & Awaited<ReturnType<typeof processExternalCallLogQueueForTenant>>>;
  goldenBusinessLoops: Array<{ tenantId: string } & GoldenLoopSyncResult>;
  dailyBriefs: Array<{ tenantId: string; status: "ready" | "blocked"; reason?: string }>;
  aiWorkforce: Awaited<ReturnType<typeof runDueAgentWorkflows>>;
  providerFunding: Awaited<ReturnType<typeof evaluateProviderFundingAlerts>>;
  platformCapacity: Awaited<ReturnType<typeof evaluatePlatformCapacity>>;
  platformAdminBrief: Awaited<ReturnType<typeof sendPlatformAdminDailyBrief>>;
  capabilityWatchdog: Awaited<ReturnType<typeof runCapabilityReliabilityWatchdog>>;
  capabilityHealth: Array<{ tenantId: string } & Awaited<ReturnType<typeof syncCapabilityTrustHealthForTenant>>>;
  connectorHeartbeats: Awaited<ReturnType<typeof evaluateConnectorHeartbeatAlerts>>;
  tenantFailures: Array<{ tenantId: string; message: string }>;
  elapsedMs: number;
};

export type BusinessAutomationRunResult = BusinessAutomationCompletedResult | {
  ok: true;
  skipped: true;
  skipReason: "already_running" | "lease_unavailable";
  elapsedMs: number;
};

async function acquireAutomationLease(holderId: string) {
  const result = await queryPostgres<{ holder_id: string }>(
    `
    insert into public.platform_runtime_leases (
      lease_key, holder_id, leased_until, metadata_json
    )
    values ('business-automation', $1, now() + interval '18 minutes', '{"source":"scheduled_business_automation"}'::jsonb)
    on conflict (lease_key) do update
    set holder_id = excluded.holder_id,
        leased_until = excluded.leased_until,
        acquired_at = now(),
        updated_at = now(),
        metadata_json = excluded.metadata_json
    where public.platform_runtime_leases.leased_until <= now()
    returning holder_id
    `,
    [holderId]
  );
  if (!result) return "lease_unavailable" as const;
  return result.rows[0]?.holder_id === holderId ? true : "already_running" as const;
}

async function releaseAutomationLease(holderId: string) {
  await queryPostgres(
    `delete from public.platform_runtime_leases where lease_key = 'business-automation' and holder_id = $1`,
    [holderId]
  );
}

async function cleanupExpiredRuntimeRows() {
  await queryPostgres(
    `
    delete from public.public_request_rate_limits
    where id in (
      select id from public.public_request_rate_limits
      where expires_at < now()
      order by expires_at
      limit 1000
    )
    `
  );
}

async function getAutomationTenantIds(limit: number) {
  const result = await queryPostgres<{ id: string }>(
    `
    with due_actions as (
      select tenant_id, min(coalesce(scheduled_for, created_at)) as oldest_due_at
      from public.outbound_action_queue
      where status in ('approved','queued')
        and coalesce(scheduled_for, created_at) <= now()
      group by tenant_id
    ), last_runs as (
      select tenant_id, max(occurred_at) as last_run_at
      from public.operator_timeline_events
      where event_type = 'business_automation_loop'
      group by tenant_id
    )
    select t.id
    from public.tenants t
    left join due_actions due on due.tenant_id = t.id
    left join last_runs last_run on last_run.tenant_id = t.id
    where t.status in ('active', 'trial')
    order by
      case when due.tenant_id is not null then 0 else 1 end,
      due.oldest_due_at nulls last,
      last_run.last_run_at nulls first,
      t.created_at asc
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

function automationConcurrency(value: number | undefined) {
  const configured = Number(value ?? process.env.AUTOMATION_TENANT_CONCURRENCY ?? 2);
  return Number.isFinite(configured) ? Math.max(1, Math.min(Math.floor(configured), 4)) : 2;
}

async function runBusinessAutomationLoopUnlocked(input: { tenantLimit?: number; agentLimit?: number; tenantId?: string | null; tenantConcurrency?: number } = {}): Promise<BusinessAutomationCompletedResult> {
  const startedAt = Date.now();
  const tenantIds = input.tenantId ? [input.tenantId] : await getAutomationTenantIds(input.tenantLimit ?? 100);
  const actionQueueScans: ActionQueueScanResult[] = [];
  const revenueLoops: BusinessAutomationCompletedResult["revenueLoops"] = [];
  const constructionHealth: BusinessAutomationCompletedResult["constructionHealth"] = [];
  const linkAuthority: BusinessAutomationCompletedResult["linkAuthority"] = [];
  const readyMessages: BusinessAutomationCompletedResult["readyMessages"] = [];
  const usageBilling: BusinessAutomationCompletedResult["usageBilling"] = [];
  const earnSettlements: BusinessAutomationCompletedResult["earnSettlements"] = [];
  const adapterFactory: BusinessAutomationCompletedResult["adapterFactory"] = [];
  const externalCallLogs: BusinessAutomationCompletedResult["externalCallLogs"] = [];
  const goldenBusinessLoops: BusinessAutomationCompletedResult["goldenBusinessLoops"] = [];
  const dailyBriefs: BusinessAutomationCompletedResult["dailyBriefs"] = [];
  const tenantFailures: BusinessAutomationCompletedResult["tenantFailures"] = [];
  const capabilityHealth: BusinessAutomationCompletedResult["capabilityHealth"] = [];

  let nextTenantIndex = 0;
  const worker = async () => {
    while (nextTenantIndex < tenantIds.length) {
      const tenantId = tenantIds[nextTenantIndex++];
      try {
        capabilityHealth.push({ tenantId, ...(await syncCapabilityTrustHealthForTenant(tenantId)) });
        await ensureDefaultMonitorSetup(tenantId);
        revenueLoops.push({ tenantId, ...(await runRevenueLoopAutomationForTenant(tenantId)) });
        constructionHealth.push({ tenantId, ...(await syncConstructionHealthForTenant(tenantId)) });
        linkAuthority.push({ tenantId, ...(await syncLinkAuthorityForTenant(tenantId)) });
        actionQueueScans.push(await scanActionQueueForTenant(tenantId));
        readyMessages.push({ tenantId, ...(await processReadyMessagesForTenant(tenantId)) });
        usageBilling.push({ tenantId, ...(await syncMaturedUsageChargesForTenant(tenantId)) });
        earnSettlements.push({ tenantId, ...(await syncDueEarnSettlementForTenant(tenantId)) });
        adapterFactory.push({ tenantId, ...(await processAdapterFactoryQueueForTenant(tenantId, 1)) });
        externalCallLogs.push({ tenantId, ...(await processExternalCallLogQueueForTenant(tenantId, 10)) });
        goldenBusinessLoops.push({ tenantId, ...(await syncGoldenBusinessLoopsForTenant(tenantId)) });
        dailyBriefs.push(await generateTenantDailyBrief(tenantId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tenant automation failure";
        tenantFailures.push({ tenantId, message });
        await safeLogAppError({
          tenantId,
          source: "automation.business_loop.tenant",
          message,
          severity: "error",
          retryable: true,
          metadata: { isolatedToTenant: true }
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(automationConcurrency(input.tenantConcurrency), Math.max(tenantIds.length, 1)) }, () => worker()));

  for (const failure of tenantFailures.slice(0, 10)) {
    await raisePlatformAdminAlert({
      fingerprint: `business-automation:${failure.tenantId}`,
      family: "automation_health",
      type: "tenant_automation_failed",
      severity: "high",
      title: "Customer automation needs attention",
      body: `A scheduled Ferocity automation run failed for workspace ${failure.tenantId}. The failure was isolated so other workspaces could continue.`,
      tenantId: failure.tenantId,
      actionUrl: "/app/platform-activity",
      metadata: { safeError: failure.message.slice(0, 500), isolatedToTenant: true }
    });
  }

  const aiWorkforce = await runDueAgentWorkflows({ limit: input.agentLimit ?? 25, tenantId: input.tenantId ?? null });
  const providerFunding = await evaluateProviderFundingAlerts();
  const platformCapacity = await evaluatePlatformCapacity();
  const platformAdminBrief = await sendPlatformAdminDailyBrief();
  const capabilityWatchdog = await runCapabilityReliabilityWatchdog({ tenantId: input.tenantId ?? null, limit: 200 });
  const connectorHeartbeats = await evaluateConnectorHeartbeatAlerts();
  await cleanupExpiredRuntimeRows();

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
        earnSettlements,
        adapterFactory,
        externalCallLogs,
        goldenBusinessLoops,
        dailyBriefs,
        aiWorkforce,
        providerFunding,
        platformCapacity,
        platformAdminBrief,
        capabilityWatchdog,
        connectorHeartbeats,
        capabilityHealth,
        tenantFailures,
        elapsedMs: Date.now() - startedAt,
        liveActionsStillGated: true
      })
    ]
  );

  return {
    ok: true,
    skipped: false,
    tenantsChecked: tenantIds.length,
    actionQueueScans,
    revenueLoops,
    constructionHealth,
    linkAuthority,
    readyMessages,
    usageBilling,
    earnSettlements,
    adapterFactory,
    externalCallLogs,
    goldenBusinessLoops,
    dailyBriefs,
    aiWorkforce,
    providerFunding,
    platformCapacity,
    platformAdminBrief,
    capabilityWatchdog,
    connectorHeartbeats,
    capabilityHealth,
    tenantFailures,
    elapsedMs: Date.now() - startedAt
  };
}

export async function runBusinessAutomationLoop(input: { tenantLimit?: number; agentLimit?: number; tenantId?: string | null; tenantConcurrency?: number } = {}): Promise<BusinessAutomationRunResult> {
  const startedAt = Date.now();
  const holderId = randomUUID();
  const lease = await acquireAutomationLease(holderId);
  if (lease !== true) {
    return {
      ok: true,
      skipped: true,
      skipReason: lease,
      elapsedMs: Date.now() - startedAt
    };
  }

  try {
    return await runBusinessAutomationLoopUnlocked(input);
  } finally {
    await releaseAutomationLease(holderId);
  }
}
