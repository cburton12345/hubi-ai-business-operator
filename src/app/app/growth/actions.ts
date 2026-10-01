"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { findUnverifiedClaims, getGrowthChannel, scoreGrowthOpportunity, supportedCapabilities } from "@/lib/growth/distribution-engine";
import { recordGrowthEvent } from "@/lib/growth/growth-events";
import { runAiGrowthDepartment } from "@/lib/growth/ai-growth-department";
import { prepareAiContentPackage } from "@/lib/marketing/ai-content-production";
import { buildReverseRevenuePlan } from "@/lib/growth/reverse-revenue-plan";
import { createConversationAcquisitionLink } from "@/lib/growth/conversation-acquisition";

const qualityReviewSchema = z.object({
  reviewId: z.string().min(1),
  qualityStatus: z.enum(["needs_review", "passed", "blocked", "needs_edit"]),
  usefulnessScore: z.coerce.number().int().min(0).max(100),
  localRelevanceScore: z.coerce.number().int().min(0).max(100),
  originalityScore: z.coerce.number().int().min(0).max(100),
  conversionClarityScore: z.coerce.number().int().min(0).max(100),
  reviewerNotes: z.string().optional()
});

const queueStatusSchema = z.object({
  queueId: z.string().min(1),
  queueStatus: z.enum(["draft", "needs_approval", "approved", "scheduled", "published_manually", "failed", "canceled"]),
  scheduledFor: z.string().optional()
});

const workflowStatusSchema = z.object({
  workflowId: z.string().min(1),
  status: z.enum(["open", "scheduled", "completed", "missed", "canceled"])
});

const insightStatusSchema = z.object({
  insightId: z.string().min(1),
  status: z.enum(["acknowledged", "resolved", "dismissed"])
});

const seoOpportunityStatusSchema = z.object({
  opportunityId: z.string().min(1),
  status: z.enum(["open", "planned", "draft_created", "in_review", "published_manually", "paused", "done", "dismissed"])
});

const objectiveSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  serviceFocus: z.string().trim().max(160).optional(),
  geography: z.string().trim().max(240).optional(),
  targetLeads: z.coerce.number().int().min(0).max(100000).optional(),
  targetRevenueDollars: z.coerce.number().min(0).max(100000000).optional(),
  targetCollectedRevenueDollars: z.coerce.number().min(0).max(100000000).optional(),
  targetGrossProfitDollars: z.coerce.number().min(0).max(100000000).optional(),
  averageJobValueDollars: z.coerce.number().positive().max(100000000).optional(),
  costPerLeadDollars: z.coerce.number().min(0).max(1000000).optional(),
  grossMarginTargetPercent: z.coerce.number().min(0).max(100).optional(),
  minimumGrossMarginPercent: z.coerce.number().min(0).max(100).optional(),
  maximumCacDollars: z.coerce.number().min(0).max(10000000).optional(),
  minimumRoas: z.coerce.number().min(0).max(1000).optional(),
  monthlyJobCapacity: z.coerce.number().int().min(0).max(100000).optional(),
  maximumBacklogJobs: z.coerce.number().int().min(0).max(100000).optional(),
  timeHorizonDays: z.coerce.number().int().min(1).max(730),
  autonomyLevel: z.enum(["suggest", "approve", "autopilot"])
});

const identitySchema = z.object({
  brandId: z.string().uuid(),
  channelKey: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(2).max(160),
  profileUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  identityRole: z.enum(["primary", "distribution", "personal"]),
  autonomyLevel: z.enum(["suggest", "approve", "autopilot"])
});

const conversationLinkSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  preferredChannel: z.enum(["sms", "mms", "whatsapp", "rcs", "apple_business_chat", "meta_messenger", "instagram", "website_chat", "phone"]),
  destination: z.string().trim().max(500).optional(),
  prefilledMessage: z.string().trim().min(2).max(1200),
  source: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(200).optional(),
  adReference: z.string().trim().max(200).optional(),
  fallbackUrl: z.string().trim().url().max(1000).optional().or(z.literal(""))
});

const conversionFeedbackDestinationSchema = z.object({
  brandId: z.string().uuid(),
  pixelId: z.string().trim().regex(/^\d{5,30}$/),
  apiVersion: z.string().trim().regex(/^v\d{2,3}\.\d$/),
  requestedStatus: z.enum(["active", "paused"]),
  requiresManualApproval: z.enum(["true", "false"])
});

export async function configureMetaConversionFeedbackAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = conversionFeedbackDestinationSchema.parse(Object.fromEntries(formData));
  const workspaceId = await getCurrentWorkspaceId();
  const [brand, credentials] = await Promise.all([
    queryPostgres<{ id: string }>(`select id from public.brands where tenant_id=$1 and id=$2 and status='active' limit 1`, [workspaceId, parsed.brandId]),
    queryPostgres<{ ready: boolean }>(
      `select exists(select 1 from public.tenant_provider_credentials
        where tenant_id=$1 and provider_key='facebook' and credential_label='capi_access_token' and status='configured') ready`,
      [workspaceId]
    )
  ]);
  if (!brand?.rows[0]) throw new Error("Business not found in this workspace.");
  const credentialReady = Boolean(credentials?.rows[0]?.ready);
  const status = parsed.requestedStatus === "paused" ? "paused" : credentialReady ? "active" : "configured";
  const supportedEventTypes = ["conversation_started", "reply_received", "qualified_lead", "appointment_booked", "estimate_sent", "estimate_accepted", "sale_closed", "job_completed", "payment_collected", "review_created"];
  await queryPostgres(
    `insert into public.conversion_feedback_destinations
      (tenant_id,brand_id,provider_key,status,supported_event_types,requires_manual_approval,config_json,last_verified_at,last_error)
     values ($1,$2,'meta',$3,$4,$5,$6::jsonb,case when $7 then now() else null end,
       case when $7 then null else 'Save a facebook / capi_access_token credential in the encrypted vault before activation.' end)
     on conflict (tenant_id,brand_id,provider_key) do update set status=excluded.status,
       supported_event_types=excluded.supported_event_types,requires_manual_approval=excluded.requires_manual_approval,
       config_json=excluded.config_json,last_verified_at=excluded.last_verified_at,last_error=excluded.last_error,updated_at=now()`,
    [workspaceId, parsed.brandId, status, supportedEventTypes, parsed.requiresManualApproval === "true",
      JSON.stringify({ pixelId: parsed.pixelId, apiVersion: parsed.apiVersion }), credentialReady]
  );
  revalidatePath("/app/growth");
}

export async function createConversationAcquisitionLinkAction(formData: FormData) {
  await requirePermission("brand:manage");
  const parsed = conversationLinkSchema.parse(Object.fromEntries(formData));
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const brand = await queryPostgres<{ id: string }>(
    `select id from public.brands where tenant_id=$1 and id=$2 and status='active' limit 1`,
    [workspaceId, parsed.brandId]
  );
  if (!brand?.rows[0]) throw new Error("Business not found in this workspace.");
  await createConversationAcquisitionLink({
    tenantId: workspaceId,
    brandId: parsed.brandId,
    userId: session?.userId ?? null,
    name: parsed.name,
    preferredChannel: parsed.preferredChannel,
    destination: parsed.destination || null,
    prefilledMessage: parsed.prefilledMessage,
    source: parsed.source || null,
    campaign: parsed.campaign || null,
    adReference: parsed.adReference || null,
    fallbackUrl: parsed.fallbackUrl || null
  });
  revalidatePath("/app/growth");
}

const communitySchema = z.object({
  brandId: z.string().uuid(),
  channelKey: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  url: z.string().trim().url().max(1000).optional().or(z.literal("")),
  geography: z.string().trim().max(240).optional(),
  relevanceScore: z.coerce.number().int().min(0).max(100),
  rulesText: z.string().trim().max(5000).optional()
});

const communityPostSchema = z.object({
  communityId: z.string().uuid(),
  body: z.string().trim().min(20).max(10_000)
});

