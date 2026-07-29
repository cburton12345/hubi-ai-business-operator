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
  growthSinceBaseline: {
    hasBaseline: boolean;
    baselineDate: string | null;
    confidence: string;
    monthsTracked: number;
    revenue: { baselineCents: number; currentCents: number; changeCents: number; changePct: number | null };
    leads: { baseline: number; current: number; change: number; changePct: number | null };
    jobs: { baseline: number; current: number; change: number; changePct: number | null };
    reviews: { baseline: number; current: number; change: number; changePct: number | null };
    adSpend: { baselineCents: number; currentCents: number; changeCents: number; changePct: number | null };
    summary: string;
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
  expenseSummary: {
    ytdExpenseCents: number;
    ytdTaxCents: number;
    ytdJobCostCents: number;
    ytdOverheadCents: number;
    monthExpenseCents: number;
    pendingReimbursementCents: number;
    receiptsNeedReview: number;
    receiptProofCount: number;
  };
  expenseCategories: {
    category: string;
    totalCents: number;
    taxCents: number;
    count: number;
  }[];
  recentEvents: {
    id: string;
    type: string;
    source: string;
    campaign: string;
    occurredAt: string;
  }[];
};

function pctChange(current: number, baseline: number) {
  if (baseline <= 0) return current > 0 ? null : 0;
  return Math.round(((current - baseline) / baseline) * 100);
}

