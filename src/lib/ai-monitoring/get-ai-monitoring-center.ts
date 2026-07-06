import { getAttentionCommandDashboard } from "@/lib/attention-command/get-attention-command-dashboard";
import { getServiceGate } from "@/lib/controls/service-gates";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { queryPostgres } from "@/lib/db/postgres";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import { getOwnerCommandCenter, type OwnerCommandEvent } from "@/lib/owner-command-center/get-owner-command-center";
import { getReportingDashboard } from "@/lib/reports/get-reporting-dashboard";
import { getCurrentWorkspace, getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MonitorPriority = "low" | "medium" | "high" | "critical";

export type MonitorSection = {
  key: string;
  title: string;
  priority: MonitorPriority;
  summary: string;
  metrics: { label: string; value: string | number; tone?: string }[];
  items: { title: string; detail: string; href: string; priority: MonitorPriority }[];
};

export type MonitorSourceRow = {
  id: string;
  sourceKey: string;
  sourceType: string;
  providerKey: string | null;
  displayName: string;
  status: string;
  immediateAlertEnabled: boolean;
  dailyBriefEnabled: boolean;
};

export type MonitorRuleRow = {
  id: string;
  monitorArea: string;
  label: string;
  severity: MonitorPriority;
  immediateAlert: boolean;
  dailyBrief: boolean;
  status: string;
  actionHref: string;
};

export type CompetitorMonitorRow = {
  id: string;
  competitorName: string;
  websiteUrl: string | null;
  status: string;
  summary: string | null;
};

export type OwnerDailyBriefingRow = {
  id: string;
  title: string;
  summary: string;
  priority: MonitorPriority;
  status: string;
  briefDate: string;
  generatedAt: string;
};

export type AIMonitoringCenter = {
  workspaceName: string;
  gate: {
    enabled: boolean;
    reason: string;
    remaining: number | null;
  };
  dailyBrief: {
    title: string;
    summary: string;
    priority: MonitorPriority;
    yesterday: string[];
    today: string[];
    ownerAttention: { title: string; detail: string; href: string; priority: MonitorPriority }[];
    aiHandled: { title: string; detail: string; href: string; priority: MonitorPriority }[];
  };
  metrics: {
    immediateAlerts: number;
    dailyBriefOnly: number;
    connectedSources: number;
    needsAttentionSources: number;
    ownerAttention: number;
    aiHandled: number;
  };
  sections: MonitorSection[];
  monitorSources: MonitorSourceRow[];
  monitorRules: MonitorRuleRow[];
  competitors: CompetitorMonitorRow[];
  recentBriefings: OwnerDailyBriefingRow[];
  immediateAlertRules: MonitorRuleRow[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function priorityFromCount(count: number, highAt = 1): MonitorPriority {
  if (count >= highAt) return "high";
  return "low";
}

function eventPriority(event: OwnerCommandEvent): MonitorPriority {
  if (event.severity === "critical") return "critical";
  if (event.severity === "high") return "high";
  if (event.severity === "medium") return "medium";
  return "low";
}

function itemFromEvent(event: OwnerCommandEvent) {
  return {
    title: event.title,
    detail: event.recommendedAction ?? event.summary,
    href: event.actionHref,
    priority: eventPriority(event)
  };
}

function itemFromAttention(item: { title: string; detail: string; href: string; urgency: MonitorPriority }) {
  return {
    title: item.title,
    detail: item.detail,
    href: item.href,
    priority: item.urgency
  };
}

function sectionPriority(items: { priority: MonitorPriority }[], fallback: MonitorPriority = "low"): MonitorPriority {
  if (items.some((item) => item.priority === "critical")) return "critical";
  if (items.some((item) => item.priority === "high")) return "high";
  if (items.some((item) => item.priority === "medium")) return "medium";
  return fallback;
}

function topEvents(events: OwnerCommandEvent[], matcher: (event: OwnerCommandEvent) => boolean, count = 4) {
  return events.filter(matcher).slice(0, count).map(itemFromEvent);
}

async function loadMonitorTables(workspaceId: string) {
  const [sources, rules, competitors, briefs] = await Promise.all([
    queryPostgres<{
      id: string;
      source_key: string;
      source_type: string;
      provider_key: string | null;
      display_name: string;
      status: string;
      immediate_alert_enabled: boolean;
      daily_brief_enabled: boolean;
    }>(
      `
      select id, source_key, source_type, provider_key, display_name, status, immediate_alert_enabled, daily_brief_enabled
      from public.ai_monitor_sources
      where tenant_id = $1 and status <> 'archived'
      order by source_type, display_name
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      monitor_area: string;
      label: string;
      severity: MonitorPriority;
      immediate_alert: boolean;
      daily_brief: boolean;
      status: string;
      action_href: string;
    }>(
      `
      select id, monitor_area, label, severity, immediate_alert, daily_brief, status, action_href
      from public.ai_monitor_rules
      where tenant_id = $1 and status <> 'archived'
      order by immediate_alert desc, case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, monitor_area
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      competitor_name: string;
      website_url: string | null;
      status: string;
      summary: string | null;
    }>(
      `
      select id, competitor_name, website_url, status, summary
      from public.competitor_monitors
      where tenant_id = $1 and status <> 'archived'
      order by created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string;
      priority: MonitorPriority;
      status: string;
      brief_date: Date;
      generated_at: Date;
    }>(
      `
      select id, title, summary, priority, status, brief_date, generated_at
      from public.owner_daily_briefings
      where tenant_id = $1
      order by brief_date desc, generated_at desc
      limit 7
      `,
      [workspaceId]
    )
  ]);

  return {
    monitorSources: (sources?.rows ?? []).map((row) => ({
      id: row.id,
      sourceKey: row.source_key,
      sourceType: row.source_type,
      providerKey: row.provider_key,
      displayName: row.display_name,
      status: row.status,
      immediateAlertEnabled: row.immediate_alert_enabled,
      dailyBriefEnabled: row.daily_brief_enabled
    })),
    monitorRules: (rules?.rows ?? []).map((row) => ({
      id: row.id,
      monitorArea: row.monitor_area,
      label: row.label,
      severity: row.severity,
      immediateAlert: row.immediate_alert,
      dailyBrief: row.daily_brief,
      status: row.status,
      actionHref: row.action_href
    })),
    competitors: (competitors?.rows ?? []).map((row) => ({
      id: row.id,
      competitorName: row.competitor_name,
      websiteUrl: row.website_url,
      status: row.status,
      summary: row.summary
    })),
    recentBriefings: (briefs?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      priority: row.priority,
      status: row.status,
      briefDate: row.brief_date.toISOString().slice(0, 10),
      generatedAt: row.generated_at.toISOString()
    }))
  };
}

export async function buildAIMonitoringSnapshot(): Promise<AIMonitoringCenter> {
  const workspace = await getCurrentWorkspace();
  const [ownerCenter, attention, reports, snapshot, workforce, gate, monitorTables] = await Promise.all([
    getOwnerCommandCenter(),
    getAttentionCommandDashboard(),
    getReportingDashboard(),
    getDashboardSnapshot(),
    getOperationsWorkforceDashboard(),
    getServiceGate(workspace.id, "ai_monitoring_briefing"),
    loadMonitorTables(workspace.id)
  ]);

  const leadEvents = topEvents(ownerCenter.events, (event) => event.eventType.includes("lead") || event.riskType === "revenue");
  const financeEvents = topEvents(ownerCenter.events, (event) => event.riskType === "financial" || event.eventType.includes("payment") || event.eventType.includes("invoice"));
  const customerEvents = topEvents(ownerCenter.events, (event) => event.riskType === "customer" || event.eventType.includes("review") || event.eventType.includes("support"));
  const employeeEvents = topEvents(ownerCenter.events, (event) => event.riskType === "safety" || event.eventType.includes("employee") || event.eventType.includes("payroll") || event.eventType.includes("pickup"));
  const laborEvents = topEvents(ownerCenter.events, (event) => event.platformKey === "ferocity-labor" || event.eventType.includes("labor.") || event.eventType.includes("worker"));
  const bidEvents = topEvents(ownerCenter.events, (event) => ["govflow", "bidops"].includes(event.platformKey) || event.eventType.includes("bid") || event.eventType.includes("auction"));
  const marketingEvents = topEvents(ownerCenter.events, (event) => event.eventType.includes("traffic") || event.eventType.includes("seo") || event.eventType.includes("marketing"));

  const sections: MonitorSection[] = [
    {
      key: "leads",
      title: "Leads",
      priority: priorityFromCount(snapshot.metrics.followUpsDue + snapshot.metrics.staleLeads + leadEvents.length),
      summary: "New leads, hot leads, follow-up risk, duplicate/urgent opportunities, and lead sources.",
      metrics: [
        { label: "New leads", value: snapshot.metrics.openLeads, tone: snapshot.metrics.openLeads ? "medium" : "" },
        { label: "Follow-ups due", value: snapshot.metrics.followUpsDue, tone: snapshot.metrics.followUpsDue ? "high" : "" },
        { label: "At risk", value: snapshot.metrics.staleLeads, tone: snapshot.metrics.staleLeads ? "high" : "" },
        { label: "Pipeline", value: snapshot.metrics.pipelineValue }
      ],
      items: leadEvents.length ? leadEvents : attention.moneyMoves.filter((item) => item.href.includes("lead")).slice(0, 3).map(itemFromAttention)
    },
    {
      key: "estimates",
      title: "Estimates",
      priority: priorityFromCount(reports.leadToRevenue.openEstimates, 3),
      summary: "Sent, approved, unanswered, and high-value estimates that can become booked work.",
      metrics: [
        { label: "Open estimates", value: reports.leadToRevenue.openEstimates },
        { label: "Open pipeline", value: money(reports.leadToRevenue.openPipelineCents) }
      ],
      items: attention.moneyMoves.filter((item) => item.href.includes("service") || item.title.toLowerCase().includes("estimate")).slice(0, 4).map(itemFromAttention)
    },
    {
      key: "jobs",
      title: "Jobs",
      priority: priorityFromCount(workforce.metrics.openAssignments, 5),
      summary: "Today’s schedule, late work, completed work, and jobs that need owner attention.",
      metrics: [
        { label: "Scheduled today", value: workforce.metrics.scheduledToday },
        { label: "Open assignments", value: workforce.metrics.openAssignments },
        { label: "Customer drafts", value: workforce.metrics.customerDrafts }
      ],
      items: workforce.aiDispatcher.slice(0, 4).map((item) => ({ title: item.title, detail: item.detail, href: item.action, priority: item.priority === "normal" ? "medium" : item.priority }))
    },
    {
      key: "financial",
      title: "Financial",
      priority: priorityFromCount(reports.leadToRevenue.unpaidInvoices + financeEvents.length),
      summary: "Outstanding invoices, overdue money, payments received, cash alerts, and revenue summary.",
      metrics: [
        { label: "Unpaid invoices", value: reports.leadToRevenue.unpaidInvoices, tone: reports.leadToRevenue.unpaidInvoices ? "high" : "" },
        { label: "Collected", value: money(reports.leadToRevenue.collectedRevenueCents) },
        { label: "Invoice balance", value: snapshot.metrics.invoiceBalance },
        { label: "Payments", value: snapshot.metrics.paymentsCollected }
      ],
      items: financeEvents.length ? financeEvents : attention.moneyMoves.filter((item) => item.href.includes("cash") || item.title.toLowerCase().includes("invoice")).slice(0, 4).map(itemFromAttention)
    },
    {
      key: "customers",
      title: "Customers",
      priority: sectionPriority(customerEvents),
      summary: "Complaints, negative reviews, unanswered messages, service recovery, and customer trust issues.",
      metrics: [
        { label: "Review requests", value: reports.reputation.reviewRequests },
        { label: "Completed asks", value: reports.reputation.completedRequests },
        { label: "Service recovery", value: reports.reputation.serviceRecovery, tone: reports.reputation.serviceRecovery ? "high" : "" }
      ],
      items: customerEvents
    },
    {
      key: "employees",
      title: "Employees",
      priority: priorityFromCount(workforce.metrics.needsReview + employeeEvents.length),
      summary: "Clock-ins, assignments, safety, payroll review, productivity signals, and field proof.",
      metrics: [
        { label: "Working now", value: workforce.metrics.workingNow },
        { label: "Scheduled today", value: workforce.metrics.scheduledToday },
        { label: "Payroll review", value: workforce.metrics.needsReview, tone: workforce.metrics.needsReview ? "high" : "" },
        { label: "Field proof", value: workforce.metrics.fieldProof }
      ],
      items: employeeEvents.length ? employeeEvents : workforce.aiDispatcher.slice(0, 4).map((item) => ({ title: item.title, detail: item.detail, href: item.action, priority: item.priority === "normal" ? "medium" : item.priority }))
    },
    {
      key: "marketing",
      title: "Marketing",
      priority: marketingEvents.length ? "medium" : "low",
      summary: "Website traffic, lead sources, SEO, landing pages, social activity, and what is working.",
      metrics: [
        { label: "Visitors", value: snapshot.metrics.visitors },
        { label: "Ad spend", value: snapshot.metrics.adSpend },
        { label: "Analytics events", value: reports.analyticsEvents },
        { label: "Channels", value: reports.channelRoi.length }
      ],
      items: marketingEvents.length
        ? marketingEvents
        : reports.channelRoi.slice(0, 4).map((channel) => ({
            title: `${channel.label} channel`,
            detail: `${channel.leads} leads, ${channel.jobs} jobs, ${money(channel.revenueCents)} revenue, ROI: ${channel.roiLabel}`,
            href: "/app/reports",
            priority: channel.revenueCents > 0 ? "medium" : "low"
          }))
    },
    {
      key: "staffing",
      title: "Staffing",
      priority: priorityFromCount(snapshot.metrics.laborMatchApprovals + laborEvents.length),
      summary: "Worker requests, available workers, subcontractor bench, match suggestions, and owner-approved contact.",
      metrics: [
        { label: "Open requests", value: snapshot.metrics.laborOpenRequests, tone: snapshot.metrics.laborOpenRequests ? "medium" : "" },
        { label: "Available workers", value: snapshot.metrics.laborAvailableWorkers },
        { label: "Need approval", value: snapshot.metrics.laborMatchApprovals, tone: snapshot.metrics.laborMatchApprovals ? "high" : "" }
      ],
      items: laborEvents.length
        ? laborEvents
        : [
            {
              title: snapshot.metrics.laborOpenRequests > 0 ? "Open worker requests need matching" : "Labor bench is ready",
              detail:
                snapshot.metrics.laborOpenRequests > 0
                  ? "Add worker availability, run match suggestions, or mark the request as manual staffing needed."
                  : "Add worker availability or create a request when the owner needs help.",
              href: "/app/labor-bench",
              priority: snapshot.metrics.laborOpenRequests > 0 ? "medium" : "low"
            }
          ]
    },
    {
      key: "bids",
      title: "Bid Monitor",
      priority: sectionPriority(bidEvents),
      summary: "GovFlow/BidOps opportunities, matching bids, deadlines, rebids, and scoring.",
      metrics: [
        { label: "Bid events", value: bidEvents.length },
        { label: "Connected systems", value: ownerCenter.platformFilters.filter((platform) => ["GovFlow", "BidOps"].includes(platform)).length }
      ],
      items: bidEvents
    },
    {
      key: "competitors",
      title: "Competitors",
      priority: monitorTables.competitors.length ? "medium" : "low",
      summary: "Competitor reviews, website changes, services, locations, promotions, hiring, and opportunities.",
      metrics: [
        { label: "Tracked", value: monitorTables.competitors.length },
        { label: "Active", value: monitorTables.competitors.filter((item) => item.status === "active").length }
      ],
      items: monitorTables.competitors.slice(0, 4).map((item) => ({
        title: item.competitorName,
        detail: item.summary ?? "Ready to monitor reviews, website changes, service changes, offers, hiring, and locations.",
        href: "/app/ai-monitoring",
        priority: item.status === "active" ? "medium" : "low"
      }))
    }
  ];

  const ownerAttention = [...ownerCenter.needsOwner.map(itemFromEvent), ...attention.doFirst.map(itemFromAttention)].slice(0, 10);
  const aiHandled = ownerCenter.aiActions.map(itemFromEvent).slice(0, 10);
  const highestPriority = sectionPriority([...ownerAttention, ...sections.map((section) => ({ priority: section.priority }))], "medium");
  const dailyBrief = {
    title: `${workspace.name} daily owner brief`,
    summary: [
      ownerCenter.briefing,
      `${ownerAttention.length} item${ownerAttention.length === 1 ? "" : "s"} need owner attention.`,
      `${aiHandled.length} AI-handled item${aiHandled.length === 1 ? "" : "s"} are recorded.`,
      gate.enabled ? "Monitoring is available for this workspace." : gate.reason
    ].join(" "),
    priority: highestPriority,
    yesterday: [
      `${reports.leadToRevenue.leads} total leads are in the workspace.`,
      `${reports.leadToRevenue.wonJobs} completed jobs are recorded.`,
      `${money(reports.leadToRevenue.collectedRevenueCents)} has been collected in tracked invoices.`,
      `${ownerCenter.aiActions.length} AI-handled owner events are visible.`
    ],
    today: [
      `${snapshot.metrics.followUpsDue} follow-up${snapshot.metrics.followUpsDue === 1 ? "" : "s"} are due.`,
      `${workforce.metrics.scheduledToday} assignment${workforce.metrics.scheduledToday === 1 ? "" : "s"} are scheduled today.`,
      `${reports.leadToRevenue.unpaidInvoices} unpaid invoice${reports.leadToRevenue.unpaidInvoices === 1 ? "" : "s"} remain visible.`,
      `${reports.providerGaps.length} provider gap${reports.providerGaps.length === 1 ? "" : "s"} keep some work manual.`
    ],
    ownerAttention,
    aiHandled
  };

  const immediateAlertRules = monitorTables.monitorRules.filter((rule) => rule.immediateAlert && rule.status === "active");

  return {
    workspaceName: workspace.name,
    gate: {
      enabled: gate.enabled,
      reason: gate.reason,
      remaining: gate.remaining
    },
    dailyBrief,
    metrics: {
      immediateAlerts: immediateAlertRules.length,
      dailyBriefOnly: monitorTables.monitorRules.filter((rule) => rule.dailyBrief && !rule.immediateAlert && rule.status === "active").length,
      connectedSources: monitorTables.monitorSources.filter((source) => source.status === "connected").length,
      needsAttentionSources: monitorTables.monitorSources.filter((source) => source.status === "needs_attention" || source.status === "not_connected").length,
      ownerAttention: ownerAttention.length,
      aiHandled: aiHandled.length
    },
    sections,
    ...monitorTables,
    immediateAlertRules
  };
}

export async function generateDailyOwnerBriefing(tenantId: string) {
  const center = await buildAIMonitoringSnapshot();

  await queryPostgres(
    `
    insert into public.owner_daily_briefings (
      tenant_id, brief_date, status, priority, title, summary,
      yesterday_json, today_json, owner_attention_json, ai_handled_json, sections_json, metadata_json, generated_at
    )
    values ($1, current_date, 'ready', $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, now())
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
      center.dailyBrief.priority,
      center.dailyBrief.title,
      center.dailyBrief.summary,
      JSON.stringify(center.dailyBrief.yesterday),
      JSON.stringify(center.dailyBrief.today),
      JSON.stringify(center.dailyBrief.ownerAttention),
      JSON.stringify(center.dailyBrief.aiHandled),
      JSON.stringify(center.sections),
      JSON.stringify({ generatedBy: "ai_monitoring_briefing_center", source: "ferocity_existing_systems" })
    ]
  );

  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href, risk_type, confidence_score, metadata_json
    )
    values ($1, 'ferocity', 'Ferocity', $2, 'daily_brief.generated', $3, $4, $5, 'ai_handled', false, true, $4, 'Open the AI Monitoring & Briefing Center.', '/app/ai-monitoring', 'approval', 92, $6::jsonb)
    on conflict (tenant_id, platform_key, external_event_id)
    do update set
      title = excluded.title,
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
      center.dailyBrief.title,
      center.dailyBrief.summary,
      center.dailyBrief.priority === "critical" ? "critical" : center.dailyBrief.priority === "high" ? "high" : "medium",
      JSON.stringify({ generatedBy: "ai_monitoring_briefing_center" })
    ]
  );
}

export async function ensureDefaultMonitorSetup(tenantId: string) {
  await queryPostgres(
    `
    insert into public.ai_monitor_sources (tenant_id, source_key, source_type, provider_key, display_name, status, immediate_alert_enabled, daily_brief_enabled, metadata_json)
    values
      ($1, 'owner_events', 'owner_event', 'ferocity', 'Owner event stream', 'connected', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'website_forms', 'lead', 'ferocity_forms', 'Website and landing page leads', 'connected', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'email_monitor', 'email', 'gmail_outlook_m365', 'Gmail / Outlook monitor', 'not_connected', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'reviews_monitor', 'review', 'google_facebook_yelp', 'Review monitor', 'not_connected', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'competitor_monitor', 'competitor', 'manual_or_provider', 'Competitor monitor', 'planned', false, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'bid_monitor', 'bid', 'govflow_bidops', 'GovFlow / BidOps monitor', 'planned', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'marketing_monitor', 'marketing', 'analytics_search_social', 'Marketing performance monitor', 'planned', false, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'employee_monitor', 'employee', 'ferocity_operations', 'Employee and field monitor', 'connected', true, true, '{"seededBy":"app"}'::jsonb),
      ($1, 'finance_monitor', 'finance', 'stripe_invoices_ledger', 'Invoices, payments, and cash monitor', 'planned', true, true, '{"seededBy":"app"}'::jsonb)
    on conflict (tenant_id, source_key) do nothing
    `,
    [tenantId]
  );
}

export async function currentWorkspaceMonitoringCenter() {
  await ensureDefaultMonitorSetup(await getCurrentWorkspaceId());
  return buildAIMonitoringSnapshot();
}
