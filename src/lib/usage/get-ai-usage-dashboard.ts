import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type AiUsageDashboard = {
  period: {
    start: string;
    end: string;
  };
  rows: Array<{
    featureKey: string;
    unitType: string;
    includedQuantity: number;
    usedQuantity: number;
    remainingQuantity: number | null;
    overageQuantity: number;
    estimatedChargeCents: number;
    overageMode: string;
    status: string;
  }>;
  bundles: Array<{
    displayName: string;
    featureKey: string;
    unitType: string;
    purchasedQuantity: number;
    usedQuantity: number;
    remainingQuantity: number;
    status: string;
  }>;
  totals: {
    estimatedChargesCents: number;
    customerChargeCents: number;
  };
  spendLimits: Array<{
    scopeType: string;
    scopeKey: string | null;
    status: string;
    emergencyPaused: boolean;
    monthlyProviderCostCapCents: number | null;
    monthlyCustomerChargeCapCents: number | null;
    concurrentCallLimit: number | null;
    maxCallDurationSeconds: number | null;
    failedPaymentBehavior: string;
  }>;
};

function num(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function currentPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export async function getAiUsageDashboard(): Promise<AiUsageDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const period = currentPeriod();
  const [allowanceResult, usageResult, bundleResult, totalResult, spendLimitResult] = await Promise.all([
    queryPostgres<{
      feature_key: string;
      unit_type: string;
      included_quantity: string;
      overage_mode: string;
      status: string;
    }>(
      `
      select feature_key, unit_type, included_quantity::text, overage_mode, status
      from public.usage_allowance_policies
      where (tenant_id = $1 or tenant_id is null)
        and status in ('planned','active')
      order by tenant_id nulls last, feature_key, unit_type
      `,
      [workspaceId]
    ),
    queryPostgres<{
      feature_key: string;
      unit_type: string;
      quantity: string;
      customer_charge_cents: string;
    }>(
      `
      select feature_key, unit_type, coalesce(sum(quantity), 0)::text as quantity,
             coalesce(sum(customer_charge_cents), 0)::text as customer_charge_cents
      from public.usage_meter_events
      where tenant_id = $1
        and billing_period_start = $2::date
      group by feature_key, unit_type
      `,
      [workspaceId, period.start]
    ),
    queryPostgres<{
      display_name: string;
      feature_key: string;
      unit_type: string;
      purchased_quantity: string;
      used_quantity: string;
      status: string;
    }>(
      `
      select b.display_name, b.feature_key, b.unit_type, p.purchased_quantity::text, p.used_quantity::text, p.status
      from public.usage_bundle_purchases p
      join public.usage_bundles b on b.id = p.bundle_id
      where p.tenant_id = $1
      order by p.created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      customer_charge_cents: string;
    }>(
      `
      select coalesce(sum(customer_charge_cents), 0)::text as customer_charge_cents
      from public.usage_meter_events
      where tenant_id = $1
        and billing_period_start = $2::date
      `,
      [workspaceId, period.start]
    ),
    queryPostgres<{
      scope_type: string;
      scope_key: string | null;
      status: string;
      emergency_paused: boolean;
      monthly_provider_cost_cap_cents: string | null;
      monthly_customer_charge_cap_cents: string | null;
      concurrent_call_limit: string | null;
      max_call_duration_seconds: string | null;
      failed_payment_behavior: string;
    }>(
      `
      select scope_type, scope_key, status, emergency_paused,
             monthly_provider_cost_cap_cents::text,
             monthly_customer_charge_cap_cents::text,
             concurrent_call_limit::text,
             max_call_duration_seconds::text,
             failed_payment_behavior
      from public.spend_limits
      where tenant_id = $1 or tenant_id is null
      order by tenant_id nulls last, scope_type, scope_key
      limit 20
      `,
      [workspaceId]
    )
  ]);

  const usage = new Map(
    (usageResult?.rows ?? []).map((row) => [`${row.feature_key}:${row.unit_type}`, row])
  );
  const seen = new Set<string>();
  const rows = (allowanceResult?.rows ?? []).map((allowance) => {
    const key = `${allowance.feature_key}:${allowance.unit_type}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const row = usage.get(key);
    const included = num(allowance.included_quantity);
    const used = num(row?.quantity);
    const remaining = included > 0 ? Math.max(0, included - used) : null;
    return {
      featureKey: allowance.feature_key,
      unitType: allowance.unit_type,
      includedQuantity: included,
      usedQuantity: used,
      remainingQuantity: remaining,
      overageQuantity: Math.max(0, used - included),
      estimatedChargeCents: num(row?.customer_charge_cents),
      overageMode: allowance.overage_mode,
      status: allowance.status
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const totals = totalResult?.rows[0];

  return {
    period,
    rows,
    bundles: (bundleResult?.rows ?? []).map((bundle) => {
      const purchased = num(bundle.purchased_quantity);
      const used = num(bundle.used_quantity);
      return {
        displayName: bundle.display_name,
        featureKey: bundle.feature_key,
        unitType: bundle.unit_type,
        purchasedQuantity: purchased,
        usedQuantity: used,
        remainingQuantity: Math.max(0, purchased - used),
        status: bundle.status
      };
    }),
    totals: {
      estimatedChargesCents: num(totals?.customer_charge_cents),
      customerChargeCents: num(totals?.customer_charge_cents)
    },
    spendLimits: (spendLimitResult?.rows ?? []).map((limit) => ({
      scopeType: limit.scope_type,
      scopeKey: limit.scope_key,
      status: limit.status,
      emergencyPaused: limit.emergency_paused,
      monthlyProviderCostCapCents: limit.monthly_provider_cost_cap_cents === null ? null : num(limit.monthly_provider_cost_cap_cents),
      monthlyCustomerChargeCapCents: limit.monthly_customer_charge_cap_cents === null ? null : num(limit.monthly_customer_charge_cap_cents),
      concurrentCallLimit: limit.concurrent_call_limit === null ? null : num(limit.concurrent_call_limit),
      maxCallDurationSeconds: limit.max_call_duration_seconds === null ? null : num(limit.max_call_duration_seconds),
      failedPaymentBehavior: limit.failed_payment_behavior
    }))
  };
}
