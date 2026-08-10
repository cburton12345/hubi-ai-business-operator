"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { safeLogAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { scoreLeadsForTenant } from "@/lib/revenue-growth/score-leads";

const recommendationDecisionSchema = z.object({
  recommendationId: z.string().uuid(),
  status: z.enum(["approved", "dismissed", "snoozed", "completed"])
});

const conversionEventDecisionSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["approved", "skipped"])
});

const goalSchema = z.object({
  goalName: z.string().trim().min(2).max(160),
  targetCollectedRevenueCents: z.number().int().min(0),
  targetProfitCents: z.number().int().min(0),
  targetAverageSaleCents: z.number().int().min(0),
  targetCloseRateBps: z.number().int().min(0).max(10000),
  targetShowRateBps: z.number().int().min(0).max(10000),
  targetReviewCount: z.number().int().min(0)
});

function dollarsToCents(value: FormDataEntryValue | null) {
  const dollars = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0;
}

function percentToBps(value: FormDataEntryValue | null, fallback: number) {
  const percent = Number(String(value ?? "").replace(/[%\s]/g, ""));
  return Number.isFinite(percent) ? Math.max(0, Math.min(10000, Math.round(percent * 100))) : fallback;
}

function wholeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

async function getDefaultBrandId(workspaceId: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.brands
    where tenant_id = $1 and status <> 'archived'
    order by created_at asc
    limit 1
    `,
    [workspaceId]
  );
  return result?.rows[0]?.id ?? null;
}

export async function runRevenueGrowthScanAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();

  await scoreLeadsForTenant(workspaceId);

  await queryPostgres(
    `
    insert into public.revenue_attribution_records (
      tenant_id, brand_id, lead_id, entity_type, entity_id, original_source, latest_source,
      campaign_key, landing_page, attribution_model, pipeline_value_cents, touchpoints_json, metadata_json, occurred_at, updated_at
    )
    select
      l.tenant_id,
      l.brand_id,
      l.id,
      'lead',
      l.id,
      coalesce(nullif(l.source, ''), 'unknown'),
      coalesce(nullif(l.source_detail, ''), nullif(l.source, ''), 'unknown'),
      l.metadata_json->>'campaign',
      l.metadata_json->>'landingPage',
      'first_touch',
      coalesce(s.estimated_value_cents, 0),
      jsonb_build_array(jsonb_build_object('type', 'lead_created', 'source', l.source, 'at', l.created_at)),
      jsonb_build_object('createdBy', 'revenue_growth_scan'),
      l.created_at,
      now()
    from public.leads l
    left join public.revenue_lead_scores s on s.tenant_id = l.tenant_id and s.lead_id = l.id
    where l.tenant_id = $1
    on conflict (tenant_id, entity_type, entity_id, attribution_model) do update set
      brand_id = excluded.brand_id,
      lead_id = excluded.lead_id,
      original_source = excluded.original_source,
      latest_source = excluded.latest_source,
      campaign_key = excluded.campaign_key,
      landing_page = excluded.landing_page,
      pipeline_value_cents = excluded.pipeline_value_cents,
      touchpoints_json = excluded.touchpoints_json,
      metadata_json = public.revenue_attribution_records.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.revenue_attribution_records (
      tenant_id, brand_id, lead_id, customer_id, estimate_id, entity_type, entity_id,
      original_source, latest_source, attribution_model, pipeline_value_cents, signed_sale_cents,
      metadata_json, occurred_at, updated_at
    )
    select
      e.tenant_id,
      e.brand_id,
      e.source_lead_id,
      e.customer_id,
      e.id,
      'estimate',
      e.id,
      coalesce(nullif(l.source, ''), 'unknown'),
      coalesce(nullif(l.source_detail, ''), nullif(l.source, ''), 'unknown'),
      'first_touch',
      case when e.status in ('sent_manually','draft') then e.total_cents else 0 end,
      case when e.status = 'approved' then e.total_cents else 0 end,
      jsonb_build_object('createdBy', 'revenue_growth_scan', 'estimateStatus', e.status),
      e.created_at,
      now()
    from public.service_estimates e
    left join public.leads l on l.tenant_id = e.tenant_id and l.id = e.source_lead_id
    where e.tenant_id = $1
    on conflict (tenant_id, entity_type, entity_id, attribution_model) do update set
      brand_id = excluded.brand_id,
      lead_id = excluded.lead_id,
      customer_id = excluded.customer_id,
      estimate_id = excluded.estimate_id,
      original_source = excluded.original_source,
      latest_source = excluded.latest_source,
      pipeline_value_cents = excluded.pipeline_value_cents,
      signed_sale_cents = excluded.signed_sale_cents,
      metadata_json = public.revenue_attribution_records.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.revenue_attribution_records (
      tenant_id, brand_id, lead_id, customer_id, estimate_id, job_id, invoice_id, payment_id,
      entity_type, entity_id, original_source, latest_source, attribution_model, invoiced_cents, collected_cents,
      gross_profit_cents, metadata_json, occurred_at, updated_at
    )
    select
      p.tenant_id,
      p.brand_id,
      coalesce(j.source_lead_id, e.source_lead_id),
      p.customer_id,
      i.estimate_id,
      i.job_id,
      i.id,
      p.id,
      'payment',
      p.id,
      coalesce(nullif(l.source, ''), 'unknown'),
      coalesce(nullif(l.source_detail, ''), nullif(l.source, ''), 'unknown'),
      'first_touch',
      i.total_cents,
      p.amount_cents,
      p.amount_cents - coalesce(mat.material_cents, 0) - coalesce(pay.worker_cents, 0),
      jsonb_build_object('createdBy', 'revenue_growth_scan', 'provider', p.provider),
      coalesce(p.paid_at, p.received_at, p.created_at),
      now()
    from public.service_invoice_payments p
    join public.service_invoices i on i.tenant_id = p.tenant_id and i.id = p.invoice_id
    left join public.service_jobs j on j.tenant_id = i.tenant_id and j.id = i.job_id
    left join public.service_estimates e on e.tenant_id = i.tenant_id and e.id = i.estimate_id
    left join public.leads l on l.tenant_id = p.tenant_id and l.id = coalesce(j.source_lead_id, e.source_lead_id)
    left join (
      select tenant_id, service_job_id, sum(coalesce(nullif(actual_cost_cents, 0), estimated_cost_cents)) as material_cents
      from public.job_material_list_items
      where status <> 'cancelled'
      group by tenant_id, service_job_id
    ) mat on mat.tenant_id = i.tenant_id and mat.service_job_id = i.job_id
    left join (
      select tenant_id, service_job_id, sum(amount_cents) as worker_cents
      from public.operations_worker_payments
      where status in ('recorded','reviewed')
      group by tenant_id, service_job_id
    ) pay on pay.tenant_id = i.tenant_id and pay.service_job_id = i.job_id
    where p.tenant_id = $1 and p.status in ('succeeded','manual')
    on conflict (tenant_id, entity_type, entity_id, attribution_model) do update set
      brand_id = excluded.brand_id,
      lead_id = excluded.lead_id,
      customer_id = excluded.customer_id,
      estimate_id = excluded.estimate_id,
      job_id = excluded.job_id,
      invoice_id = excluded.invoice_id,
      payment_id = excluded.payment_id,
      original_source = excluded.original_source,
      latest_source = excluded.latest_source,
      invoiced_cents = excluded.invoiced_cents,
      collected_cents = excluded.collected_cents,
      gross_profit_cents = excluded.gross_profit_cents,
      metadata_json = public.revenue_attribution_records.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [workspaceId]
  );

  await seedRevenueRecommendations(workspaceId);
  await seedConversionEvents(workspaceId);

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, visibility, source_table, metadata_json
    )
    values ($1, 'revenue', 'revenue_growth_scan', 'Revenue Growth scan completed', 'Ferocity rescored leads, refreshed attribution, checked follow-up risk, and updated revenue recommendations.', 'internal', 'revenue_recommendations', '{"createdBy":"revenue_growth_scan"}'::jsonb)
    `,
    [workspaceId]
  );

  revalidatePath("/app/revenue-growth");
  revalidatePath("/app");
  revalidatePath("/app/reports");
  revalidatePath("/app/owner-command-center");

  const summaryResult = await queryPostgres<{
    leads: string;
    scored_leads: string;
    recommendations: string;
    conversion_events: string;
  }>(
    `
    select
      (select count(*) from public.leads where tenant_id = $1 and status <> 'spam')::text as leads,
      (select count(*) from public.revenue_lead_scores where tenant_id = $1)::text as scored_leads,
      (select count(*) from public.revenue_recommendations where tenant_id = $1 and status = 'open')::text as recommendations,
      (select count(*) from public.revenue_conversion_event_queue where tenant_id = $1)::text as conversion_events
    `,
    [workspaceId]
  );
  const summary = summaryResult?.rows[0];
  const recommendations = Number(summary?.recommendations ?? 0);
  const scoredLeads = Number(summary?.scored_leads ?? 0);
  const leads = Number(summary?.leads ?? 0);
  const conversionEvents = Number(summary?.conversion_events ?? 0);

  return {
    ok: true,
    message:
      recommendations > 0
        ? `Revenue scan complete. ${recommendations} recommendation(s), ${scoredLeads} scored lead(s), and ${conversionEvents} conversion event(s) are ready for review.`
        : leads === 0
          ? "Revenue scan complete. No recommendations yet because this workspace has no leads. Connect a form, import leads, or add a customer opportunity first."
          : "Revenue scan complete. No urgent money leaks were created. Add estimates, invoices, payments, or qualified leads for deeper recommendations.",
    recommendations,
    scoredLeads,
    conversionEvents
  };
}

export async function runRevenueGrowthScanWithStateAction(
  _state: { ok: boolean; message?: string; recommendations?: number; scoredLeads?: number; conversionEvents?: number },
  _formData: FormData
) {
  try {
    return await runRevenueGrowthScanAction();
  } catch (error) {
    const correlationId = await safeLogAppError({
      source: "server_action.revenue_growth.find_money_leaks",
      severity: "error",
      message: "Revenue growth scan action failed.",
      category: "server_action",
      retryable: true,
      metadata: { errorName: error instanceof Error ? error.name : "UnknownError" }
    });
    return {
      ok: false,
      message: `Find Missed Money failed before it could refresh revenue data. Reference ${correlationId}.`,
      recommendations: 0,
      scoredLeads: 0,
      conversionEvents: 0
    };
  }
}

async function seedRevenueRecommendations(workspaceId: string) {
  await queryPostgres(
    `
    with metrics as (
      select
        (select count(*) from public.leads where tenant_id = $1 and status <> 'spam' and created_at >= now() - interval '90 days') as leads,
        (select count(*) from public.leads where tenant_id = $1 and qualification_status = 'qualified' and created_at >= now() - interval '90 days') as qualified,
        (select count(*) from public.revenue_appointments where tenant_id = $1 and status in ('booked','confirmed','showed','completed') and created_at >= now() - interval '90 days') as appointments,
        (select count(*) from public.revenue_appointments where tenant_id = $1 and status = 'showed' and created_at >= now() - interval '90 days') as showed,
        (select count(*) from public.revenue_appointments where tenant_id = $1 and status = 'no_show' and created_at >= now() - interval '90 days') as no_shows,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('sent_manually','approved') and created_at < now() - interval '3 days') as aging_estimates,
        (select coalesce(sum(total_cents),0) from public.service_estimates where tenant_id = $1 and status = 'sent_manually' and created_at < now() - interval '3 days') as aging_estimate_cents,
        (select coalesce(sum(greatest(total_cents - amount_paid_cents, 0)),0) from public.service_invoices where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue')) as outstanding_cents
    ),
    recs as (
      select 'qualification_drop' as recommendation_key,
        'Lead quality needs attention' as problem,
        concat('Qualified leads: ', qualified, ' of ', leads, '.') as supporting_data,
        greatest(0, (leads - qualified) * 150000) as estimated_revenue_impact_cents,
        'Review the qualification questions and route weak-fit leads into nurture instead of the main sales queue.' as recommended_action,
        case when leads >= 10 and qualified::numeric / greatest(leads, 1) < 0.35 then 'high' else 'medium' end as confidence_level,
        case when leads >= 10 and qualified::numeric / greatest(leads, 1) < 0.35 then 'high' else 'medium' end as priority,
        '/app/revenue-growth#qualified-leads' as action_href,
        to_jsonb(metrics.*) as source_metrics_json
      from metrics
      union all
      select 'appointment_show_rate' as recommendation_key,
        'Appointment show rate can improve' as problem,
        concat('Showed: ', showed, '. No-shows: ', no_shows, '. Booked: ', appointments, '.') as supporting_data,
        greatest(0, no_shows * 250000) as estimated_revenue_impact_cents,
        'Use confirmation plus 24-hour, 3-hour, and 30-minute reminders for qualified appointments.' as recommended_action,
        case when no_shows > 0 then 'high' else 'medium' end,
        case when no_shows > 0 then 'high' else 'low' end,
        '/app/revenue-growth#appointments',
        to_jsonb(metrics.*)
      from metrics
      union all
      select 'estimate_followup_risk' as recommendation_key,
        'Estimates are aging without a decision' as problem,
        concat(aging_estimates, ' estimate(s) are old enough to need follow-up.') as supporting_data,
        aging_estimate_cents as estimated_revenue_impact_cents,
        'Review aging estimates and approve follow-up before the prospect goes cold.' as recommended_action,
        case when aging_estimates > 0 then 'high' else 'medium' end,
        case when aging_estimates > 0 then 'high' else 'low' end,
        '/app/service',
        to_jsonb(metrics.*)
      from metrics
      union all
      select 'cash_collection_risk' as recommendation_key,
        'Collected revenue is being delayed' as problem,
        concat('Outstanding invoice balance: $', round(outstanding_cents / 100.0, 0), '.') as supporting_data,
        outstanding_cents as estimated_revenue_impact_cents,
        'Open the money queue and approve invoice reminders or payment-link follow-up.' as recommended_action,
        case when outstanding_cents > 0 then 'high' else 'medium' end,
        case when outstanding_cents > 0 then 'high' else 'low' end,
        '/app/cash-collection',
        to_jsonb(metrics.*)
      from metrics
    )
    insert into public.revenue_recommendations (
      tenant_id, recommendation_key, problem, supporting_data, estimated_revenue_impact_cents,
      recommended_action, confidence_level, priority, action_href, source_metrics_json, metadata_json, updated_at
    )
    select $1, recommendation_key, problem, supporting_data, estimated_revenue_impact_cents,
      recommended_action, confidence_level, priority, action_href, source_metrics_json,
      '{"createdBy":"revenue_growth_scan"}'::jsonb, now()
    from recs
    on conflict (tenant_id, recommendation_key) where brand_id is null do update set
      problem = excluded.problem,
      supporting_data = excluded.supporting_data,
      estimated_revenue_impact_cents = excluded.estimated_revenue_impact_cents,
      recommended_action = excluded.recommended_action,
      confidence_level = excluded.confidence_level,
      priority = excluded.priority,
      action_href = excluded.action_href,
      source_metrics_json = excluded.source_metrics_json,
      metadata_json = public.revenue_recommendations.metadata_json || excluded.metadata_json,
      status = case when public.revenue_recommendations.status in ('dismissed','snoozed','completed') then public.revenue_recommendations.status else 'open' end,
      updated_at = now()
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action, action_href,
      money_cents, risk_type, confidence_score, metadata_json
    )
    select
      tenant_id,
      'ferocity',
      'Ferocity',
      concat('revenue-recommendation-', recommendation_key),
      'revenue.recommendation',
      problem,
      supporting_data,
      case priority when 'critical' then 'critical' when 'high' then 'high' when 'medium' then 'medium' else 'low' end,
      case when priority in ('critical','high') then 'needs_owner' else 'open' end,
      priority in ('critical','high'),
      false,
      'Ferocity found a revenue leak. Review before any customer message, ad change, or spend.',
      recommended_action,
      action_href,
      estimated_revenue_impact_cents,
      'revenue',
      case confidence_level when 'high' then 88 when 'medium' then 72 else 55 end,
      jsonb_build_object('source', 'revenue_growth_scan', 'recommendationId', id)
    from public.revenue_recommendations
    where tenant_id = $1 and status = 'open' and priority in ('critical','high')
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update set
      title = excluded.title,
      summary = excluded.summary,
      severity = excluded.severity,
      status = excluded.status,
      owner_attention = excluded.owner_attention,
      recommended_action = excluded.recommended_action,
      action_href = excluded.action_href,
      money_cents = excluded.money_cents,
      confidence_score = excluded.confidence_score,
      metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [workspaceId]
  );
}