const communityJoinSchema = z.object({ communityId: z.string().uuid() });

const opportunitySchema = z.object({
  brandId: z.string().uuid(),
  channelKey: z.string().trim().min(1).max(80),
  sourceUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  bodyExcerpt: z.string().trim().min(8).max(4000),
  serviceFocus: z.string().trim().max(160).optional(),
  geography: z.string().trim().max(240).optional(),
  suggestedResponse: z.string().trim().max(4000).optional(),
  authorLabel: z.string().trim().max(160).optional(),
  externalActorId: z.string().trim().max(500).optional()
});

async function insertTimeline(input: {
  tenantId: string;
  brandId?: string | null;
  family: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10::uuid, $11::jsonb)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      input.family,
      input.type,
      input.title,
      input.body ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.sourceTable ?? null,
      input.sourceId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function scanGrowthLoopAction() {
  await requirePermission("ai:queue");
  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);

  const counts = await queryPostgres<{
    stale_leads: string;
    ignored_estimates: string;
    seo_drafts_without_quality: string;
    approved_without_queue: string;
    completed_jobs_without_reviews: string;
    unattributed_leads: string;
    overdue_invoices: string;
    missing_page_coverage: string;
  }>(
    `
    select
      (select count(*) from public.leads where tenant_id = $1 and status in ('new', 'contacted') and created_at < now() - interval '2 days') as stale_leads,
      (select count(*) from public.service_estimates where tenant_id = $1 and status = 'sent_manually' and created_at < now() - interval '3 days') as ignored_estimates,
      (
        select count(*)
        from public.ai_drafts d
        where d.tenant_id = $1
          and d.content_type in ('blog', 'city_page', 'service_page', 'gbp_post')
          and not exists (select 1 from public.content_quality_reviews q where q.draft_id = d.id)
      ) as seo_drafts_without_quality,
      (
        select count(*)
        from public.ai_drafts d
        where d.tenant_id = $1
          and d.status = 'approved'
          and not exists (select 1 from public.publishing_queue q where q.draft_id = d.id)
      ) as approved_without_queue,
      (
        select count(*)
        from public.service_jobs j
        where j.tenant_id = $1
          and j.status = 'completed'
          and not exists (select 1 from public.review_request_workflows r where r.job_id = j.id)
      ) as completed_jobs_without_reviews,
      (
        select count(*)
        from public.leads l
        where l.tenant_id = $1
          and not exists (
            select 1
            from public.growth_attribution_events e
            where e.entity_type = 'lead' and e.entity_id = l.id
          )
      ) as unattributed_leads,
      (
        select count(*)
        from public.service_invoices i
        where i.tenant_id = $1
          and i.status in ('sent_manually', 'partially_paid', 'overdue')
          and coalesce(i.due_date, i.created_at::date) <= current_date
          and i.amount_paid_cents < i.total_cents
      ) as overdue_invoices,
      (
        select count(*)
        from public.brands b
        join public.brand_services s on s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true
        left join public.brand_locations loc on loc.tenant_id = b.tenant_id and loc.brand_id = b.id and loc.active = true
        where b.tenant_id = $1 and b.status = 'active'
          and not exists (
            select 1
            from public.brand_landing_pages p
            where p.tenant_id = b.tenant_id
              and p.brand_id = b.id
              and p.status <> 'archived'
              and (
                p.primary_keyword ilike '%' || s.name || '%'
                or p.title ilike '%' || s.name || '%'
              )
              and (
                loc.city is null
                or p.title ilike '%' || loc.city || '%'
                or p.primary_keyword ilike '%' || loc.city || '%'
              )
          )
      ) as missing_page_coverage
    `,
    [workspaceId]
  );

  const row = counts?.rows[0];
  const insights = [
    {
      key: "seo-quality-review-backlog",
      type: "content_quality",
      severity: Number(row?.seo_drafts_without_quality ?? 0) > 10 ? "high" : "medium",
      count: Number(row?.seo_drafts_without_quality ?? 0),
      title: "SEO drafts need quality review",
      summary: "Draft content should be scored for usefulness, local relevance, originality, and conversion clarity before publishing.",
      recommendation: "Review the queue and block thin, generic, or unsupported pages before they can become publishing candidates.",
      actionHref: "/app/growth"
    },
    {
      key: "approved-content-not-queued",
      type: "publishing_consistency",
      severity: "medium",
      count: Number(row?.approved_without_queue ?? 0),
      title: "Approved content is not queued",
      summary: "Approved growth assets should move into a publishing queue so consistency does not depend on memory.",
      recommendation: "Queue approved drafts for manual publishing or provider-connected scheduling.",
      actionHref: "/app/growth"
    },
    {
      key: "stale-lead-recovery",
      type: "lead_recovery",
      severity: Number(row?.stale_leads ?? 0) > 5 ? "high" : "medium",
      count: Number(row?.stale_leads ?? 0),
      title: "Stale leads need recovery",
      summary: "Leads older than two days without a win/loss outcome are a revenue leak.",
      recommendation: "Create follow-up workflows for stale leads and track recovery by source.",
      actionHref: "/app/growth"
    },
    {
      key: "completed-jobs-review-flow",
      type: "review_flow",
      severity: "medium",
      count: Number(row?.completed_jobs_without_reviews ?? 0),
      title: "Completed jobs need review requests",
      summary: "Review flow compounds local authority and supports conversion.",
      recommendation: "Draft review requests for completed jobs, with negative feedback routed into service recovery.",
      actionHref: "/app/growth"
    },
    {
      key: "unattributed-leads",
      type: "conversion_tracking",
      severity: "medium",
      count: Number(row?.unattributed_leads ?? 0),
      title: "Leads need closed-loop attribution",
      summary: "Ferocity cannot learn which SEO pages and campaigns produce revenue unless leads are tied to growth sources.",
      recommendation: "Map lead source, source detail, city, service, and campaign into attribution events.",
      actionHref: "/app/growth"
    },
    {
      key: "seo-page-coverage",
      type: "seo_compounding",
      severity: Number(row?.missing_page_coverage ?? 0) > 10 ? "high" : "medium",
      count: Number(row?.missing_page_coverage ?? 0),
      title: "Service-area pages need coverage",
      summary: "Some services and locations do not appear to have enough page coverage yet.",
      recommendation: "Create useful city/service pages with real local proof, clear next steps, and internal links.",
      actionHref: "/app/growth"
    },
    {
      key: "invoice-follow-up-needed",
      type: "invoice_followup",
      severity: Number(row?.overdue_invoices ?? 0) > 5 ? "high" : "medium",
      count: Number(row?.overdue_invoices ?? 0),
      title: "Invoices need payment follow-up",
      summary: "Unpaid invoices at or past their due date should become reviewed follow-up work, not memory work.",
      recommendation: "Create invoice follow-up workflows, review the message, then send manually or through a connected provider.",
      actionHref: "/app/growth"
    }
  ];

  for (const insight of insights.filter((item) => item.count > 0)) {
    await queryPostgres(
      `
      insert into public.growth_operator_insights (
        tenant_id, insight_key, insight_type, severity, title, summary, recommendation, impact_estimate, action_href, metadata_json, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'medium', $8, $9::jsonb, now())
      on conflict (tenant_id, insight_key) do update
      set severity = excluded.severity,
          status = case when public.growth_operator_insights.status = 'resolved' then 'open' else public.growth_operator_insights.status end,
          summary = excluded.summary,
          recommendation = excluded.recommendation,
          metadata_json = excluded.metadata_json,
          detected_at = now(),
          updated_at = now()
      `,
      [
        workspaceId,
        insight.key,
        insight.type,
        insight.severity,
        insight.title,
        `${insight.summary} Current count: ${insight.count}.`,
        insight.recommendation,
        insight.actionHref,
        JSON.stringify({ count: insight.count, scan: "growth_loop" })
      ]
    );
  }

  await queryPostgres(
    `
    insert into public.seo_page_opportunities (
      tenant_id,
      brand_id,
      opportunity_type,
      page_type,
      title,
      target_keyword,
      service_focus,
      city_focus,
      target_url,
      priority_score,
      reason,
      next_step,
      metadata_json,
      due_at
    )
    select
      b.tenant_id,
      b.id,
      'create_city_service_page',
      'city_page',
      concat(s.name, ' in ', coalesce(loc.city, loc.service_area_name, b.primary_location, 'service area')),
      lower(concat(s.name, ' ', coalesce(loc.city, loc.service_area_name, b.primary_location, 'near me'))),
      s.name,
      coalesce(loc.city, loc.service_area_name, b.primary_location),
      concat('/', lower(regexp_replace(concat(s.name, '-', coalesce(loc.city, loc.service_area_name, b.primary_location, 'service-area')), '[^a-zA-Z0-9]+', '-', 'g'))),
      least(95, 55 + (s.priority * 5) + coalesce(loc.priority * 3, 0)),
      'This service/location combination does not appear to have strong page coverage yet.',
      'Draft a useful page with real service details, local proof, FAQs, internal links, and one clear call to action.',
      jsonb_build_object('createdByScan', 'growth_loop', 'providerReadyOnly', true),
      now() + interval '7 days'
    from public.brands b
    join public.brand_services s on s.tenant_id = b.tenant_id and s.brand_id = b.id and s.active = true
    left join public.brand_locations loc on loc.tenant_id = b.tenant_id and loc.brand_id = b.id and loc.active = true
    where b.tenant_id = $1 and b.status = 'active'
      and not exists (
        select 1
        from public.brand_landing_pages p
        where p.tenant_id = b.tenant_id
          and p.brand_id = b.id
          and p.status <> 'archived'
          and (
            p.primary_keyword ilike '%' || s.name || '%'
            or p.title ilike '%' || s.name || '%'
          )
          and (
            loc.city is null
            or p.title ilike '%' || loc.city || '%'
            or p.primary_keyword ilike '%' || loc.city || '%'
          )
      )
    order by s.priority desc, loc.priority desc nulls last
    limit 100
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.seo_page_opportunities (
      tenant_id,
      brand_id,
      opportunity_type,
      page_type,
      title,
      target_keyword,
      current_url,
      target_url,
      priority_score,
      reason,
      next_step,
      metadata_json,
      due_at
    )
    select
      p.tenant_id,
      p.brand_id,
      'refresh_existing_page',
      case when p.page_type in ('service_page', 'city_page', 'blog', 'landing_page') then p.page_type else 'other' end,
      concat('Refresh: ', p.title),
      p.primary_keyword,
      p.slug,
      p.slug,
      68,
      'Existing page is still active and should be refreshed with better proof, clearer next steps, and updated internal links.',
      'Review traffic/conversion data when connected, then improve usefulness and conversion clarity before republishing manually.',
      jsonb_build_object('createdByScan', 'growth_loop', 'refreshCandidate', true),
      now() + interval '14 days'
    from public.brand_landing_pages p
    where p.tenant_id = $1
      and p.status in ('published', 'draft')
      and not exists (
        select 1
        from public.seo_page_opportunities o
        where o.tenant_id = p.tenant_id
          and o.brand_id = p.brand_id
          and o.opportunity_type = 'refresh_existing_page'
          and o.target_url = p.slug
          and o.status in ('open', 'planned', 'draft_created', 'in_review')
      )
    order by p.updated_at asc nulls first, p.created_at asc
    limit 50
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.marketing_conversion_targets (
      tenant_id, brand_id, target_key, label, source_family, target_type, target_value, period, metadata_json
    )
    select b.tenant_id, b.id, target_key, label, source_family, target_type, target_value, 'monthly', metadata_json
    from public.brands b
    cross join (
      values
        ('organic_leads', 'Organic leads', 'organic', 'lead', 20, '{"plainRule":"Track SEO and website leads."}'::jsonb),
        ('gbp_calls', 'GBP calls', 'gbp', 'call', 15, '{"plainRule":"Track Google Business Profile calls when connected."}'::jsonb),
        ('review_flow', 'New reviews', 'manual', 'review', 8, '{"plainRule":"Ask real customers for reviews after completed work."}'::jsonb),
        ('booked_jobs', 'Booked jobs from marketing', 'unknown', 'booked_job', 10, '{"plainRule":"Tie leads to jobs before optimizing spend."}'::jsonb)
    ) defaults(target_key, label, source_family, target_type, target_value, metadata_json)
    where b.tenant_id = $1 and b.status = 'active'
    on conflict (tenant_id, brand_id, target_key) do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.content_quality_reviews (
      tenant_id, brand_id, draft_id, quality_status, usefulness_score, local_relevance_score,
      originality_score, conversion_clarity_score, risk_flags, metadata_json
    )
    select d.tenant_id, d.brand_id, d.id, 'needs_review',
      case when length(d.body) >= 1800 then 72 else 45 end,
      case when d.metadata_json ? 'keyword' then 70 else 50 end,
      case when length(d.body) >= 1200 then 65 else 40 end,
      case when d.body ilike '%call to action:%' or d.body ilike '%next step%' then 70 else 45 end,
      case
        when length(d.body) < 900 then array['thin_content']::text[]
        when d.body ilike '%guarantee%' then array['claim_review']::text[]
        else array[]::text[]
      end,
      jsonb_build_object('createdByScan', 'growth_loop')
    from public.ai_drafts d
    where d.tenant_id = $1
      and d.content_type in ('blog', 'city_page', 'service_page', 'gbp_post')
      and not exists (select 1 from public.content_quality_reviews q where q.draft_id = d.id)
    limit 100
    on conflict (draft_id) do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.publishing_queue (tenant_id, brand_id, draft_id, target_platform, queue_status, provider_status, metadata_json)
    select d.tenant_id, d.brand_id, d.id,
      case when d.content_type = 'gbp_post' then 'google_business_profile' else 'website' end,
      'needs_approval',
      'not_connected',
      jsonb_build_object('createdByScan', 'growth_loop', 'providerReadyOnly', true)
    from public.ai_drafts d
    join public.content_quality_reviews quality
      on quality.tenant_id = d.tenant_id
     and quality.draft_id = d.id
     and quality.quality_status = 'passed'
    where d.tenant_id = $1
      and d.status = 'approved'
      and not exists (select 1 from public.publishing_queue q where q.draft_id = d.id)
    limit 100
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, 'stale_lead_recovery', 'manual', 'open', now(),
      'Follow up with a useful, specific message. Reference the original request and ask one clear next-step question.',
      jsonb_build_object('createdByScan', 'growth_loop', 'leadStatus', l.status)
    from public.leads l
    where l.tenant_id = $1
      and l.status in ('new', 'contacted')
      and l.created_at < now() - interval '2 days'
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = l.tenant_id and f.lead_id = l.id and f.workflow_type = 'stale_lead_recovery' and f.status in ('open', 'scheduled')
      )
    limit 100
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, customer_id, invoice_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select i.tenant_id, i.brand_id, i.customer_id, i.id, 'invoice_followup', 'manual', 'open', now(),
      'Follow up politely about the unpaid invoice. Mention the invoice title, balance due, and one clear next step for payment or questions.',
      jsonb_build_object(
        'createdByScan', 'growth_loop',
        'invoiceStatus', i.status,
        'balanceDueCents', greatest(i.total_cents - i.amount_paid_cents, 0),
        'dueDate', i.due_date
      )
    from public.service_invoices i
    where i.tenant_id = $1
      and i.status in ('sent_manually', 'partially_paid', 'overdue')
      and coalesce(i.due_date, i.created_at::date) <= current_date
      and i.amount_paid_cents < i.total_cents
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = i.tenant_id and f.invoice_id = i.id and f.workflow_type = 'invoice_followup' and f.status in ('open', 'scheduled')
      )
    limit 100
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, customer_id, lead_id, job_id, trigger_event, channel, status, scheduled_for, negative_interception_status, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, j.source_lead_id, j.id, 'job_completed', 'manual', 'draft',
      now() + interval '1 day', 'not_applicable', jsonb_build_object('createdByScan', 'growth_loop')
    from public.service_jobs j
    where j.tenant_id = $1
      and j.status = 'completed'
      and not exists (select 1 from public.review_request_workflows r where r.job_id = j.id)
    limit 100
    `,
    [workspaceId]
  );

  await insertTimeline({
    tenantId: workspaceId,
    family: "marketing",
    type: "growth_loop_scan",
    title: "Growth loop scan completed",
    body: "Ferocity checked content quality, publishing readiness, stale lead recovery, invoice follow-up, review flow, and attribution gaps.",
    metadata: row ?? {}
  });

  const department = await runAiGrowthDepartment({
    tenantId: workspaceId,
    userId: session?.userId ?? null,
    maxActions: 5
  });

  await insertTimeline({
    tenantId: workspaceId,
    family: "marketing",
    type: "ai_growth_department_scan",
    title: `Ferocity found ${department.worthwhile} worthwhile growth actions`,
    body: `${department.handledAutomatically} handled safely, ${department.needsApproval} need approval, and ${department.needsOwner} need the owner personally.`,
    metadata: { ...department, actions: department.actions.map(({ key, title, ownerInvolvement }) => ({ key, title, ownerInvolvement })) }
  });

  revalidatePath("/app/growth");
  revalidatePath("/app/alerts");
}

