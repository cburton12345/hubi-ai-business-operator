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
  contactName: string;
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

export type SeoOpportunityRow = {
  id: string;
  brandName: string;
  type: string;
  pageType: string;
  title: string;
  targetKeyword: string | null;
  serviceFocus: string | null;
  cityFocus: string | null;
  priorityScore: number;
  status: string;
  reason: string;
  nextStep: string;
};

export type WeakAreaRow = {
  brandName: string;
  label: string;
  serviceCount: number;
  locationCount: number;
  pageCount: number;
  keywordCount: number;
};

export type ConversionTargetRow = {
  id: string;
  label: string;
  sourceFamily: string;
  targetType: string;
  targetValue: number;
  period: string;
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
  seoOpportunities: SeoOpportunityRow[];
  weakAreas: WeakAreaRow[];
  conversionTargets: ConversionTargetRow[];
  nextBestActions: Array<{
    title: string;
    detail: string;
    href: string;
    urgency: "high" | "medium" | "low";
  }>;
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
    seoOpportunityResult,
    weakAreaResult,
    conversionTargetResult,
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
      contact_name: string | null;
      workflow_type: string;
      status: string;
      channel: string;
      due_at: string | null;
      ai_suggested_message: string | null;
    }>(
      `
      select f.id, b.name as brand_name,
        coalesce(l.name, c.name, i.title, l.email, l.phone, 'Follow-up') as contact_name,
        f.workflow_type, f.status, f.channel, f.due_at, f.ai_suggested_message
      from public.follow_up_workflows f
      left join public.brands b on b.id = f.brand_id
      left join public.leads l on l.id = f.lead_id
      left join public.customers c on c.id = f.customer_id
      left join public.service_invoices i on i.id = f.invoice_id
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
      brand_name: string;
      opportunity_type: string;
      page_type: string;
      title: string;
      target_keyword: string | null;
      service_focus: string | null;
      city_focus: string | null;
      priority_score: number;
      status: string;
      reason: string;
      next_step: string;
    }>(
      `
      select o.id, b.name as brand_name, o.opportunity_type, o.page_type, o.title, o.target_keyword,
        o.service_focus, o.city_focus, o.priority_score, o.status, o.reason, o.next_step
      from public.seo_page_opportunities o
      join public.brands b on b.id = o.brand_id
      where o.tenant_id = $1 and o.status in ('open', 'planned', 'draft_created', 'in_review')
      order by o.priority_score desc, o.detected_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      brand_name: string;
      label: string;
      service_count: string;
      location_count: string;
      page_count: string;
      keyword_count: string;
    }>(
      `
      select b.name as brand_name,
        coalesce(b.primary_location, b.industry, 'Growth setup') as label,
        (select count(*) from public.brand_services s where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true) as service_count,
        (select count(*) from public.brand_locations l where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.active = true) as location_count,
        (select count(*) from public.brand_landing_pages p where p.tenant_id = b.tenant_id and p.brand_id = b.id and p.status <> 'archived') as page_count,
        (select count(*) from public.brand_seo_keywords k where k.tenant_id = b.tenant_id and k.brand_id = b.id) as keyword_count
      from public.brands b
      where b.tenant_id = $1 and b.status = 'active'
      order by
        ((select count(*) from public.brand_services s where s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true)
        + (select count(*) from public.brand_locations l where l.tenant_id = b.tenant_id and l.brand_id = b.id and l.active = true)
        - (select count(*) from public.brand_landing_pages p where p.tenant_id = b.tenant_id and p.brand_id = b.id and p.status <> 'archived')) desc,
        b.name
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      label: string;
      source_family: string;
      target_type: string;
      target_value: string;
      period: string;
    }>(
      `
      select id, label, source_family, target_type, target_value::text, period
      from public.marketing_conversion_targets
      where tenant_id = $1 and status = 'active'
      order by source_family, target_type, label
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
  const seoOpportunities = (seoOpportunityResult?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    type: row.opportunity_type,
    pageType: row.page_type,
    title: row.title,
    targetKeyword: row.target_keyword,
    serviceFocus: row.service_focus,
    cityFocus: row.city_focus,
    priorityScore: row.priority_score,
    status: row.status,
    reason: row.reason,
    nextStep: row.next_step
  }));
  const qualityReviews = (qualityResult?.rows ?? []).map((row) => ({
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
  }));
  const publishingQueue = (publishingResult?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    title: row.title ?? "Untitled item",
    targetPlatform: row.target_platform,
    queueStatus: row.queue_status,
    providerStatus: row.provider_status,
    scheduledFor: row.scheduled_for
  }));
  const reviewWorkflows = (reviewResult?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    customerName: row.customer_name ?? "Unassigned customer",
    triggerEvent: row.trigger_event,
    channel: row.channel,
    status: row.status,
    scheduledFor: row.scheduled_for,
    negativeInterceptionStatus: row.negative_interception_status
  }));
  const attribution = (attributionResult?.rows ?? []).map((row) => ({
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
  }));
  const nextBestActions = [
    seoOpportunities.length > 0
      ? {
          title: "Build the highest-value local page",
          detail: `${seoOpportunities[0].title}: ${seoOpportunities[0].nextStep}`,
          href: "/app/seo",
          urgency: "high" as const
        }
      : null,
    qualityReviews.some((review) => review.status !== "passed")
      ? {
          title: "Clean up content before publishing",
          detail: "Review usefulness, local proof, originality, and conversion clarity so Ferocity does not ship thin AI content.",
          href: "/app/growth",
          urgency: "high" as const
        }
      : null,
    publishingQueue.length > 0
      ? {
          title: "Keep publishing consistent",
          detail: "Move approved work through the queue manually or with connected providers later.",
          href: "/app/growth",
          urgency: "medium" as const
        }
      : null,
    reviewWorkflows.length > 0
      ? {
          title: "Ask happy customers for reviews",
          detail: "Review requests are ready to send manually until SMS/email/GBP providers are connected.",
          href: "/app/growth",
          urgency: "medium" as const
        }
      : null,
    attribution.length === 0
      ? {
          title: "Start tracking which marketing makes money",
          detail: "Add source tracking so Ferocity can connect pages and campaigns to leads, jobs, and revenue.",
          href: "/app/integrations",
          urgency: "medium" as const
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

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
    qualityReviews,
    publishingQueue,
    followUps: (followUpResult?.rows ?? []).map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      contactName: row.contact_name ?? "Follow-up",
      workflowType: row.workflow_type,
      status: row.status,
      channel: row.channel,
      dueAt: row.due_at,
      aiSuggestedMessage: row.ai_suggested_message
    })),
    attribution,
    reviewWorkflows,
    seoOpportunities,
    weakAreas: (weakAreaResult?.rows ?? []).map((row) => ({
      brandName: row.brand_name,
      label: row.label,
      serviceCount: numberFrom(row.service_count),
      locationCount: numberFrom(row.location_count),
      pageCount: numberFrom(row.page_count),
      keywordCount: numberFrom(row.keyword_count)
    })),
    conversionTargets: (conversionTargetResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      sourceFamily: row.source_family,
      targetType: row.target_type,
      targetValue: numberFrom(row.target_value),
      period: row.period
    })),
    nextBestActions,
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