async function seedConversionEvents(workspaceId: string) {
  await queryPostgres(
    `
    insert into public.revenue_conversion_event_queue (
      tenant_id, brand_id, event_key, event_type, provider, status, consent_checked,
      requires_manual_approval, idempotency_key, payload_json, updated_at
    )
    select
      s.tenant_id,
      s.brand_id,
      concat('qualified_lead:', s.lead_id),
      'qualified_lead',
      'provider_agnostic',
      'needs_review',
      l.consent_to_contact,
      true,
      concat('qualified_lead:', s.lead_id),
      jsonb_build_object('leadId', s.lead_id, 'score', s.qualification_score, 'estimatedValueCents', s.estimated_value_cents, 'noSensitiveCustomerPayload', true),
      now()
    from public.revenue_lead_scores s
    join public.leads l on l.tenant_id = s.tenant_id and l.id = s.lead_id
    where s.tenant_id = $1 and s.qualification_status = 'qualified'
    on conflict (tenant_id, provider, idempotency_key) do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.revenue_conversion_event_queue (
      tenant_id, brand_id, event_key, event_type, provider, status, consent_checked,
      requires_manual_approval, idempotency_key, payload_json, updated_at
    )
    select
      p.tenant_id,
      p.brand_id,
      concat('payment_collected:', p.id),
      'payment_collected',
      'provider_agnostic',
      'needs_review',
      true,
      true,
      concat('payment_collected:', p.id),
      jsonb_build_object('paymentId', p.id, 'amountCents', p.amount_cents, 'provider', p.provider, 'noSensitiveCustomerPayload', true),
      now()
    from public.service_invoice_payments p
    where p.tenant_id = $1 and p.status in ('succeeded','manual')
    on conflict (tenant_id, provider, idempotency_key) do nothing
    `,
    [workspaceId]
  );
}

