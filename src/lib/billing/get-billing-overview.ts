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
};

export async function getBillingOverview(): Promise<BillingOverview> {
  const workspaceId = await getCurrentWorkspaceId();
  const [subscription, plans] = await Promise.all([
    queryPostgres<{ plan_key: string; status: string; seats: number; current_period_end: Date | null }>(
      "select plan_key, status, seats, current_period_end from public.billing_subscriptions where tenant_id = $1 limit 1",
      [workspaceId]
    ),
    queryPostgres<{ id: string; plan_key: string; name: string; monthly_price_cents: number; included_brands: number; included_ai_runs: number }>(
      "select id, plan_key, name, monthly_price_cents, included_brands, included_ai_runs from public.billing_plans where active = true order by monthly_price_cents",
      []
    )
  ]);
  const sub = subscription?.rows[0];

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
    }))
  };
}
