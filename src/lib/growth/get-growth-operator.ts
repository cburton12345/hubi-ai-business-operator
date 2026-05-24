import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type GrowthMetric = {
  label: string;
  value: number;
  detail: string;
};

export type GrowthInsightRow = {
  id: string;
  title: string;
  summary: string;
  recommendation: string;
  severity: string;
  status: string;
  actionHref: string | null;
};

export type ContentQualityRow = {
  id: string;
  draftId: string;
  brandName: string;
  title: string;
  contentType: string;
  status: string;
  usefulnessScore: number;
  localRelevanceScore: number;
  originalityScore: number;
  conversionClarityScore: number;
  riskFlags: string[];
};

export type PublishingQueueRow = {
  id: string;
  brandName: string;
  title: string;
  targetPlatform: string;
  queueStatus: string;
  providerStatus: string;
  scheduledFor: string | null;
};

export type FollowUpWorkflowRow = {
  id: string;
  brandName: string | null;
  leadName: string;
  workflowType: string;
  status: string;
  channel: string;
  dueAt: string | null;
  aiSuggestedMessage: string | null;
};

export type AttributionSourceRow = {
  id: string;
  brandName: string | null;
  sourceFamily: string;
  sourceName: string;
  campaignName: string | null;
  serviceFocus: string | null;
  cityFocus: string | null;
  leads: number;
  jobs: number;
  revenueCents: number;
};

export type ReviewWorkflowRow = {
  id: string;
  brandName: string | null;
  customerName: string;
  triggerEvent: string;
  channel: string;
  status: string;
  scheduledFor: string | null;
  negativeInterceptionStatus: string;
};

export type TimelineEventRow = {
  id: string;
  family: string;
  type: string;
  title: string;
  body: string | null;
  occurredAt: string;
};

export type GrowthOperatorDashboard = {
  metrics: GrowthMetric[];
  insights: GrowthInsightRow[];
  qualityReviews: ContentQualityRow[];
  publishingQueue: PublishingQueueRow[];
  followUps: FollowUpWorkflowRow[];
  attribution: AttributionSourceRow[];
  reviewWorkflows: ReviewWorkflowRow[];
  timeline: TimelineEventRow[];
};