export async function prepareGrowthContentPackageAction(formData: FormData) {
  await requirePermission("ai:queue");
  const recommendationId = z.string().uuid().safeParse(formData.get("recommendationId"));
  if (!recommendationId.success) return;
  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const result = await prepareAiContentPackage({ tenantId: workspaceId, recommendationId: recommendationId.data, userId: session?.userId ?? null });
  await insertTimeline({ tenantId: workspaceId, family: "marketing", type: "organic_content_package_prepared", title: result.created ? `Prepared an organic content package with ${result.outputs} concepts` : "Organic content package already exists", body: "Ferocity used the Growth Department's evidence, Brand Voice, approved assets, customer signals, and platform context. Every concept remains in review; no content was published and no ad spend was authorized.", entityType: "content_campaign", entityId: result.campaignId, sourceTable: "content_studio_campaigns", sourceId: result.campaignId, metadata: { organicFirst: true, noPaidSpendAuthorized: true } });
  revalidatePath("/app/growth");
  revalidatePath("/app/marketing-os");
}

export async function updateContentQualityReviewAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const parsed = qualityReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    qualityStatus: formData.get("qualityStatus"),
    usefulnessScore: formData.get("usefulnessScore"),
    localRelevanceScore: formData.get("localRelevanceScore"),
    originalityScore: formData.get("originalityScore"),
    conversionClarityScore: formData.get("conversionClarityScore"),
    reviewerNotes: formData.get("reviewerNotes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const result = await queryPostgres<{ brand_id: string; draft_id: string; title: string | null }>(
    `
    update public.content_quality_reviews q
    set quality_status = $3,
        usefulness_score = $4,
        local_relevance_score = $5,
        originality_score = $6,
        conversion_clarity_score = $7,
        reviewer_notes = $8,
        reviewed_by_user_id = $9,
        reviewed_at = now(),
        updated_at = now()
    from public.ai_drafts d
    where q.tenant_id = $1 and q.id = $2 and d.id = q.draft_id
    returning q.brand_id, q.draft_id, d.title
    `,
    [
      workspaceId,
      parsed.data.reviewId,
      parsed.data.qualityStatus,
      parsed.data.usefulnessScore,
      parsed.data.localRelevanceScore,
      parsed.data.originalityScore,
      parsed.data.conversionClarityScore,
      parsed.data.reviewerNotes ?? "",
      session?.userId ?? null
    ]
  );
  const row = result?.rows[0];
  if (row) {
    await insertTimeline({
      tenantId: workspaceId,
      brandId: row.brand_id,
      family: "content",
      type: "quality_review",
      title: `Content quality marked ${parsed.data.qualityStatus}`,
      body: row.title ?? "Untitled draft",
      entityType: "draft",
      entityId: row.draft_id,
      sourceTable: "content_quality_reviews",
      sourceId: parsed.data.reviewId,
      metadata: parsed.data
    });
  }
  revalidatePath("/app/growth");
}

