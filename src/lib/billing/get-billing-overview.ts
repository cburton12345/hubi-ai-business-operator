import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type BillingPlanRow = {
  id: string;
  planKey: string;
  name: string;
  monthlyPriceCents: number;
  includedBrands: number;
  includedAiRuns: number;
};

export type BillingOverview = {
  subscription: {
    planKey: string;
    status: string;
    seats: number;
    currentPeriodEnd: string;
  } | null;
  plans: BillingPlanRow[];
  usage: {
    brands: number;
    users: number;
    aiRunsThisMonth: number;
    seoDraftsThisMonth: number;
    publishingQueueItems: number;
    reviewRequestsThisMonth: number;
    followUpsOpen: number;
  };
  featureGates: {
    featureKey: string;
    status: string;
    usageLimit: number | null;
    usagePeriod: string | null;
    currentUsage: number;
    remaining: number | null;
    label: string;
  }[];
  readiness: {
    label: string;
    status: "ready" | "needs_setup" | "blocked";
    detail: string;
  }[];
};

export async function getBillingOverview(): Promise<BillingOverview> {
  const workspaceId = await getCurrentWorkspaceId();
  const [subscription, plans, usageResult, gatesResult, stripeResult] = await Promise.all([
    queryPostgres<{ plan_key: string; status: string; seats: number; current_period_end: Date | null }>(
      "select plan_key, status, seats, current_period_end from public.billing_subscriptions where tenant_id = $1 limit 1",
      [workspaceId]
    ),
    queryPostgres<{ id: string; plan_key: string; name: string; monthly_price_cents: number; included_brands: number; included_ai_runs: number }>(
      "select id, plan_key, name, monthly_price_cents, included_brands, included_ai_runs from public.billing_plans where active = true order by monthly_price_cents",
      []
    ),
    queryPostgres<{
      brands: string;
      users: string;
      ai_runs_this_month: string;
      seo_drafts_this_month: string;
      publishing_queue_items: string;
      review_requests_this_month: string;
      followups_open: string;
    }>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status = 'active') as brands,
        (select count(*) from public.tenant_users where tenant_id = $1) as users,
        (select count(*) from public.ai_generation_runs where tenant_id = $1 and created_at >= date_trunc('month', now())) as ai_runs_this_month,
        (
          select count(*) from public.ai_drafts
          where tenant_id = $1 and content_type in ('blog', 'city_page', 'service_page', 'gbp_post')
            and created_at >= date_trunc('month', now())
        ) as seo_drafts_this_month,
        (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status <> 'canceled') as publishing_queue_items,
        (
          select count(*) from public.review_request_workflows
          where tenant_id = $1 and created_at >= date_trunc('month', now())
        ) as review_requests_this_month,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open', 'scheduled', 'missed')) as followups_open
      `,
      [workspaceId]
    ),
    queryPostgres<{
      feature_key: string;
      status: string;
      usage_limit: number | null;
      usage_period: string | null;
      metadata_json: { description?: string } | null;
    }>(
      `
      select feature_key, status, usage_limit, usage_period, metadata_json
      from public.workspace_feature_entitlements
      where tenant_id = $1
      order by feature_key
      `,
      [workspaceId]
    ),
    queryPostgres<{ status: string; credentials_status: string }>(
      `
      select status, credentials_status
      from public.integration_connections
      where tenant_id = $1 and provider = 'stripe'
      limit 1
      `,
      [workspaceId]
    )
  ]);
  const sub = subscription?.rows[0];
  const usageRow = usageResult?.rows[0];
  const usage = {
    brands: Number(usageRow?.brands ?? 0),
    users: Number(usageRow?.users ?? 0),
    aiRunsThisMonth: Number(usageRow?.ai_runs_this_month ?? 0),
    seoDraftsThisMonth: Number(usageRow?.seo_drafts_this_month ?? 0),
    publishingQueueItems: Number(usageRow?.publishing_queue_items ?? 0),
    reviewRequestsThisMonth: Number(usageRow?.review_requests_this_month ?? 0),
    followUpsOpen: Number(usageRow?.followups_open ?? 0)
  };
  const usageForFeature = (featureKey: string) => {
    if (featureKey === "seo_autopilot") return usage.seoDraftsThisMonth;
    if (featureKey === "publishing_queue") return usage.publishingQueueItems;
    if (featureKey === "review_requests") return usage.reviewRequestsThisMonth;
    if (featureKey === "follow_up_recovery") return usage.followUpsOpen;
    return 0;
  };
  const stripe = stripeResult?.rows[0];

  return {
    subscription: sub
      ? {
          planKey: sub.plan_key,
          status: sub.status,
          seats: sub.seats,
          currentPeriodEnd: sub.current_period_end?.toISOString() ?? ""
        }
      : null,
    plans: (plans?.rows ?? []).map((plan) => ({
      id: plan.id,
      planKey: plan.plan_key,
      name: plan.name,
      monthlyPriceCents: plan.monthly_price_cents,
      includedBrands: plan.included_brands,
      includedAiRuns: plan.included_ai_runs
    })),
    usage,
    featureGates: (gatesResult?.rows ?? []).map((gate) => {
      const currentUsage = usageForFeature(gate.feature_key);
      return {
        featureKey: gate.feature_key,
        status: gate.status,
        usageLimit: gate.usage_limit,
        usagePeriod: gate.usage_period,
        currentUsage,
        remaining: gate.usage_limit === null ? null : Math.max(gate.usage_limit - currentUsage, 0),
        label: gate.metadata_json?.description ?? gate.feature_key.replaceAll("_", " ")
      };
    }),
    readiness: [
      {
        label: "Stripe connection",
        status: stripe?.status === "connected" && stripe.credentials_status === "configured" ? "ready" : "needs_setup",
        detail: stripe?.status === "connected" ? "Stripe is marked connected." : "Add Stripe keys and webhook secret before paid subscriptions are live."
      },
      {
        label: "Subscription record",
        status: sub ? "ready" : "needs_setup",
        detail: sub ? `Workspace is on ${sub.plan_key}.` : "Create a subscription record before enforcing plan limits."
      },
      {
        label: "Plan limits",
        status: plans?.rows?.length ? "ready" : "blocked",
        detail: plans?.rows?.length ? "Plans are available for gating." : "No active billing plans are configured."
      }
    ]
  };
}