function numberFrom(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getGrowthOperatorDashboard(): Promise<GrowthOperatorDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [
    metricsResult,
    insightsResult,
    qualityResult,
    publishingResult,
    followUpResult,
    attributionResult,
    reviewResult,
    timelineResult
  ] = await Promise.all([
    queryPostgres<{
      seo_drafts: string;
      approved_drafts: string;
      queued_publishing: string;
      open_followups: string;
      review_requests: string;
      attributed_revenue_cents: string;
    }>(
      `
      select
        (select count(*) from public.ai_drafts where tenant_id = $1 and content_type in ('blog', 'city_page', 'service_page', 'gbp_post')) as seo_drafts,
        (select count(*) from public.ai_drafts where tenant_id = $1 and status = 'approved') as approved_drafts,
        (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status in ('approved', 'scheduled', 'needs_approval')) as queued_publishing,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open', 'scheduled', 'missed')) as open_followups,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status in ('draft', 'scheduled', 'sent_manually')) as review_requests,
        (select coalesce(sum(revenue_cents), 0) from public.growth_attribution_events where tenant_id = $1) as attributed_revenue_cents
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string;
      recommendation: string;
      severity: string;
      status: string;
      action_href: string | null;
    }>(
      `
      select id, title, summary, recommendation, severity, status, action_href
      from public.growth_operator_insights
      where tenant_id = $1 and status in ('open', 'acknowledged')
      order by
        case severity when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
        detected_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      draft_id: string;
      brand_name: string;
      title: string | null;
      content_type: string;
      quality_status: string;
      usefulness_score: number;
      local_relevance_score: number;
      originality_score: number;
      conversion_clarity_score: number;
      risk_flags: string[];
    }>(
      `
      select q.id, q.draft_id, b.name as brand_name, d.title, d.content_type, q.quality_status,
        q.usefulness_score, q.local_relevance_score, q.originality_score, q.conversion_clarity_score, q.risk_flags
      from public.content_quality_reviews q
      join public.ai_drafts d on d.id = q.draft_id and d.tenant_id = q.tenant_id
      join public.brands b on b.id = q.brand_id
      where q.tenant_id = $1
      order by q.created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string;
      title: string | null;
      target_platform: string;
      queue_status: string;
      provider_status: string;
      scheduled_for: string | null;
    }>(
      `
      select q.id, b.name as brand_name, coalesce(d.title, c.title, 'Untitled item') as title,
        q.target_platform, q.queue_status, q.provider_status, q.scheduled_for
      from public.publishing_queue q
      join public.brands b on b.id = q.brand_id
      left join public.ai_drafts d on d.id = q.draft_id
      left join public.marketing_calendar_items c on c.id = q.calendar_item_id
      where q.tenant_id = $1
      order by coalesce(q.scheduled_for, q.created_at) asc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      lead_name: string | null;
      workflow_type: string;
      status: string;
      channel: string;
      due_at: string | null;
      ai_suggested_message: string | null;
    }>(
      `
      select f.id, b.name as brand_name, coalesce(l.name, l.email, l.phone, 'Unnamed lead') as lead_name,
        f.workflow_type, f.status, f.channel, f.due_at, f.ai_suggested_message
      from public.follow_up_workflows f
      left join public.brands b on b.id = f.brand_id
      left join public.leads l on l.id = f.lead_id
      where f.tenant_id = $1 and f.status in ('open', 'scheduled', 'missed')
      order by coalesce(f.due_at, f.created_at) asc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      source_family: string;
      source_name: string;
      campaign_name: string | null;
      service_focus: string | null;
      city_focus: string | null;
      leads: string;
      jobs: string;
      revenue_cents: string;
    }>(
      `
      select s.id, b.name as brand_name, s.source_family, s.source_name, s.campaign_name, s.service_focus, s.city_focus,
        count(*) filter (where e.event_type = 'lead_created') as leads,
        count(*) filter (where e.event_type = 'job_won') as jobs,
        coalesce(sum(e.revenue_cents), 0) as revenue_cents
      from public.growth_sources s
      left join public.brands b on b.id = s.brand_id
      left join public.growth_attribution_events e on e.source_id = s.id and e.tenant_id = s.tenant_id
      where s.tenant_id = $1
      group by s.id, b.name
      order by revenue_cents desc, leads desc, s.created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      brand_name: string | null;
      customer_name: string | null;
      trigger_event: string;
      channel: string;
      status: string;
      scheduled_for: string | null;
      negative_interception_status: string;
    }>(
      `
      select r.id, b.name as brand_name, coalesce(c.name, l.name, 'Unassigned customer') as customer_name,
        r.trigger_event, r.channel, r.status, r.scheduled_for, r.negative_interception_status
      from public.review_request_workflows r
      left join public.brands b on b.id = r.brand_id
      left join public.customers c on c.id = r.customer_id
      left join public.leads l on l.id = r.lead_id
      where r.tenant_id = $1
      order by coalesce(r.scheduled_for, r.created_at) desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      event_family: string;
      event_type: string;
      title: string;
      body: string | null;
      occurred_at: string;
    }>(
      `
      select id, event_family, event_type, title, body, occurred_at
      from public.operator_timeline_events
      where tenant_id = $1
      order by occurred_at desc
      limit 30
      `,
      [workspaceId]
    )
  ]);

  const metrics = metricsResult?.rows[0];

  return {
    metrics: [
      { label: "SEO/content drafts", value: numberFrom(metrics?.seo_drafts), detail: "Draft-only growth assets" },
      { label: "Approved drafts", value: numberFrom(metrics?.approved_drafts), detail: "Ready for manual publish" },
      { label: "Publishing queue", value: numberFrom(metrics?.queued_publishing), detail: "Approval/schedule pipeline" },
      { label: "Open follow-ups", value: numberFrom(metrics?.open_followups), detail: "Lead recovery and nurture" },
      { label: "Review requests", value: numberFrom(metrics?.review_requests), detail: "Reputation workflow" },
      { label: "Attributed revenue", value: Math.round(numberFrom(metrics?.attributed_revenue_cents) / 100), detail: "Closed-loop dollars" }
    ],
    insights: (insightsResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      recommendation: row.recommendation,
      severity: row.severity,
      status: row.status,
      actionHref: row.action_href
    })),
    qualityReviews: (qualityResult?.rows ?? []).map((row) => ({
      id: row.id,
      draftId: row.draft_id,
      brandName: row.brand_name,
      title: row.title ?? "Untitled draft",
      contentType: row.content_type,
      status: row.quality_status,
      usefulnessScore: row.usefulness_score,
      localRelevanceScore: row.local_relevance_score,
      originalityScore: row.originality_score,
      conversionClarityScore: row.conversion_clarity_score,
      riskFlags: row.risk_flags ?? []
    })),
    publishingQueue: (publishingResult?.rows ?? []).map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      title: row.title ?? "Untitled item",
      targetPlatform: row.target_platform,
      queueStatus: row.queue_status,
      providerStatus: row.provider_status,
      scheduledFor: row.scheduled_for
    })),
    followUps: (followUpResult?.rows ?? []).map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      leadName: row.lead_name ?? "Unnamed lead",
      workflowType: row.workflow_type,
      status: row.status,
      channel: row.channel,
      dueAt: row.due_at,
      aiSuggestedMessage: row.ai_suggested_message
    })),
    attribution: (attributionResult?.rows ?? []).map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      sourceFamily: row.source_family,
      sourceName: row.source_name,
      campaignName: row.campaign_name,
      serviceFocus: row.service_focus,
      cityFocus: row.city_focus,
      leads: numberFrom(row.leads),
      jobs: numberFrom(row.jobs),
      revenueCents: numberFrom(row.revenue_cents)
    })),
    reviewWorkflows: (reviewResult?.rows ?? []).map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      customerName: row.customer_name ?? "Unassigned customer",
      triggerEvent: row.trigger_event,
      channel: row.channel,
      status: row.status,
      scheduledFor: row.scheduled_for,
      negativeInterceptionStatus: row.negative_interception_status
    })),
    timeline: (timelineResult?.rows ?? []).map((row) => ({
      id: row.id,
      family: row.event_family,
      type: row.event_type,
      title: row.title,
      body: row.body,
      occurredAt: row.occurred_at
    }))
  };
}