export async function saveRevenueGoalAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = goalSchema.safeParse({
    goalName: String(formData.get("goalName") ?? "Monthly revenue goal"),
    targetCollectedRevenueCents: dollarsToCents(formData.get("targetCollectedRevenue")),
    targetProfitCents: dollarsToCents(formData.get("targetProfit")),
    targetAverageSaleCents: dollarsToCents(formData.get("targetAverageSale")),
    targetCloseRateBps: percentToBps(formData.get("targetCloseRate"), 3000),
    targetShowRateBps: percentToBps(formData.get("targetShowRate"), 7000),
    targetReviewCount: wholeNumber(formData.get("targetReviewCount"))
  });
  if (!parsed.success) return;

  await queryPostgres(
    `
    insert into public.revenue_goals (
      tenant_id, goal_name, target_collected_revenue_cents, target_profit_cents,
      target_average_sale_cents, target_close_rate_bps, target_show_rate_bps, target_review_count,
      assumptions_json, created_by_user_id, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, nullif($10::text, '')::uuid, now())
    `,
    [
      workspaceId,
      parsed.data.goalName,
      parsed.data.targetCollectedRevenueCents,
      parsed.data.targetProfitCents,
      parsed.data.targetAverageSaleCents,
      parsed.data.targetCloseRateBps,
      parsed.data.targetShowRateBps,
      parsed.data.targetReviewCount,
      JSON.stringify({ savedFrom: "revenue_growth", actorEmail: actor.email }),
      actor.userId === "admin-token" ? "" : actor.userId
    ]
  );

  revalidatePath("/app/revenue-growth");
}

