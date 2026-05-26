import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ReportingDashboard = {
  aiRuns: number;
  fallbackRuns: number;
  exportsCreated: number;
  contentVersions: number;
  analyticsEvents: number;
  integrationsReady: number;
  activeAlerts: number;
  leadToRevenue: {
    leads: number;
    opportunities: number;
    wonJobs: number;
    openEstimates: number;
    unpaidInvoices: number;
    collectedRevenueCents: number;
    openPipelineCents: number;
  };
  channelRoi: {
    label: string;
    leads: number;
    jobs: number;
    revenueCents: number;
    spendCents: number;
    roiLabel: string;
  }[];
  serviceCityRevenue: {
    label: string;
    leads: number;
    jobs: number;
    revenueCents: number;
  }[];
  providerGaps: {
    provider: string;
    displayName: string;
    status: string;
    credentialsStatus: string;
    nextStep: string;
  }[];
  reputation: {
    reviewRequests: number;
    completedRequests: number;
    serviceRecovery: number;
  };
  recentEvents: {
    id: string;
    type: string;
    source: string;
    campaign: string;
    occurredAt: string;
  }[];
};

export async function getReportingDashboard(): Promise<ReportingDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [counts, events, channelRoi, serviceCityRevenue, providerGaps] = await Promise.all([
    queryPostgres<{
      ai_runs: string;
      fallback_runs: string;
      exports_created: string;
      content_versions: string;
      analytics_events: string;
      integrations_ready: string;
      active_alerts: string;
      leads: string;
      opportunities: string;
      won_jobs: string;
      open_estimates: string;
      unpaid_invoices: string;
      collected_revenue_cents: string;
      open_pipeline_cents: string;
      review_requests: string;
      completed_review_requests: string;
      service_recovery: string;
    }>(
      `
      select
        (select count(*) from public.ai_generation_runs where tenant_id = $1) as ai_runs,
        (select count(*) from public.ai_generation_runs where tenant_id = $1 and fallback_used = true) as fallback_runs,
        (select count(*) from public.content_exports where tenant_id = $1) as exports_created,
        (select count(*) from public.content_versions where tenant_id = $1) as content_versions,
        (select count(*) from public.analytics_events where tenant_id = $1) as analytics_events,
        (select count(*) from public.integration_connections where tenant_id = $1 and status in ('planned', 'connected')) as integrations_ready,
        (select count(*) from public.operator_alerts where tenant_id = $1 and status = 'active') as active_alerts,
        (select count(*) from public.leads where tenant_id = $1) as leads,
        (select count(*) from public.opportunities where tenant_id = $1 and status <> 'archived') as opportunities,
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'completed') as won_jobs,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually', 'approved')) as open_estimates,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('draft', 'sent_manually', 'partially_paid', 'overdue')) as unpaid_invoices,
        (select coalesce(sum(amount_paid_cents), 0) from public.service_invoices where tenant_id = $1 and status in ('partially_paid', 'paid')) as collected_revenue_cents,
        (select coalesce(sum(value_cents), 0) from public.opportunities where tenant_id = $1 and status = 'open') as open_pipeline_cents,
        (select count(*) from public.review_request_workflows where tenant_id = $1) as review_requests,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status = 'completed') as completed_review_requests,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and negative_interception_status in ('needs_service_recovery', 'escalated')) as service_recovery
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      event_type: string;
      source: string | null;
      campaign_key: string | null;
      occurred_at: Date;
    }>(
      `
      select id, event_type, source, campaign_key, occurred_at
      from public.analytics_events
      where tenant_id = $1
      order by occurred_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      label: string;
      leads: string;
      jobs: string;
      revenue_cents: string;
      spend_cents: string;
    }>(
      `
      with attribution as (
        select s.source_family as label,
          count(*) filter (where e.event_type = 'lead_created') as leads,
          count(*) filter (where e.event_type = 'job_won') as jobs,
          coalesce(sum(e.revenue_cents), 0) as revenue_cents
        from public.growth_sources s
        left join public.growth_attribution_events e on e.source_id = s.id and e.tenant_id = s.tenant_id
        where s.tenant_id = $1
        group by s.source_family
      ),
      spend as (
        select
          case
            when metric_family = 'ads' then 'paid'
            when metric_family = 'seo' then 'organic'
            when metric_family = 'reviews' then 'gbp'
            else metric_family
          end as label,
          coalesce(sum(metric_value), 0) as spend_cents
        from public.external_metric_snapshots
        where tenant_id = $1
          and metric_key in ('spend_cents', 'cost_cents')
          and period_start >= current_date - interval '90 days'
        group by 1
      )
      select coalesce(a.label, s.label, 'unknown') as label,
        coalesce(a.leads, 0)::text as leads,
        coalesce(a.jobs, 0)::text as jobs,
        coalesce(a.revenue_cents, 0)::text as revenue_cents,
        coalesce(s.spend_cents, 0)::text as spend_cents
      from attribution a
      full join spend s on s.label = a.label
      order by coalesce(a.revenue_cents, 0) desc, coalesce(a.leads, 0) desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      label: string;
      leads: string;
      jobs: string;
      revenue_cents: string;
    }>(
      `
      select concat_ws(' / ', nullif(s.service_focus, ''), nullif(s.city_focus, '')) as label,
        count(*) filter (where e.event_type = 'lead_created')::text as leads,
        count(*) filter (where e.event_type = 'job_won')::text as jobs,
        coalesce(sum(e.revenue_cents), 0)::text as revenue_cents
      from public.growth_sources s
      left join public.growth_attribution_events e on e.source_id = s.id and e.tenant_id = s.tenant_id
      where s.tenant_id = $1
        and (s.service_focus is not null or s.city_focus is not null)
      group by concat_ws(' / ', nullif(s.service_focus, ''), nullif(s.city_focus, ''))
      order by coalesce(sum(e.revenue_cents), 0) desc, count(*) filter (where e.event_type = 'lead_created') desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      provider: string;
      display_name: string;
      status: string;
      credentials_status: string;
      next_step: string | null;
    }>(
      `
      select provider, display_name, status, credentials_status,
        coalesce(metadata_json->'setupItems'->>0, metadata_json->>'notes') as next_step
      from public.integration_connections
      where tenant_id = $1
        and (
          status in ('not_connected', 'planned', 'error')
          or credentials_status in ('not_configured', 'missing', 'error')
        )
      order by
        case provider
          when 'search_console' then 1
          when 'analytics' then 2
          when 'google_business_profile' then 3
          when 'stripe' then 4
          when 'email_provider' then 5
          when 'twilio' then 6
          else 20
        end,
        display_name
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const row = counts?.rows[0];
  const moneyRoi = (revenueCents: number, spendCents: number) => {
    if (spendCents <= 0) return revenueCents > 0 ? "No spend recorded" : "Needs data";
    return `${Math.round(((revenueCents - spendCents) / spendCents) * 100)}%`;
  };

  return {
    aiRuns: Number(row?.ai_runs ?? 0),
    fallbackRuns: Number(row?.fallback_runs ?? 0),
    exportsCreated: Number(row?.exports_created ?? 0),
    contentVersions: Number(row?.content_versions ?? 0),
    analyticsEvents: Number(row?.analytics_events ?? 0),
    integrationsReady: Number(row?.integrations_ready ?? 0),
    activeAlerts: Number(row?.active_alerts ?? 0),
    leadToRevenue: {
      leads: Number(row?.leads ?? 0),
      opportunities: Number(row?.opportunities ?? 0),
      wonJobs: Number(row?.won_jobs ?? 0),
      openEstimates: Number(row?.open_estimates ?? 0),
      unpaidInvoices: Number(row?.unpaid_invoices ?? 0),
      collectedRevenueCents: Number(row?.collected_revenue_cents ?? 0),
      openPipelineCents: Number(row?.open_pipeline_cents ?? 0)
    },
    channelRoi: (channelRoi?.rows ?? []).map((item) => {
      const revenueCents = Number(item.revenue_cents ?? 0);
      const spendCents = Number(item.spend_cents ?? 0);
      return {
        label: item.label,
        leads: Number(item.leads ?? 0),
        jobs: Number(item.jobs ?? 0),
        revenueCents,
        spendCents,
        roiLabel: moneyRoi(revenueCents, spendCents)
      };
    }),
    serviceCityRevenue: (serviceCityRevenue?.rows ?? []).map((item) => ({
      label: item.label || "Unlabeled service/city",
      leads: Number(item.leads ?? 0),
      jobs: Number(item.jobs ?? 0),
      revenueCents: Number(item.revenue_cents ?? 0)
    })),
    providerGaps: (providerGaps?.rows ?? []).map((item) => ({
      provider: item.provider,
      displayName: item.display_name,
      status: item.status,
      credentialsStatus: item.credentials_status,
      nextStep: item.next_step ?? "Connect or review this provider before live actions."
    })),
    reputation: {
      reviewRequests: Number(row?.review_requests ?? 0),
      completedRequests: Number(row?.completed_review_requests ?? 0),
      serviceRecovery: Number(row?.service_recovery ?? 0)
    },
    recentEvents: (events?.rows ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      source: event.source ?? "unknown",
      campaign: event.campaign_key ?? "unattributed",
      occurredAt: event.occurred_at.toISOString()
    }))
  };
}
