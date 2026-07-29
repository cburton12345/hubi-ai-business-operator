import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type AiControlDashboard = {
  workspaceId: string;
  summary: {
    requestsToday: number;
    requestsThisMonth: number;
    estimatedCostCentsThisMonth: number;
    fallbackCountThisMonth: number;
    premiumMediaRequestsThisMonth: number;
  };
  providers: Array<{
    providerKey: string;
    displayName: string;
    status: string;
    family: string;
    defaultModel: string | null;
    costCategory: string;
    capabilities: string[];
  }>;
  usageByFeature: Array<{
    featureKey: string;
    requests: number;
    estimatedCostCents: number;
    fallbackCount: number;
  }>;
  policies: Array<{
    id: string;
    scopeType: string;
    aiCategory: string;
    monthlyCapCents: number | null;
    monthlyRequestCap: number | null;
    emergencyPaused: boolean;
    status: string;
  }>;
};

const fallbackProviders = [
  {
    providerKey: "openai",
    displayName: "OpenAI",
    status: process.env.OPENAI_API_KEY ? "configured" : "missing key",
    family: "text",
    defaultModel: process.env.AI_MODEL || "gpt-4.1-mini",
    costCategory: "core",
    capabilities: ["text", "json", "vision"]
  },
  {
    providerKey: "premium_video",
    displayName: "Premium video providers",
    status: "planned",
    family: "video",
    defaultModel: null,
    costCategory: "premium_media",
    capabilities: ["video", "image", "voice"]
  }
];

function cents(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function getAiControlDashboard(): Promise<AiControlDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [summaryResult, providersResult, usageResult, policiesResult] = await Promise.all([
    queryPostgres<{
      today: string | number;
      month: string | number;
      estimated_cost_cents: string | number;
      fallback_count: string | number;
      premium_media: string | number;
    }>(
      `
      select
        count(*) filter (where created_at >= date_trunc('day', now())) as today,
        count(*) filter (where created_at >= date_trunc('month', now())) as month,
        coalesce(sum(estimated_cost_cents) filter (where created_at >= date_trunc('month', now())), 0) as estimated_cost_cents,
        count(*) filter (where fallback_used = true and created_at >= date_trunc('month', now())) as fallback_count,
        count(*) filter (where ai_category = 'premium_media' and created_at >= date_trunc('month', now())) as premium_media
      from public.ai_usage_events
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      provider_key: string;
      display_name: string;
      status: string;
      provider_family: string;
      default_model: string | null;
      cost_category: string;
      supports_text: boolean;
      supports_json: boolean;
      supports_vision: boolean;
      supports_image: boolean;
      supports_video: boolean;
      supports_voice: boolean;
    }>(
      `
      select provider_key, display_name, status, provider_family, default_model, cost_category,
        supports_text, supports_json, supports_vision, supports_image, supports_video, supports_voice
      from public.ai_provider_configs
      order by priority asc, display_name asc
      `,
      []
    ),
    queryPostgres<{
      feature_key: string;
      requests: string | number;
      estimated_cost_cents: string | number;
      fallback_count: string | number;
    }>(
      `
      select feature_key,
        count(*) as requests,
        coalesce(sum(estimated_cost_cents), 0) as estimated_cost_cents,
        count(*) filter (where fallback_used = true) as fallback_count
      from public.ai_usage_events
      where tenant_id = $1 and created_at >= date_trunc('month', now())
      group by feature_key
      order by requests desc, feature_key asc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      scope_type: string;
      ai_category: string;
      monthly_cap_cents: string | number | null;
      monthly_request_cap: number | null;
      emergency_paused: boolean;
      status: string;
    }>(
      `
      select id, scope_type, ai_category, monthly_cap_cents, monthly_request_cap, emergency_paused, status
      from public.ai_budget_policies
      where tenant_id = $1 or tenant_id is null
      order by tenant_id nulls first, ai_category, scope_type
      limit 20
      `,
      [workspaceId]
    )
  ]);

  const summary = summaryResult?.rows[0];
  const providers = providersResult?.rows?.map((provider) => ({
    providerKey: provider.provider_key,
    displayName: provider.display_name,
    status: provider.status,
    family: provider.provider_family,
    defaultModel: provider.default_model,
    costCategory: provider.cost_category,
    capabilities: [
      provider.supports_text ? "text" : null,
      provider.supports_json ? "json" : null,
      provider.supports_vision ? "vision" : null,
      provider.supports_image ? "image" : null,
      provider.supports_video ? "video" : null,
      provider.supports_voice ? "voice" : null
    ].filter(Boolean) as string[]
  }));

  return {
    workspaceId,
    summary: {
      requestsToday: Number(summary?.today ?? 0),
      requestsThisMonth: Number(summary?.month ?? 0),
      estimatedCostCentsThisMonth: cents(summary?.estimated_cost_cents),
      fallbackCountThisMonth: Number(summary?.fallback_count ?? 0),
      premiumMediaRequestsThisMonth: Number(summary?.premium_media ?? 0)
    },
    providers: providers?.length ? providers : fallbackProviders,
    usageByFeature: (usageResult?.rows ?? []).map((row) => ({
      featureKey: row.feature_key,
      requests: Number(row.requests ?? 0),
      estimatedCostCents: cents(row.estimated_cost_cents),
      fallbackCount: Number(row.fallback_count ?? 0)
    })),
    policies: (policiesResult?.rows ?? []).map((row) => ({
      id: row.id,
      scopeType: row.scope_type,
      aiCategory: row.ai_category,
      monthlyCapCents: row.monthly_cap_cents === null ? null : cents(row.monthly_cap_cents),
      monthlyRequestCap: row.monthly_request_cap,
      emergencyPaused: row.emergency_paused,
      status: row.status
    }))
  };
}
