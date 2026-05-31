import { queryPostgres } from "@/lib/db/postgres";

export type ServiceMode = "off" | "draft_only" | "review_required" | "enabled";
export type OveragePolicy = "block" | "allow_with_review" | "allow";

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
};

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
  marketplacepro_import: "select count(*)::int as current_usage from public.marketplacepro_integration_events where tenant_id = $1 and created_at >= date_trunc('month', now())"
};

export async function getServiceUsage(tenantId: string, featureKey: string) {
  const sql = serviceUsageSql[featureKey];
  if (!sql) return 0;

  const result = await queryPostgres<{ current_usage: number | string }>(sql, [tenantId]);
  return Number(result?.rows[0]?.current_usage ?? 0);
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
      reason: "This service is not configured for the workspace yet."
    };
  }

  const currentUsage = await getServiceUsage(tenantId, featureKey);
  const mode = row.status === "disabled" ? "off" : row.metadata_json?.approvalMode ?? "review_required";
  const overagePolicy = row.metadata_json?.overagePolicy ?? "block";
  const remaining = row.usage_limit === null ? null : Math.max(row.usage_limit - currentUsage, 0);
  const limitReached = row.usage_limit !== null && currentUsage >= row.usage_limit;
  const enabled = row.status !== "disabled" && mode !== "off" && (!limitReached || overagePolicy !== "block");

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
      ? limitReached
        ? "Monthly limit reached."
        : "Service is off."
      : row.metadata_json?.description ?? "Service is available."
  };
}

export async function requireServiceGate(tenantId: string, featureKey: string) {
  const gate = await getServiceGate(tenantId, featureKey);
  return gate.enabled ? gate : null;
}