export async function updatePublishingQueueAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const parsed = queueStatusSchema.safeParse({
    queueId: formData.get("queueId"),
    queueStatus: formData.get("queueStatus"),
    scheduledFor: formData.get("scheduledFor")?.toString() || undefined
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null;
  const result = await queryPostgres<{ brand_id: string; draft_id: string | null }>(
    `
    update public.publishing_queue
    set queue_status = $3,
        scheduled_for = coalesce($4::timestamptz, scheduled_for),
        approved_at = case when $3 in ('approved', 'scheduled') then coalesce(approved_at, now()) else approved_at end,
        published_at = case when $3 = 'published_manually' then coalesce(published_at, now()) else published_at end,
        updated_at = now()
    where tenant_id = $1 and id = $2
      and (
        $3 not in ('approved', 'scheduled')
        or exists (
          select 1 from public.content_quality_reviews quality
          where quality.tenant_id = public.publishing_queue.tenant_id
            and quality.draft_id = public.publishing_queue.draft_id
            and quality.quality_status = 'passed'
        )
      )
    returning brand_id, draft_id
    `,
    [workspaceId, parsed.data.queueId, parsed.data.queueStatus, scheduledFor]
  );
  const row = result?.rows[0];
  if (row) {
    await insertTimeline({
      tenantId: workspaceId,
      brandId: row.brand_id,
      family: "marketing",
      type: "publishing_queue",
      title: `Publishing queue marked ${parsed.data.queueStatus}`,
      body: "External publishing remains manual/provider-ready until credentials are connected.",
      entityType: row.draft_id ? "draft" : "publishing_queue",
      entityId: row.draft_id ?? parsed.data.queueId,
      sourceTable: "publishing_queue",
      sourceId: parsed.data.queueId,
      metadata: { status: parsed.data.queueStatus, scheduledFor }
    });
  }
  revalidatePath("/app/growth");
}

export async function updateFollowUpWorkflowAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = workflowStatusSchema.safeParse({
    workflowId: formData.get("workflowId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.follow_up_workflows
    set status = $3,
        completed_at = case when $3 = 'completed' then now() else completed_at end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.workflowId, parsed.data.status]
  );
  await insertTimeline({
    tenantId: workspaceId,
    family: "follow_up",
    type: "workflow_status",
    title: `Follow-up marked ${parsed.data.status}`,
    sourceTable: "follow_up_workflows",
    sourceId: parsed.data.workflowId,
    metadata: { status: parsed.data.status }
  });
  revalidatePath("/app/growth");
}

export async function updateGrowthInsightAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = insightStatusSchema.safeParse({
    insightId: formData.get("insightId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.growth_operator_insights
    set status = $3,
        resolved_at = case when $3 in ('resolved', 'dismissed') then now() else resolved_at end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.insightId, parsed.data.status]
  );
  revalidatePath("/app/growth");
}

export async function updateSeoOpportunityAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = seoOpportunityStatusSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ brand_id: string; title: string }>(
    `
    update public.seo_page_opportunities
    set status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    returning brand_id, title
    `,
    [workspaceId, parsed.data.opportunityId, parsed.data.status]
  );
  const row = result?.rows[0];
  if (row) {
    await insertTimeline({
      tenantId: workspaceId,
      brandId: row.brand_id,
      family: "seo",
      type: "page_opportunity_status",
      title: `SEO opportunity marked ${parsed.data.status}`,
      body: row.title,
      entityType: "seo_page_opportunity",
      entityId: parsed.data.opportunityId,
      sourceTable: "seo_page_opportunities",
      sourceId: parsed.data.opportunityId,
      metadata: { status: parsed.data.status }
    });
  }
  revalidatePath("/app/growth");
  revalidatePath("/app/seo");
}

