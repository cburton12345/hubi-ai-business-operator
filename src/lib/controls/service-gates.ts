import { queryPostgres } from "@/lib/db/postgres";

export type ServiceMode = "off" | "draft_only" | "review_required" | "enabled";
export type OveragePolicy = "block" | "allow_with_review" | "allow";
export type PlanKey = "free" | "job_tracker" | "starter" | "growth" | "operator" | "pro_agency";

export type ServiceGate = {
  featureKey: string;
  enabled: boolean;
  status: string;
  mode: ServiceMode;
  usageLimit: number | null;
  currentUsage: number;
  remaining: number | null;
  overagePolicy: OveragePolicy;
  reason: string;
  planKey: PlanKey;
  minimumPlanKey: PlanKey;
  planAllowed: boolean;
};

const planRank: Record<PlanKey, number> = {
  free: 0,
  job_tracker: 5,
  starter: 10,
  growth: 20,
  operator: 30,
  pro_agency: 40
};

const planLabel: Record<PlanKey, string> = {
  free: "Free",
  job_tracker: "Job Tracker",
  starter: "Starter",
  growth: "Growth",
  operator: "Operator",
  pro_agency: "Pro / Agency"
};

const featureMinimumPlan: Record<string, PlanKey> = {
  ai_generation: "starter",
  seo_autopilot: "growth",
  hosted_growth_pages: "growth",
  publishing_queue: "growth",
  sms_send: "growth",
  email_send: "growth",
  review_requests: "growth",
  ugc_proof_capture: "growth",
  calendar_sync: "operator",
  growth_attribution: "starter",
  follow_up_recovery: "starter",
  payment_collection: "operator",
  marketplacepro_import: "pro_agency",
  marketing_os_profile: "starter",
  website_import: "starter",
  content_studio: "growth",
  media_library: "starter",
  marketing_graphics: "growth",
  ai_video_generation: "operator",
  voice_ai: "operator",
  bulk_email: "growth",
  premium_ai_tasks: "operator",
  byo_credential_vault: "operator",
  ai_search_visibility: "free",
  seo_content_strategy: "growth",
  authority_builder: "growth",
  cms_publishing_connections: "growth",
  ai_monitoring_briefing: "operator",
  owner_ai_decisions: "operator",
  labor_staffing_requests: "job_tracker",
  labor_worker_intake: "job_tracker",
  labor_match_suggestions: "starter"
};

function normalizePlanKey(planKey: string | null | undefined): PlanKey {
  if (planKey === "job_tracker") return planKey;
  if (planKey === "starter" || planKey === "growth" || planKey === "operator" || planKey === "pro_agency") return planKey;
  if (planKey === "internal" || planKey === "enterprise" || planKey === "agency") return "pro_agency";
  return "free";
}

export function minimumPlanForFeature(featureKey: string): PlanKey {
  return featureMinimumPlan[featureKey] ?? "free";
}

export function planMeetsMinimum(planKey: string | null | undefined, minimumPlanKey: string | null | undefined) {
  return planRank[normalizePlanKey(planKey)] >= planRank[normalizePlanKey(minimumPlanKey)];
}

export function planName(planKey: string | null | undefined) {
  return planLabel[normalizePlanKey(planKey)];
}

const serviceUsageSql: Record<string, string> = {
  ai_generation: "select count(*)::int as current_usage from public.ai_generation_runs where tenant_id = $1 and created_at >= date_trunc('month', now())",
  seo_autopilot: `
    select count(*)::int as current_usage
    from public.ai_drafts
    where tenant_id = $1
      and content_type in ('blog', 'city_page', 'service_page', 'gbp_post')
      and created_at >= date_trunc('month', now())
  `,
  hosted_growth_pages: "select count(*)::int as current_usage from public.brand_landing_pages where tenant_id = $1 and status <> 'archived'",
  publishing_queue: "select count(*)::int as current_usage from public.publishing_queue where tenant_id = $1 and queue_status <> 'canceled'",
  sms_send: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'sms_send' and created_at >= date_trunc('month', now())",
  email_send: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'email_send' and created_at >= date_trunc('month', now())",
  review_requests: "select count(*)::int as current_usage from public.review_request_workflows where tenant_id = $1 and created_at >= date_trunc('month', now())",
  ugc_proof_capture: "select count(*)::int as current_usage from public.ugc_submissions where tenant_id = $1 and created_at >= date_trunc('month', now())",
  calendar_sync: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'calendar_sync' and created_at >= date_trunc('month', now())",
  growth_attribution: "select count(*)::int as current_usage from public.growth_attribution_events where tenant_id = $1 and occurred_at >= date_trunc('month', now())",
  follow_up_recovery: "select count(*)::int as current_usage from public.follow_up_workflows where tenant_id = $1 and status in ('open', 'scheduled', 'missed')",
  payment_collection: "select count(*)::int as current_usage from public.service_invoice_payment_links where tenant_id = $1 and created_at >= date_trunc('month', now())",
  marketplacepro_import: "select count(*)::int as current_usage from public.marketplacepro_sync_events where tenant_id = $1 and created_at >= date_trunc('month', now())",
  marketing_os_profile: "select count(*)::int as current_usage from public.marketing_os_business_profiles where tenant_id = $1 and status <> 'archived'",
  website_import: "select count(*)::int as current_usage from public.marketing_os_website_imports where tenant_id = $1 and created_at >= date_trunc('month', now())",
  content_studio: "select count(*)::int as current_usage from public.content_studio_campaigns where tenant_id = $1 and created_at >= date_trunc('month', now())",
  media_library: "select count(*)::int as current_usage from public.marketing_media_assets where tenant_id = $1 and status <> 'archived'",
  marketing_graphics: "select count(*)::int as current_usage from public.marketing_graphic_jobs where tenant_id = $1 and created_at >= date_trunc('month', now())",
  ai_video_generation: "select count(*)::int as current_usage from public.marketing_video_jobs where tenant_id = $1 and created_at >= date_trunc('month', now())",
  voice_ai: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'voice_ai' and created_at >= date_trunc('month', now())",
  bulk_email: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'bulk_email' and created_at >= date_trunc('month', now())",
  premium_ai_tasks: "select coalesce(sum(unit_count), 0)::int as current_usage from public.provider_usage_events where tenant_id = $1 and action_type = 'premium_ai_task' and created_at >= date_trunc('month', now())",
  byo_credential_vault: "select count(*)::int as current_usage from public.tenant_provider_credentials where tenant_id = $1 and status <> 'archived'",
  ai_search_visibility: "select count(*)::int as current_usage from public.ai_search_visibility_checks where tenant_id = $1 and created_at >= date_trunc('month', now())",
  seo_content_strategy: "select count(*)::int as current_usage from public.seo_content_strategy_items where tenant_id = $1 and created_at >= date_trunc('month', now())",
  authority_builder: "select count(*)::int as current_usage from public.seo_authority_tasks where tenant_id = $1 and created_at >= date_trunc('month', now())",
  cms_publishing_connections: "select count(*)::int as current_usage from public.brand_publishing_connections where tenant_id = $1 and status <> 'archived'",
  ai_monitoring_briefing: "select count(*)::int as current_usage from public.owner_daily_briefings where tenant_id = $1 and generated_at >= date_trunc('month', now())",
  labor_staffing_requests: "select count(*)::int as current_usage from public.labor_staffing_requests where tenant_id = $1 and created_at >= date_trunc('month', now())",
  labor_worker_intake: "select count(*)::int as current_usage from public.labor_worker_availability where tenant_id = $1 and source = 'public_form' and created_at >= date_trunc('month', now())",
  labor_match_suggestions: "select count(*)::int as current_usage from public.labor_staffing_matches where tenant_id = $1 and created_at >= date_trunc('month', now())"
};