function monthsBetween(from: Date, to: Date) {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

export async function getReportingDashboard(): Promise<ReportingDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [counts, events, channelRoi, serviceCityRevenue, providerGaps, baselineResult, currentMonthResult, expenseSummary, expenseCategories] = await Promise.all([
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
    ),
    queryPostgres<{
      baseline_date: Date;
      confidence: string;
      monthly_revenue_cents: number;
      monthly_leads: number;
      monthly_booked_jobs: number;
      monthly_ad_spend_cents: number;
      review_count: number;
    }>(
      `
      select baseline_date, confidence, monthly_revenue_cents, monthly_leads, monthly_booked_jobs,
        monthly_ad_spend_cents, review_count
      from public.business_growth_baselines
      where tenant_id = $1
      order by baseline_date asc, created_at asc
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      revenue_cents: string;
      leads: string;
      jobs: string;
      ad_spend_cents: string;
      review_requests: string;
    }>(
      `
      select
        (
          select coalesce(sum(amount_paid_cents), 0)
          from public.service_invoices
          where tenant_id = $1
            and status in ('partially_paid', 'paid')
            and updated_at >= date_trunc('month', now())
        )::text as revenue_cents,
        (
          select count(*)
          from public.leads
          where tenant_id = $1
            and created_at >= date_trunc('month', now())
        )::text as leads,
        (
          select count(*)
          from public.service_jobs
          where tenant_id = $1
            and status = 'completed'
            and updated_at >= date_trunc('month', now())
        )::text as jobs,
        (
          select coalesce(sum(metric_value), 0)
          from public.external_metric_snapshots
          where tenant_id = $1
            and metric_key in ('spend_cents', 'cost_cents')
            and period_start >= date_trunc('month', now())
        )::text as ad_spend_cents,
        (
          select count(*)
          from public.review_request_workflows
          where tenant_id = $1
            and created_at >= date_trunc('month', now())
        )::text as review_requests
      `,
      [workspaceId]
    ),
    queryPostgres<{
      ytd_expense_cents: string;
      ytd_tax_cents: string;
      ytd_job_cost_cents: string;
      ytd_overhead_cents: string;
      month_expense_cents: string;
      pending_reimbursement_cents: string;
      receipts_need_review: string;
      receipt_proof_count: string;
    }>(
      `
      select
        coalesce(sum(amount_cents + tax_cents) filter (
          where status <> 'rejected'
            and coalesce(expense_date, created_at::date) >= date_trunc('year', current_date)::date
        ), 0)::text as ytd_expense_cents,
        coalesce(sum(tax_cents) filter (
          where status <> 'rejected'
            and coalesce(expense_date, created_at::date) >= date_trunc('year', current_date)::date
        ), 0)::text as ytd_tax_cents,
        coalesce(sum(amount_cents + tax_cents) filter (
          where status <> 'rejected'
            and assign_to = 'job'
            and coalesce(expense_date, created_at::date) >= date_trunc('year', current_date)::date
        ), 0)::text as ytd_job_cost_cents,
        coalesce(sum(amount_cents + tax_cents) filter (
          where status <> 'rejected'
            and assign_to = 'overhead'
            and coalesce(expense_date, created_at::date) >= date_trunc('year', current_date)::date
        ), 0)::text as ytd_overhead_cents,
        coalesce(sum(amount_cents + tax_cents) filter (
          where status <> 'rejected'
            and coalesce(expense_date, created_at::date) >= date_trunc('month', current_date)::date
        ), 0)::text as month_expense_cents,
        coalesce(sum(amount_cents + tax_cents - paid_back_cents) filter (
          where reimbursement_status in ('submitted', 'approved')
        ), 0)::text as pending_reimbursement_cents,
        count(*) filter (where status = 'needs_review')::text as receipts_need_review,
        count(*) filter (where receipt_url is not null)::text as receipt_proof_count
      from public.operations_expenses
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      category: string;
      total_cents: string;
      tax_cents: string;
      expense_count: string;
    }>(
      `
      select coalesce(nullif(category, ''), 'uncategorized') as category,
        coalesce(sum(amount_cents + tax_cents), 0)::text as total_cents,
        coalesce(sum(tax_cents), 0)::text as tax_cents,
        count(*)::text as expense_count
      from public.operations_expenses
      where tenant_id = $1
        and status <> 'rejected'
        and coalesce(expense_date, created_at::date) >= date_trunc('year', current_date)::date
      group by coalesce(nullif(category, ''), 'uncategorized')
      order by coalesce(sum(amount_cents + tax_cents), 0) desc
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
  const baseline = baselineResult?.rows[0];
  const currentMonth = currentMonthResult?.rows[0];
  const currentRevenue = Number(currentMonth?.revenue_cents ?? 0);
  const currentLeads = Number(currentMonth?.leads ?? 0);
  const currentJobs = Number(currentMonth?.jobs ?? 0);
  const currentAdSpend = Number(currentMonth?.ad_spend_cents ?? 0);
  const currentReviews = Number(currentMonth?.review_requests ?? 0);
  const baselineDate = baseline?.baseline_date ? new Date(baseline.baseline_date) : null;
  const baselineRevenue = Number(baseline?.monthly_revenue_cents ?? 0);
  const baselineLeads = Number(baseline?.monthly_leads ?? 0);
  const baselineJobs = Number(baseline?.monthly_booked_jobs ?? 0);
  const baselineAdSpend = Number(baseline?.monthly_ad_spend_cents ?? 0);
  const baselineReviews = Number(baseline?.review_count ?? 0);
  const revenueDelta = currentRevenue - baselineRevenue;
  const leadDelta = currentLeads - baselineLeads;
  const jobDelta = currentJobs - baselineJobs;
  const reviewDelta = currentReviews - baselineReviews;
  const expenseRow = expenseSummary?.rows[0];

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
    growthSinceBaseline: {
      hasBaseline: Boolean(baseline),
      baselineDate: baselineDate ? baselineDate.toISOString() : null,
      confidence: baseline?.confidence ?? "not_set",
      monthsTracked: baselineDate ? monthsBetween(baselineDate, new Date()) : 0,
      revenue: {
        baselineCents: baselineRevenue,
        currentCents: currentRevenue,
        changeCents: revenueDelta,
        changePct: pctChange(currentRevenue, baselineRevenue)
      },
      leads: {
        baseline: baselineLeads,
        current: currentLeads,
        change: leadDelta,
        changePct: pctChange(currentLeads, baselineLeads)
      },
      jobs: {
        baseline: baselineJobs,
        current: currentJobs,
        change: jobDelta,
        changePct: pctChange(currentJobs, baselineJobs)
      },
      reviews: {
        baseline: baselineReviews,
        current: currentReviews,
        change: reviewDelta,
        changePct: pctChange(currentReviews, baselineReviews)
      },
      adSpend: {
        baselineCents: baselineAdSpend,
        currentCents: currentAdSpend,
        changeCents: currentAdSpend - baselineAdSpend,
        changePct: pctChange(currentAdSpend, baselineAdSpend)
      },
      summary: baseline
        ? `This month-to-date is being compared with the ${baseline.confidence.replaceAll("_", " ")} baseline from ${baselineDate?.toLocaleDateString("en-US") ?? "day one"}: ${leadDelta >= 0 ? "+" : ""}${leadDelta} leads, ${jobDelta >= 0 ? "+" : ""}${jobDelta} booked jobs, and ${revenueDelta >= 0 ? "+" : ""}$${Math.round(revenueDelta / 100).toLocaleString()} tracked revenue.`
        : "No baseline has been captured yet. Add day-one numbers so Ferocity can prove growth honestly over time."
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
    expenseSummary: {
      ytdExpenseCents: Number(expenseRow?.ytd_expense_cents ?? 0),
      ytdTaxCents: Number(expenseRow?.ytd_tax_cents ?? 0),
      ytdJobCostCents: Number(expenseRow?.ytd_job_cost_cents ?? 0),
      ytdOverheadCents: Number(expenseRow?.ytd_overhead_cents ?? 0),
      monthExpenseCents: Number(expenseRow?.month_expense_cents ?? 0),
      pendingReimbursementCents: Number(expenseRow?.pending_reimbursement_cents ?? 0),
      receiptsNeedReview: Number(expenseRow?.receipts_need_review ?? 0),
      receiptProofCount: Number(expenseRow?.receipt_proof_count ?? 0)
    },
    expenseCategories: (expenseCategories?.rows ?? []).map((item) => ({
      category: item.category,
      totalCents: Number(item.total_cents ?? 0),
      taxCents: Number(item.tax_cents ?? 0),
      count: Number(item.expense_count ?? 0)
    })),
    recentEvents: (events?.rows ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      source: event.source ?? "unknown",
      campaign: event.campaign_key ?? "unattributed",
      occurredAt: event.occurred_at.toISOString()
    }))
  };
}