export async function createGrowthObjectiveAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = objectiveSchema.safeParse({
    brandId: formData.get("brandId"), name: formData.get("name"), serviceFocus: formData.get("serviceFocus") || undefined,
    geography: formData.get("geography") || undefined, targetLeads: formData.get("targetLeads") || undefined,
    targetRevenueDollars: formData.get("targetRevenueDollars") || undefined, timeHorizonDays: formData.get("timeHorizonDays"),
    targetCollectedRevenueDollars: formData.get("targetCollectedRevenueDollars") || undefined,
    targetGrossProfitDollars: formData.get("targetGrossProfitDollars") || undefined,
    averageJobValueDollars: formData.get("averageJobValueDollars") || undefined,
    costPerLeadDollars: formData.get("costPerLeadDollars") || undefined,
    grossMarginTargetPercent: formData.get("grossMarginTargetPercent") || undefined,
    minimumGrossMarginPercent: formData.get("minimumGrossMarginPercent") || undefined,
    maximumCacDollars: formData.get("maximumCacDollars") || undefined,
    minimumRoas: formData.get("minimumRoas") || undefined,
    monthlyJobCapacity: formData.get("monthlyJobCapacity") || undefined,
    maximumBacklogJobs: formData.get("maximumBacklogJobs") || undefined,
    autonomyLevel: formData.get("autonomyLevel")
  });
  if (!parsed.success) return;
  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const collectedTargetCents = parsed.data.targetCollectedRevenueDollars == null
    ? (parsed.data.targetRevenueDollars == null ? 0 : Math.round(parsed.data.targetRevenueDollars * 100))
    : Math.round(parsed.data.targetCollectedRevenueDollars * 100);
  const initialPlan = buildReverseRevenuePlan({
    targetCollectedRevenueCents: collectedTargetCents,
    targetGrossProfitCents: parsed.data.targetGrossProfitDollars == null ? null : Math.round(parsed.data.targetGrossProfitDollars * 100),
    averageCollectedJobCents: parsed.data.averageJobValueDollars == null ? null : Math.round(parsed.data.averageJobValueDollars * 100),
    grossMarginRate: parsed.data.grossMarginTargetPercent == null ? null : parsed.data.grossMarginTargetPercent / 100,
    costPerLeadCents: parsed.data.costPerLeadDollars == null ? null : Math.round(parsed.data.costPerLeadDollars * 100),
    availableJobCapacity: parsed.data.monthlyJobCapacity
  });
  const row = await queryPostgres<{ id: string }>(`
    insert into public.growth_objectives (
      tenant_id, brand_id, name, service_focus, geography_json, target_leads, target_revenue_cents,
      target_collected_revenue_cents, target_gross_profit_cents, average_job_value_cents, cost_per_lead_cents,
      gross_margin_target_bps, minimum_gross_margin_bps, maximum_cac_cents, minimum_roas_milli,
      monthly_job_capacity, maximum_backlog_jobs, time_horizon_days, autonomy_level, status, created_by_user_id, metadata_json
    ) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active',$20,$21::jsonb)
    returning id
  `, [workspaceId, parsed.data.brandId, parsed.data.name, parsed.data.serviceFocus ?? null,
    JSON.stringify(parsed.data.geography ? { description: parsed.data.geography } : {}), parsed.data.targetLeads ?? null,
    parsed.data.targetRevenueDollars == null ? null : Math.round(parsed.data.targetRevenueDollars * 100),
    collectedTargetCents || null,
    parsed.data.targetGrossProfitDollars == null ? null : Math.round(parsed.data.targetGrossProfitDollars * 100),
    parsed.data.averageJobValueDollars == null ? null : Math.round(parsed.data.averageJobValueDollars * 100),
    parsed.data.costPerLeadDollars == null ? null : Math.round(parsed.data.costPerLeadDollars * 100),
    parsed.data.grossMarginTargetPercent == null ? null : Math.round(parsed.data.grossMarginTargetPercent * 100),
    parsed.data.minimumGrossMarginPercent == null ? null : Math.round(parsed.data.minimumGrossMarginPercent * 100),
    parsed.data.maximumCacDollars == null ? null : Math.round(parsed.data.maximumCacDollars * 100),
    parsed.data.minimumRoas == null ? null : Math.round(parsed.data.minimumRoas * 1000),
    parsed.data.monthlyJobCapacity ?? null, parsed.data.maximumBacklogJobs ?? null,
    parsed.data.timeHorizonDays, parsed.data.autonomyLevel, session?.userId ?? null,
    JSON.stringify({ initialReversePlan: initialPlan, planGeneratedAt: new Date().toISOString() })]);
  if (row?.rows[0]) await insertTimeline({
    tenantId: workspaceId, brandId: parsed.data.brandId, family: "marketing", type: "growth_objective_created",
    title: `Growth objective started: ${parsed.data.name}`, body: "Ferocity can now rank growth work against this objective.",
    entityType: "growth_objective", entityId: row.rows[0].id, sourceTable: "growth_objectives", sourceId: row.rows[0].id,
    metadata: { autonomyLevel: parsed.data.autonomyLevel, timeHorizonDays: parsed.data.timeHorizonDays }
  });
  if (row?.rows[0]) await recordGrowthEvent({
    tenantId: workspaceId, brandId: parsed.data.brandId, objectiveId: row.rows[0].id,
    eventType: "growth_objective_created", automationMode: parsed.data.autonomyLevel,
    outcome: "active", dimensions: { timeHorizonDays: parsed.data.timeHorizonDays, serviceFocus: parsed.data.serviceFocus, geography: parsed.data.geography },
    idempotencyKey: `objective-created:${row.rows[0].id}`
  });
  revalidatePath("/app/growth");
}

export async function addDistributionIdentityAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = identitySchema.safeParse({
    brandId: formData.get("brandId"), channelKey: formData.get("channelKey"), displayName: formData.get("displayName"),
    profileUrl: formData.get("profileUrl") || "", identityRole: formData.get("identityRole"), autonomyLevel: formData.get("autonomyLevel")
  });
  if (!parsed.success) return;
  const channel = getGrowthChannel(parsed.data.channelKey);
  if (!channel) return;
  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(`
    insert into public.growth_distribution_identities (
      tenant_id, brand_id, provider_account_id, channel_key, provider_key, display_name, profile_url,
      connection_mode, capability_keys, authorization_status, identity_role, autonomy_level, risk_state, metadata_json
    ) values (
      $1, $2, (select id from public.provider_accounts where tenant_id = $1 and provider_key = $4 limit 1),
      $3, $4, $5, $6, $7, $8::text[], 'not_connected', $9, $10, 'healthy', $11::jsonb
    )
    on conflict (tenant_id, brand_id, channel_key, provider_key, display_name) do update set
      profile_url = excluded.profile_url, connection_mode = excluded.connection_mode,
      capability_keys = excluded.capability_keys, identity_role = excluded.identity_role,
      autonomy_level = excluded.autonomy_level, updated_at = now()
  `, [workspaceId, parsed.data.brandId, parsed.data.channelKey, channel.providerKey, parsed.data.displayName,
    parsed.data.profileUrl || null, channel.defaultMode, supportedCapabilities(parsed.data.channelKey), parsed.data.identityRole,
    parsed.data.identityRole === "personal" ? "suggest" : parsed.data.autonomyLevel,
    JSON.stringify({ capabilitySource: "ferocity_registry", capabilityNote: channel.note })]);
  revalidatePath("/app/growth");
}