export async function getServiceUsage(tenantId: string, featureKey: string) {
  const sql = serviceUsageSql[featureKey];
  if (!sql) return 0;

  const result = await queryPostgres<{ current_usage: number | string }>(sql, [tenantId]);
  return Number(result?.rows[0]?.current_usage ?? 0);
}

export async function getWorkspacePlanKey(tenantId: string): Promise<PlanKey> {
  const result = await queryPostgres<{ plan_key: string | null }>(
    `
    select coalesce(
      (
        select plan_key
        from public.billing_subscriptions
        where tenant_id = $1
          and status in ('trialing', 'active', 'past_due', 'manual', 'incomplete')
        order by updated_at desc nulls last, created_at desc
        limit 1
      ),
      (select plan_key from public.tenants where id = $1 limit 1),
      'free'
    ) as plan_key
    `,
    [tenantId]
  );

  return normalizePlanKey(result?.rows[0]?.plan_key);
}

export async function getServiceGate(tenantId: string, featureKey: string): Promise<ServiceGate> {
  const result = await queryPostgres<{
    feature_key: string;
    status: string;
    usage_limit: number | null;
    metadata_json: { approvalMode?: ServiceMode; overagePolicy?: OveragePolicy; description?: string } | null;
  }>(
    `
    select feature_key, status, usage_limit, metadata_json
    from public.workspace_feature_entitlements
    where tenant_id = $1 and feature_key = $2
    limit 1
    `,
    [tenantId, featureKey]
  );

  const row = result?.rows[0];
  const planKey = await getWorkspacePlanKey(tenantId);
  const minimumPlanKey = minimumPlanForFeature(featureKey);
  const planAllowed = planMeetsMinimum(planKey, minimumPlanKey);

  if (!row) {
    return {
      featureKey,
      enabled: false,
      status: "missing",
      mode: "off",
      usageLimit: null,
      currentUsage: 0,
      remaining: null,
      overagePolicy: "block",
      reason: "This service is not configured for the workspace yet.",
      planKey,
      minimumPlanKey,
      planAllowed
    };
  }

  const currentUsage = await getServiceUsage(tenantId, featureKey);
  const mode = row.status === "disabled" ? "off" : row.metadata_json?.approvalMode ?? "review_required";
  const overagePolicy = row.metadata_json?.overagePolicy ?? "block";
  const remaining = row.usage_limit === null ? null : Math.max(row.usage_limit - currentUsage, 0);
  const limitReached = row.usage_limit !== null && currentUsage >= row.usage_limit;
  const enabled = planAllowed && row.status !== "disabled" && mode !== "off" && (!limitReached || overagePolicy !== "block");

  return {
    featureKey,
    enabled,
    status: row.status,
    mode,
    usageLimit: row.usage_limit,
    currentUsage,
    remaining,
    overagePolicy,
    reason: !enabled
      ? !planAllowed
        ? `Requires ${planName(minimumPlanKey)} plan or higher.`
        : limitReached
        ? "Monthly limit reached."
        : "Service is off."
      : row.metadata_json?.description ?? "Service is available.",
    planKey,
    minimumPlanKey,
    planAllowed
  };
}

export async function requireServiceGate(tenantId: string, featureKey: string) {
  const gate = await getServiceGate(tenantId, featureKey);
  return gate.enabled ? gate : null;
}