export async function updateRevenueRecommendationAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const session = await getCurrentAppSession();
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = recommendationDecisionSchema.safeParse({
    recommendationId: formData.get("recommendationId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  await queryPostgres(
    `
    update public.revenue_recommendations
    set status = $3,
        snoozed_until = case when $3 = 'snoozed' then now() + interval '7 days' else snoozed_until end,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      parsed.data.recommendationId,
      parsed.data.status,
      JSON.stringify({ decidedBy: session?.email ?? "admin-token", decidedAt: new Date().toISOString() })
    ]
  );

  if (parsed.data.status === "approved") {
    await createApprovedRecommendationWork(workspaceId, parsed.data.recommendationId, session?.email ?? "admin-token");
  }

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, 'user', $2, 'revenue_recommendation', $3, $4::jsonb)
    `,
    [
      workspaceId,
      `revenue_recommendation.${parsed.data.status}`,
      parsed.data.recommendationId,
      JSON.stringify({ status: parsed.data.status })
    ]
  );

  revalidatePath("/app/revenue-growth");
  revalidatePath("/app/owner-command-center");
  revalidatePath("/app/operator");
  revalidatePath("/app/cash-collection");
}

export async function seedQualificationFormAction() {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  await seedQualificationFormForWorkspace(workspaceId);
  revalidatePath("/app/revenue-growth");
}

async function createApprovedRecommendationWork(workspaceId: string, recommendationId: string, actorEmail: string) {
  const result = await queryPostgres<{ recommendation_key: string; problem: string; recommended_action: string }>(
    `
    select recommendation_key, problem, recommended_action
    from public.revenue_recommendations
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, recommendationId]
  );
  const recommendation = result?.rows[0];
  if (!recommendation) return;

  if (recommendation.recommendation_key === "estimate_followup_risk") {
    await queryPostgres(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, lead_id, customer_id, estimate_id, workflow_type, channel, status, due_at,
        ai_suggested_message, metadata_json
      )
      select
        e.tenant_id,
        e.brand_id,
        e.source_lead_id,
        e.customer_id,
        e.id,
        'estimate_followup',
        'email',
        'open',
        now() + interval '2 hours',
        concat('Follow up on ', coalesce(e.title, 'the estimate'), '. Keep it helpful and ask if they want to move forward, change scope, or schedule a quick call.'),
        jsonb_build_object('createdBy', 'revenue_advisor', 'recommendationId', $2, 'approvedBy', $3)
      from public.service_estimates e
      where e.tenant_id = $1
        and e.status = 'sent_manually'
        and e.created_at < now() - interval '3 days'
        and not exists (
          select 1 from public.follow_up_workflows f
          where f.tenant_id = e.tenant_id
            and f.estimate_id = e.id
            and f.workflow_type = 'estimate_followup'
            and f.status in ('open','scheduled')
        )
      limit 25
      `,
      [workspaceId, recommendationId, actorEmail]
    );
  }

  if (recommendation.recommendation_key === "cash_collection_risk") {
    await queryPostgres(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, customer_id, invoice_id, workflow_type, channel, status, due_at,
        ai_suggested_message, metadata_json
      )
      select
        i.tenant_id,
        i.brand_id,
        i.customer_id,
        i.id,
        'invoice_followup',
        'email',
        'open',
        now() + interval '2 hours',
        concat('Send a polite payment reminder for ', coalesce(i.title, 'the invoice'), '. Include the balance and payment link when available.'),
        jsonb_build_object('createdBy', 'revenue_advisor', 'recommendationId', $2, 'approvedBy', $3)
      from public.service_invoices i
      where i.tenant_id = $1
        and i.status in ('sent_manually','partially_paid','overdue')
        and greatest(i.total_cents - i.amount_paid_cents, 0) > 0
        and not exists (
          select 1 from public.follow_up_workflows f
          where f.tenant_id = i.tenant_id
            and f.invoice_id = i.id
            and f.workflow_type = 'invoice_followup'
            and f.status in ('open','scheduled')
        )
      order by i.due_date nulls first, i.created_at asc
      limit 25
      `,
      [workspaceId, recommendationId, actorEmail]
    );
  }

  if (recommendation.recommendation_key === "appointment_show_rate") {
    await seedAppointmentReminderSequenceForWorkspace(workspaceId, recommendationId, actorEmail);
  }

  if (recommendation.recommendation_key === "qualification_drop") {
    await seedQualificationFormForWorkspace(workspaceId);
  }

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, visibility, source_table, source_id, metadata_json
    )
    values ($1, 'revenue', 'revenue_advisor_approved', 'Revenue Advisor work prepared', $2, 'internal', 'revenue_recommendations', $3, $4::jsonb)
    `,
    [
      workspaceId,
      `Approved: ${recommendation.problem}. ${recommendation.recommended_action}`,
      recommendationId,
      JSON.stringify({ approvedBy: actorEmail, recommendationKey: recommendation.recommendation_key })
    ]
  );
}