export async function addGrowthCommunityAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = communitySchema.safeParse({
    brandId: formData.get("brandId"), channelKey: formData.get("channelKey"), name: formData.get("name"),
    url: formData.get("url") || "", geography: formData.get("geography") || undefined,
    relevanceScore: formData.get("relevanceScore"), rulesText: formData.get("rulesText") || undefined
  });
  if (!parsed.success || !getGrowthChannel(parsed.data.channelKey)) return;
  const workspaceId = await getCurrentWorkspaceId();
  const community = await queryPostgres<{ id: string }>(`
    insert into public.growth_communities (
      tenant_id, brand_id, channel_key, name, url, geography_json, relevance_score, rules_text,
      rules_checked_at, posting_policy, status, metadata_json
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, case when $8 is null then null else now() end,
      case when $8 is null then 'suggest_only' else 'approval_required' end, 'active', '{"provenance":"owner_supplied"}'::jsonb)
    on conflict (tenant_id, brand_id, channel_key, name) do update set
      url = excluded.url, geography_json = excluded.geography_json, relevance_score = excluded.relevance_score,
      rules_text = excluded.rules_text, rules_checked_at = excluded.rules_checked_at,
      posting_policy = case when excluded.rules_text is not null and public.growth_communities.posting_policy='suggest_only'
        then 'approval_required' else public.growth_communities.posting_policy end, updated_at = now()
    returning id
  `, [workspaceId, parsed.data.brandId, parsed.data.channelKey, parsed.data.name, parsed.data.url || null,
    JSON.stringify(parsed.data.geography ? { description: parsed.data.geography } : {}), parsed.data.relevanceScore,
    parsed.data.rulesText ?? null]);
  if (community?.rows[0]) {
    const communityId = community.rows[0].id;
    await recordGrowthEvent({ tenantId: workspaceId, brandId: parsed.data.brandId, communityId,
      eventType: "community_discovered", channelKey: parsed.data.channelKey, outcome: "remembered",
      dimensions: { relevanceScore: parsed.data.relevanceScore, geography: parsed.data.geography }, idempotencyKey: `community-discovered:${communityId}` });
    await recordGrowthEvent({ tenantId: workspaceId, brandId: parsed.data.brandId, communityId,
      eventType: "community_evaluated", channelKey: parsed.data.channelKey, outcome: parsed.data.relevanceScore >= 50 ? "relevant" : "low_relevance",
      dimensions: { relevanceScore: parsed.data.relevanceScore }, idempotencyKey: `community-evaluated:${communityId}:${parsed.data.relevanceScore}` });
    if (parsed.data.rulesText) await recordGrowthEvent({ tenantId: workspaceId, brandId: parsed.data.brandId, communityId,
      eventType: "community_rule_detected", channelKey: parsed.data.channelKey, outcome: "owner_supplied",
      dimensions: { ruleLength: parsed.data.rulesText.length }, idempotencyKey: `community-rules:${communityId}:${parsed.data.rulesText.length}` });
  }
  revalidatePath("/app/growth");
}

export async function queueFacebookCommunityPostAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = communityPostSchema.safeParse({ communityId: formData.get("communityId"), body: formData.get("body") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const context = await queryPostgres<{
    id: string; brand_id: string; identity_id: string; name: string; url: string; rules_checked_at: string; rules_text: string;
  }>(`
    select c.id,c.brand_id,i.id identity_id,c.name,c.url,c.rules_checked_at::text,c.rules_text
    from public.growth_communities c
    join lateral (
      select id from public.growth_distribution_identities
      where tenant_id=c.tenant_id and brand_id=c.brand_id and channel_key='facebook'
        and authorization_status='connected' and risk_state='healthy'
        and verification_status in ('verified','not_required')
      order by case when id=c.identity_id then 0 else 1 end,updated_at desc limit 1
    ) i on true
    where c.tenant_id=$1 and c.id=$2 and c.channel_key='facebook' and c.status='active'
      and c.posting_policy in ('approval_required','autopilot_allowed')
      and c.url like 'https://%facebook.com/groups/%'
      and nullif(trim(c.rules_text),'') is not null
      and c.rules_checked_at >= now() - interval '30 days'
      and coalesce(c.metadata_json->>'membershipState','unknown')='joined'
      and (c.last_posted_at is null or c.last_posted_at + make_interval(hours => coalesce((c.metadata_json->>'minimumHoursBetweenPosts')::int,72)) <= now())
      and not exists (
        select 1 from public.growth_action_attempts recent
        where recent.tenant_id=c.tenant_id and recent.identity_id=i.id
          and recent.action_key='publish_group_post' and recent.status='succeeded'
          and recent.completed_at >= now() - interval '8 hours'
      )
      and not exists (
        select 1 from public.outbound_action_queue q
        where q.tenant_id=c.tenant_id and q.channel='facebook' and q.action_type='publish_content'
          and lower(trim(q.payload_json->>'body'))=lower(trim($3))
          and q.created_at >= now() - interval '90 days'
          and q.status not in ('failed','canceled')
      )
  `, [workspaceId, parsed.data.communityId, parsed.data.body]);
  const row = context?.rows[0];
  if (!row) return;

  const queued = await queryPostgres<{ action_id: string }>(`
    with queued_action as (
      insert into public.outbound_action_queue (
        tenant_id,brand_id,action_type,provider_key,status,risk_level,target_type,target_id,
        subject,recipient_label,payload_json,metadata_json
      ) values ($1,$2,'publish_content','facebook','needs_review','high','growth_community',$3,
        'Facebook group post',$4,$5::jsonb,$6::jsonb)
      returning id
    ), attempt as (
      insert into public.growth_action_attempts (
        tenant_id,brand_id,identity_id,community_id,queue_id,channel_key,action_key,execution_mode,
        status,risk_state,idempotency_key,strategy_version,payload_json
      ) select $1,$2,$7,$3,id,'facebook','publish_group_post','assisted_browser',
        'needs_approval','healthy',$8,'facebook-groups-assisted-v1',$9::jsonb from queued_action
      returning id
    ), requested as (
      insert into public.approvals (tenant_id,brand_id,target_type,target_id,status,risk_level,notes)
      select $1,$2,'growth_action',id,'pending','high',$10 from attempt
    ) select id action_id from attempt
  `, [workspaceId, row.brand_id, row.id, row.name, JSON.stringify({
    channelKey: "facebook", body: parsed.data.body, sourceUrl: row.url, rulesCheckedAt: row.rules_checked_at
  }), JSON.stringify({ executionMode: "assisted_browser", communityId: row.id, approvalFirst: true }), row.identity_id,
    `facebook-group-post:${row.id}:${crypto.randomUUID()}`, JSON.stringify({ rulesCheckedAt: row.rules_checked_at }),
    `Facebook group: ${row.name}\nRules checked: ${row.rules_checked_at}\n\nPrepared post:\n${parsed.data.body.slice(0, 2000)}\n\nSaved group rules:\n${row.rules_text.slice(0, 2000)}`]);
  const action = queued?.rows[0];
  if (action) {
    await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id, identityId: row.identity_id,
      communityId: row.id, actionAttemptId: action.action_id, eventType: "publish_queued", channelKey: "facebook",
      actionType: "publish_group_post", automationMode: "approve", outcome: "needs_approval",
      idempotencyKey: `facebook-group-post-queued:${action.action_id}` });
    await insertTimeline({ tenantId: workspaceId, brandId: row.brand_id, family: "marketing", type: "facebook_group_post_queued",
      title: `Facebook group post prepared for ${row.name}`,
      body: "Nothing was posted. The content is waiting in Approvals with the saved group rules and destination.",
      entityType: "growth_action", entityId: action.action_id, sourceTable: "growth_communities", sourceId: row.id });
  }
  revalidatePath("/app/growth");
  revalidatePath("/app/approvals");
}

export async function queueFacebookCommunityJoinAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = communityJoinSchema.safeParse({ communityId: formData.get("communityId") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const context = await queryPostgres<{ id: string; brand_id: string; identity_id: string; name: string; url: string }>(`
    select c.id,c.brand_id,i.id identity_id,c.name,c.url
    from public.growth_communities c
    join lateral (
      select id from public.growth_distribution_identities
      where tenant_id=c.tenant_id and brand_id=c.brand_id and channel_key='facebook'
        and authorization_status='connected' and risk_state='healthy'
        and verification_status in ('verified','not_required')
      order by updated_at desc limit 1
    ) i on true
    where c.tenant_id=$1 and c.id=$2 and c.channel_key='facebook' and c.status='active'
      and c.url like 'https://%facebook.com/groups/%'
      and coalesce(c.metadata_json->>'membershipState','unknown') in ('available','unknown')
      and not exists (
        select 1 from public.growth_action_attempts a
        where a.tenant_id=c.tenant_id and a.community_id=c.id and a.action_key='request_group_join'
          and a.status in ('needs_approval','approved','queued','running','succeeded')
      )
  `, [workspaceId, parsed.data.communityId]);
  const row = context?.rows[0];
  if (!row) return;
  const queued = await queryPostgres<{ action_id: string }>(`
    with queued_action as (
      insert into public.outbound_action_queue (
        tenant_id,brand_id,action_type,channel,status,risk_level,target_type,target_id,
        recipient_label,payload_json,metadata_json
      ) values ($1,$2,'publish_content','facebook','needs_review','high','growth_community',$3,
        $4,$5::jsonb,$6::jsonb)
      returning id
    ), attempt as (
      insert into public.growth_action_attempts (
        tenant_id,brand_id,identity_id,community_id,queue_id,channel_key,action_key,execution_mode,
        status,risk_state,idempotency_key,strategy_version,payload_json
      ) select $1,$2,$7,$3,id,'facebook','request_group_join','assisted_browser',
        'needs_approval','healthy',$8,'facebook-community-participation-v1',$9::jsonb from queued_action
      returning id
    ), requested as (
      insert into public.approvals (tenant_id,brand_id,target_type,target_id,status,risk_level,notes)
      select $1,$2,'growth_action',id,'pending','high',$10 from attempt
    ) select id action_id from attempt
  `, [workspaceId, row.brand_id, row.id, row.name,
    JSON.stringify({ channelKey: "facebook", sourceUrl: row.url }),
    JSON.stringify({ executionMode: "assisted_browser", communityId: row.id, approvalFirst: true }),
    row.identity_id, `facebook-group-join:${row.id}:${crypto.randomUUID()}`,
    JSON.stringify({ ownerApprovedJoinRequired: true }),
    `Facebook group join request: ${row.name}\n${row.url}\n\nApproval permits Ferocity to click Join once. If Facebook asks membership questions, account-owner input is required; Ferocity will not invent answers.`]);
  const action = queued?.rows[0];
  if (action) {
    await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id, identityId: row.identity_id,
      communityId: row.id, actionAttemptId: action.action_id, eventType: "publish_queued", channelKey: "facebook",
      actionType: "request_group_join", automationMode: "approve", outcome: "needs_approval",
      idempotencyKey: `facebook-group-join-queued:${action.action_id}` });
    await insertTimeline({ tenantId: workspaceId, brandId: row.brand_id, family: "marketing", type: "facebook_group_join_queued",
      title: `Join request prepared for ${row.name}`,
      body: "Nothing was joined automatically. The request is waiting in Approvals.",
      entityType: "growth_action", entityId: action.action_id, sourceTable: "growth_communities", sourceId: row.id });
  }
  revalidatePath("/app/growth");
  revalidatePath("/app/approvals");
}

export async function captureGrowthOpportunityAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = opportunitySchema.safeParse({
    brandId: formData.get("brandId"), channelKey: formData.get("channelKey"), sourceUrl: formData.get("sourceUrl") || "",
    bodyExcerpt: formData.get("bodyExcerpt"), serviceFocus: formData.get("serviceFocus") || undefined,
    geography: formData.get("geography") || undefined, suggestedResponse: formData.get("suggestedResponse") || undefined
    , authorLabel: formData.get("authorLabel") || undefined, externalActorId: formData.get("externalActorId") || undefined
  });
  if (!parsed.success || !getGrowthChannel(parsed.data.channelKey)) return;
  const verifiedClaims = String(formData.get("verifiedClaims") ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
  const riskFlags = parsed.data.suggestedResponse ? findUnverifiedClaims(parsed.data.suggestedResponse, verifiedClaims).map(() => "unverified_claim") : [];
  const score = scoreGrowthOpportunity({
    text: parsed.data.bodyExcerpt,
    serviceTerms: parsed.data.serviceFocus ? [parsed.data.serviceFocus] : [],
    geographyTerms: parsed.data.geography ? [parsed.data.geography] : [],
    objectiveTerms: ["quote", "estimate", "appointment", "available"]
  });
  const lower = parsed.data.bodyExcerpt.toLowerCase();
  const detectedIntent = lower.includes("recommend") ? "recommendation_request" : lower.includes("how much") || lower.includes("price")
    ? "price_question" : lower.includes("available") ? "availability_question" : score.intentScore >= 40 ? "expressed_demand" : "unknown";
  const workspaceId = await getCurrentWorkspaceId();
  const idempotencyKey = parsed.data.sourceUrl ? `opportunity:${parsed.data.channelKey}:${parsed.data.sourceUrl}` : `opportunity:manual:${crypto.randomUUID()}`;
  const opportunity = await queryPostgres<{ id: string }>(`
    insert into public.growth_opportunities (
      tenant_id, brand_id, channel_key, external_reference, external_actor_id, source_url, author_label, body_excerpt, detected_intent,
      service_focus, geography_text, intent_score, geography_score, objective_score, overall_score,
      recommended_action, suggested_response, status, risk_flags, idempotency_key, metadata_json
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      'Review context, community rules, consent, and identity health before responding.', $16,
      case when cardinality($17::text[]) > 0 then 'blocked' else 'needs_review' end, $17::text[], $18, $19::jsonb)
    on conflict (tenant_id, idempotency_key) where idempotency_key is not null do update set updated_at = now()
    returning id
  `, [workspaceId, parsed.data.brandId, parsed.data.channelKey,
    parsed.data.sourceUrl ? parsed.data.sourceUrl : `manual:${crypto.randomUUID()}`, parsed.data.externalActorId ?? null,
    parsed.data.sourceUrl || null, parsed.data.authorLabel ?? null, parsed.data.bodyExcerpt, detectedIntent,
    parsed.data.serviceFocus ?? null, parsed.data.geography ?? null,
    score.intentScore, score.geographyScore, score.objectiveScore, score.overallScore,
    parsed.data.suggestedResponse ?? null, riskFlags, idempotencyKey, JSON.stringify({ captureMode: "manual_or_assisted", verifiedClaims, scoringVersion: "growth-opportunity-v1" })]);
  if (opportunity?.rows[0]) {
    await recordGrowthEvent({ tenantId: workspaceId, brandId: parsed.data.brandId, opportunityId: opportunity.rows[0].id,
      eventType: "opportunity_detected", channelKey: parsed.data.channelKey, outcome: riskFlags.length ? "blocked" : "needs_review",
      strategyVersion: "growth-distribution-v1", promptVersion: "manual-capture-v1", idempotencyKey: `${idempotencyKey}:detected`,
      dimensions: { detectedIntent, serviceFocus: parsed.data.serviceFocus, geography: parsed.data.geography }, rawEvent: { sourceUrl: parsed.data.sourceUrl } });
    await recordGrowthEvent({ tenantId: workspaceId, brandId: parsed.data.brandId, opportunityId: opportunity.rows[0].id,
      eventType: "opportunity_scored", channelKey: parsed.data.channelKey, outcome: String(score.overallScore),
      strategyVersion: "growth-distribution-v1", idempotencyKey: `${idempotencyKey}:scored`, dimensions: score });
  }
  revalidatePath("/app/growth");
}

export async function convertGrowthOpportunityToLeadAction(formData: FormData) {
  await requirePermission("lead:manage");
  const opportunityId = z.string().uuid().safeParse(formData.get("opportunityId"));
  if (!opportunityId.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ opportunity_id: string; lead_id: string; brand_id: string; objective_id: string | null; identity_id: string | null; community_id: string | null; conversation_id: string | null; external_actor_id: string | null; channel_key: string }>(`
    with selected as (
      select * from public.growth_opportunities
      where tenant_id = $1 and id = $2 and lead_id is null and status in ('detected', 'needs_review', 'approved')
    ), inserted as (
      insert into public.leads (
        tenant_id, brand_id, source, source_detail, name, message, lead_type, status,
        qualification_status, priority, consent_to_contact, metadata_json
      )
      select tenant_id, brand_id, channel_key, source_url, coalesce(author_label, 'Growth opportunity'), body_excerpt,
        'general', 'new', 'needs_review', case when overall_score >= 70 then 'high' else 'normal' end, false,
        jsonb_build_object('growthOpportunityId', id, 'detectedIntent', detected_intent, 'overallScore', overall_score)
      from selected returning id, brand_id
    )
    update public.growth_opportunities o set lead_id = i.id, status = 'converted_to_lead', updated_at = now()
    from inserted i where o.id = $2 returning o.id as opportunity_id, i.id as lead_id, i.brand_id,
      o.objective_id, o.identity_id, o.community_id, o.conversation_id, o.external_actor_id, o.channel_key
  `, [workspaceId, opportunityId.data]);
  const row = result?.rows[0];
  if (row) {
    await queryPostgres(`
      insert into public.growth_attribution_events (tenant_id, brand_id, source_id, event_type, entity_type, entity_id, metadata_json)
      select tenant_id, brand_id, source_id, 'lead_created', 'lead', lead_id,
        jsonb_build_object('growthOpportunityId', id, 'channelKey', channel_key)
      from public.growth_opportunities where tenant_id = $1 and id = $2
    `, [workspaceId, opportunityId.data]);
    await queryPostgres(`
      update public.growth_contact_identities
      set lead_id = $3, match_confidence = greatest(match_confidence, 100), match_status = 'confirmed',
        match_method = 'channel_identifier', provenance_json = provenance_json || $4::jsonb, updated_at = now()
      where tenant_id = $1 and channel_key = $2 and external_actor_id = $5
    `, [workspaceId, row.channel_key, row.lead_id, JSON.stringify({ linkedFromOpportunityId: row.opportunity_id }), row.external_actor_id ?? ""]);
    await queryPostgres(`
      insert into public.growth_attribution_touches (
        tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, conversation_id,
        lead_id, channel_key, source_name, touch_role, reference_key, metadata_json
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'first',$10,$11::jsonb)
      on conflict (tenant_id, reference_key) do nothing
    `, [workspaceId, row.brand_id, row.objective_id, row.identity_id, row.community_id, row.opportunity_id,
      row.conversation_id, row.lead_id, row.channel_key, `growth-opportunity-lead:${row.opportunity_id}:${row.lead_id}`,
      JSON.stringify({ provenance: "growth_opportunity_conversion" })]);
    await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id, objectiveId: row.objective_id,
      identityId: row.identity_id, communityId: row.community_id, opportunityId: row.opportunity_id,
      conversationId: row.conversation_id, leadId: row.lead_id, eventType: "lead_created", channelKey: row.channel_key,
      outcome: "created_in_existing_crm", idempotencyKey: `growth-lead-created:${row.opportunity_id}:${row.lead_id}` });
    if (row.external_actor_id) await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id,
      opportunityId: row.opportunity_id, conversationId: row.conversation_id, leadId: row.lead_id,
      eventType: "lead_linked", channelKey: row.channel_key, outcome: "confirmed_channel_identity",
      idempotencyKey: `growth-lead-linked:${row.channel_key}:${row.external_actor_id}:${row.lead_id}` });
    await insertTimeline({ tenantId: workspaceId, brandId: row.brand_id, family: "lead", type: "growth_opportunity_converted",
      title: "Growth opportunity moved into Leads", body: "The original source and scoring context were preserved for follow-up and attribution.",
      entityType: "lead", entityId: row.lead_id, sourceTable: "growth_opportunities", sourceId: row.opportunity_id });
  }
  revalidatePath("/app/growth");
  revalidatePath("/app/leads");
}

export async function queueGrowthResponseAction(formData: FormData) {
  await requirePermission("ai:queue");
  const opportunityId = z.string().uuid().safeParse(formData.get("opportunityId"));
  if (!opportunityId.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const opportunity = await queryPostgres<{ brand_id: string; channel_key: string }>(`
    select brand_id, channel_key from public.growth_opportunities
    where tenant_id = $1 and id = $2 and status in ('detected', 'needs_review', 'approved')
      and suggested_response is not null and cardinality(risk_flags) = 0
  `, [workspaceId, opportunityId.data]);
  const row = opportunity?.rows[0];
  const channel = row ? getGrowthChannel(row.channel_key) : null;
  if (!row || !channel) return;

  const queued = await queryPostgres<{ action_id: string }>(`
    with selected as (
      select * from public.growth_opportunities o
      where o.tenant_id = $1 and o.id = $2
        and not exists (
          select 1 from public.growth_action_attempts a
          where a.tenant_id = o.tenant_id and a.opportunity_id = o.id
            and a.action_key = 'respond' and a.status in ('needs_approval', 'approved', 'queued', 'running', 'succeeded')
        )
    ), queued_action as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type,
        target_id, subject, recipient_label, payload_json, metadata_json
      )
      select tenant_id, brand_id, 'publish_content', $3, 'needs_review', 'high', 'growth_opportunity', id,
        'Growth opportunity response', coalesce(source_url, channel_key),
        jsonb_build_object('channelKey', channel_key, 'body', suggested_response, 'sourceUrl', source_url),
        jsonb_build_object('growthOpportunityId', id, 'executionMode', $4::text)
      from selected returning id, tenant_id, brand_id, target_id
    ), attempt as (
      insert into public.growth_action_attempts (
        tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, queue_id, channel_key, action_key, execution_mode,
        status, risk_state, idempotency_key, strategy_version, payload_json
      )
      select q.tenant_id, q.brand_id, s.objective_id, s.identity_id, s.community_id, $2, q.id, $5, 'respond', $4, 'needs_approval', 'healthy',
        concat('growth-response:', $2::text), 'growth-distribution-v1',
        jsonb_build_object('providerKey', $3)
      from queued_action q join selected s on s.id = q.target_id returning id, tenant_id, brand_id
    ), requested as (
      insert into public.approvals (tenant_id, brand_id, target_type, target_id, status, risk_level, notes)
      select tenant_id, brand_id, 'growth_action', id, 'pending', 'high',
        'Review the source context, community rules, identity health, and prepared response before execution.'
      from attempt returning target_id
    )
    update public.growth_opportunities o set status = 'queued', updated_at = now()
    from requested r where o.tenant_id = $1 and o.id = $2 returning r.target_id as action_id
  `, [workspaceId, opportunityId.data, channel.providerKey, channel.defaultMode, row.channel_key]);
  if (queued?.rows[0]) {
    await insertTimeline({ tenantId: workspaceId, brandId: row.brand_id, family: "marketing", type: "growth_response_queued",
      title: "Growth response prepared for approval", body: "Nothing was posted. The response is in Ferocity's existing approval and outbound safety flow.",
      entityType: "growth_action", entityId: queued.rows[0].action_id, sourceTable: "growth_opportunities", sourceId: opportunityId.data });
    await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id, opportunityId: opportunityId.data,
      actionAttemptId: queued.rows[0].action_id, eventType: "publish_queued", channelKey: row.channel_key,
      actionType: "respond", automationMode: "approve", outcome: "needs_approval",
      idempotencyKey: `growth-publish-queued:${queued.rows[0].action_id}` });
    await recordGrowthEvent({ tenantId: workspaceId, brandId: row.brand_id, opportunityId: opportunityId.data,
      actionAttemptId: queued.rows[0].action_id, eventType: "owner_approval_requested", channelKey: row.channel_key,
      actionType: "respond", automationMode: "approve", outcome: "pending",
      idempotencyKey: `growth-approval-requested:${queued.rows[0].action_id}` });
  }
  revalidatePath("/app/growth");
  revalidatePath("/app/approvals");
}