async function seedQualificationFormForWorkspace(workspaceId: string) {
  const existing = await queryPostgres<{ id: string }>(
    `
    select id
    from public.revenue_qualification_forms
    where tenant_id = $1
      and metadata_json->>'createdBy' = 'revenue_growth_seed'
      and status <> 'archived'
    order by created_at asc
    limit 1
    `,
    [workspaceId]
  );
  if (existing?.rows[0]?.id) return existing.rows[0].id;

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.revenue_qualification_forms (
      tenant_id, name, service_label, status, disqualification_rules_json, routing_rules_json, metadata_json
    )
    values (
      $1,
      'Default qualified appointment form',
      'General service',
      'draft',
      '["Outside service area","No usable contact information","Spam or duplicate"]'::jsonb,
      '["High urgency goes to owner","Qualified quote requests go to sales","Incomplete leads go to nurture"]'::jsonb,
      '{"createdBy":"revenue_growth_seed"}'::jsonb
    )
    returning id
    `,
    [workspaceId]
  );
  const formId = result?.rows[0]?.id;
  if (!formId) return;

  const questions = [
    ["What service do you need?", "text", true, { scoreIfAnswered: 10 }],
    ["Where are you located?", "text", true, { scoreIfAnswered: 15, serviceAreaCheck: true }],
    ["How soon do you need it?", "single_choice", true, { urgent: 25, soon: 15, someday: 5 }],
    ["What budget range are you considering?", "currency", false, { highBudget: 20, lowBudgetNeedsReview: true }],
    ["Are you the decision-maker?", "boolean", true, { yes: 15, no: -10 }],
    ["Do you want to book an appointment?", "boolean", false, { yes: 20 }]
  ];

  for (const [index, [label, questionType, required, scoring]] of questions.entries()) {
    await queryPostgres(
      `
      insert into public.revenue_qualification_questions (
        tenant_id, form_id, question_order, label, question_type, required, scoring_json, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, '{"createdBy":"revenue_growth_seed"}'::jsonb)
      `,
      [workspaceId, formId, index + 1, label, questionType, required, JSON.stringify(scoring)]
    );
  }

  return formId;
}

async function seedAppointmentReminderSequenceForWorkspace(workspaceId: string, recommendationId?: string, actorEmail?: string) {
  const brandId = await getDefaultBrandId(workspaceId);
  const existing = await queryPostgres<{ id: string }>(
    `
    select id
    from public.revenue_followup_sequences
    where tenant_id = $1
      and brand_id is not distinct from nullif($2::text, '')::uuid
      and sequence_key = 'qualified_appointment_show_rate'
      and status <> 'archived'
    order by created_at asc
    limit 1
    `,
    [workspaceId, brandId ?? ""]
  );
  let sequenceId = existing?.rows[0]?.id;

  if (!sequenceId) {
    const inserted = await queryPostgres<{ id: string }>(
      `
      insert into public.revenue_followup_sequences (
        tenant_id, brand_id, sequence_key, name, trigger_type, status, approval_required,
        stop_conditions_json, metadata_json
      )
      values (
        $1,
        nullif($2::text, '')::uuid,
        'qualified_appointment_show_rate',
        'Qualified appointment show-up reminders',
        'appointment_booked',
        'active',
        true,
        '["appointment_canceled","appointment_rescheduled","customer_replied","opt_out"]'::jsonb,
        $3::jsonb
      )
      returning id
      `,
      [
        workspaceId,
        brandId ?? "",
        JSON.stringify({ createdBy: "revenue_growth_seed", recommendationId: recommendationId ?? null, actorEmail: actorEmail ?? null })
      ]
    );
    sequenceId = inserted?.rows[0]?.id;
  }

  if (!sequenceId) return;

  const steps = [
    [1, 0, "task", "Confirm the appointment", "Confirm the time, address, decision-maker, and best phone number before the appointment."],
    [2, 1440, "push", "24-hour appointment reminder", "Reminder: we have you scheduled tomorrow. Reply if anything needs to change."],
    [3, 180, "push", "3-hour appointment reminder", "Quick reminder for today. Please make sure the decision-maker is available."],
    [4, 30, "push", "30-minute appointment reminder", "We are getting close to your appointment window. Reply if you need help."]
  ] as const;

  for (const [stepNumber, delayMinutes, channel, label, template] of steps) {
    await queryPostgres(
      `
      insert into public.revenue_followup_steps (
        tenant_id, sequence_id, step_number, delay_minutes, channel, action_label, message_template,
        approval_required, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, true, '{"createdBy":"revenue_growth_seed"}'::jsonb)
      on conflict (sequence_id, step_number) do update set
        delay_minutes = excluded.delay_minutes,
        channel = excluded.channel,
        action_label = excluded.action_label,
        message_template = excluded.message_template,
        approval_required = true
      `,
      [workspaceId, sequenceId, stepNumber, delayMinutes, channel, label, template]
    );
  }
}

export async function seedAppointmentReminderSequenceAction() {
  await requirePermission("tenant:manage");
  const session = await getCurrentAppSession();
  const workspaceId = await getCurrentWorkspaceId();
  await seedAppointmentReminderSequenceForWorkspace(workspaceId, undefined, session?.email ?? "admin-token");
  revalidatePath("/app/revenue-growth");
}

export async function updateConversionEventAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const workspaceId = await getCurrentWorkspaceId();
  const parsed = conversionEventDecisionSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  await queryPostgres(
    `
    update public.revenue_conversion_event_queue
    set status = $3,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status in ('needs_review','failed')
    `,
    [workspaceId, parsed.data.eventId, parsed.data.status]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, 'user', $2, 'revenue_conversion_event', $3, $4::jsonb)
    `,
    [
      workspaceId,
      `revenue_conversion_event.${parsed.data.status}`,
      parsed.data.eventId,
      JSON.stringify({ safeMode: true, note: "Status only. No ad platform upload runs here." })
    ]
  );

  revalidatePath("/app/revenue-growth");
}
