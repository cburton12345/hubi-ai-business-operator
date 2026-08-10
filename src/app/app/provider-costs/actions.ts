"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { evaluateProviderFundingAlerts, getProviderFundingDashboard } from "@/lib/usage/provider-funding";

const optionalMoney = z.union([z.literal(""), z.coerce.number().min(0).max(5_000_000)]).optional();
const accountSchema = z.object({
  accountId: z.union([z.literal(""), z.string().uuid()]).optional(),
  tenantId: z.union([z.literal(""), z.string().uuid()]).optional(),
  providerKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9_:-]+$/),
  accountKey: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9_.:-]+$/),
  displayName: z.string().trim().min(2).max(120),
  capabilityKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9_:-]+$/),
  ownershipMode: z.enum(["ferocity_managed", "customer_owned"]),
  configuredStatus: z.enum(["setup_required", "needs_sync", "active", "low_balance", "critical", "depleted", "payment_issue", "paused"]),
  balanceTrackingMode: z.enum(["provider_api", "provider_webhook", "manual", "inferred"]),
  currentBalance: optionalMoney,
  promotionalBalance: optionalMoney,
  promotionalExpiresAt: z.union([z.literal(""), z.string().date()]).optional(),
  reloadEnabled: z.boolean(),
  reloadTrigger: optionalMoney,
  reloadAmount: optionalMoney,
  monthlyReloadLimit: optionalMoney,
  monthlyProviderSpendCap: optionalMoney,
  lowBalanceThreshold: optionalMoney,
  criticalBalanceThreshold: optionalMoney,
  paymentStatus: z.enum(["unknown", "current", "action_required", "failed", "expired"]),
  syncStatus: z.enum(["never", "current", "stale", "failed", "unsupported"]),
  notes: z.string().trim().max(1500).optional()
});

const reconciliationSchema = z.object({
  accountId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  providerStatementAmount: z.coerce.number().min(0).max(5_000_000),
  providerStatementRef: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1500).optional()
});

function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === "true";
}

function nullableCents(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : Math.round(value * 100);
}

export async function saveProviderFundingAccountAction(formData: FormData) {
  await requirePermission("platform:manage");
  const parsed = accountSchema.safeParse({
    accountId: formData.get("accountId") ?? "",
    tenantId: formData.get("tenantId") ?? "",
    providerKey: formData.get("providerKey"),
    accountKey: formData.get("accountKey"),
    displayName: formData.get("displayName"),
    capabilityKey: formData.get("capabilityKey"),
    ownershipMode: formData.get("ownershipMode"),
    configuredStatus: formData.get("configuredStatus"),
    balanceTrackingMode: formData.get("balanceTrackingMode"),
    currentBalance: formData.get("currentBalance") ?? "",
    promotionalBalance: formData.get("promotionalBalance") ?? "",
    promotionalExpiresAt: formData.get("promotionalExpiresAt") ?? "",
    reloadEnabled: formBoolean(formData, "reloadEnabled"),
    reloadTrigger: formData.get("reloadTrigger") ?? "",
    reloadAmount: formData.get("reloadAmount") ?? "",
    monthlyReloadLimit: formData.get("monthlyReloadLimit") ?? "",
    monthlyProviderSpendCap: formData.get("monthlyProviderSpendCap") ?? "",
    lowBalanceThreshold: formData.get("lowBalanceThreshold") ?? "",
    criticalBalanceThreshold: formData.get("criticalBalanceThreshold") ?? "",
    paymentStatus: formData.get("paymentStatus"),
    syncStatus: formData.get("syncStatus"),
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return;
  const data = parsed.data;
  const tenantId = data.tenantId || null;
  const currentBalanceCents = nullableCents(data.currentBalance);
  const promotionalBalanceCents = nullableCents(data.promotionalBalance);
  const values = [
    tenantId,
    data.providerKey,
    data.accountKey,
    data.displayName,
    data.capabilityKey,
    data.ownershipMode,
    data.configuredStatus,
    data.balanceTrackingMode,
    currentBalanceCents,
    promotionalBalanceCents,
    data.promotionalExpiresAt || null,
    data.reloadEnabled,
    nullableCents(data.reloadTrigger),
    nullableCents(data.reloadAmount),
    nullableCents(data.monthlyReloadLimit),
    nullableCents(data.monthlyProviderSpendCap),
    nullableCents(data.lowBalanceThreshold),
    nullableCents(data.criticalBalanceThreshold),
    data.paymentStatus,
    data.syncStatus,
    data.syncStatus === "current" ? new Date().toISOString() : null,
    data.notes ?? ""
  ];

  let accountId = data.accountId || null;
  if (!accountId) {
    const existing = await queryPostgres<{ id: string }>(
      `
      select id
      from public.provider_funding_accounts
      where tenant_id is not distinct from $1::uuid
        and provider_key = $2
        and account_key = $3
      limit 1
      `,
      [tenantId, data.providerKey, data.accountKey]
    );
    accountId = existing?.rows[0]?.id ?? null;
  }
  if (accountId) {
    const result = await queryPostgres<{ id: string }>(
      `
      update public.provider_funding_accounts
      set tenant_id = $1, provider_key = $2, account_key = $3, display_name = $4,
          capability_key = $5, ownership_mode = $6, status = $7, balance_tracking_mode = $8,
          current_balance_cents = $9, promotional_balance_cents = $10,
          promotional_expires_at = $11::timestamptz, reload_enabled = $12,
          reload_trigger_balance_cents = $13, reload_amount_cents = $14,
          monthly_reload_limit_cents = $15, monthly_provider_spend_cap_cents = $16,
          low_balance_threshold_cents = $17, critical_balance_threshold_cents = $18,
          payment_status = $19, sync_status = $20,
          last_balance_sync_at = coalesce($21::timestamptz, last_balance_sync_at),
          next_balance_sync_at = case when $20 = 'current' then now() + interval '24 hours' else next_balance_sync_at end,
          notes = $22, updated_at = now()
      where id = $23
      returning id
      `,
      [...values, accountId]
    );
    accountId = result?.rows[0]?.id ?? null;
  } else {
    const result = await queryPostgres<{ id: string }>(
      `
      insert into public.provider_funding_accounts (
        tenant_id, provider_key, account_key, display_name, capability_key, ownership_mode,
        status, balance_tracking_mode, current_balance_cents, promotional_balance_cents,
        promotional_expires_at, reload_enabled, reload_trigger_balance_cents, reload_amount_cents,
        monthly_reload_limit_cents, monthly_provider_spend_cap_cents,
        low_balance_threshold_cents, critical_balance_threshold_cents,
        payment_status, sync_status, last_balance_sync_at, next_balance_sync_at, notes
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        case when $20 = 'current' then now() + interval '24 hours' else null end,$22
      )
      returning id
      `,
      values
    );
    accountId = result?.rows[0]?.id ?? null;
  }

  if (accountId && (currentBalanceCents !== null || promotionalBalanceCents !== null)) {
    const usage = await queryPostgres<{
      provider_cost_cents: string | number;
      customer_charge_cents: string | number;
    }>(
      `
      select coalesce(sum(provider_cost_cents), 0) as provider_cost_cents,
             coalesce(sum(customer_charge_cents), 0) as customer_charge_cents
      from public.usage_meter_events
      where provider_key = $1
        and billing_period_start = date_trunc('month', now())::date
        and status not in ('void', 'failed')
        and ($2::uuid is null or tenant_id = $2)
        and (
          $2::uuid is not null
          or customer_charge_cents > 0
          or metadata_json->>'ownershipMode' = 'ferocity_managed'
          or metadata_json->>'providerCostBilledBy' = 'ferocity'
          or metadata_json->>'managedVoice' = 'true'
        )
      `,
      [data.providerKey, tenantId]
    );
    await queryPostgres(
      `
      insert into public.provider_funding_snapshots (
        funding_account_id, tenant_id, balance_cents, promotional_balance_cents, promotional_expires_at,
        tracked_provider_cost_cents, tracked_customer_charge_cents,
        source, sync_status, idempotency_key, observed_at, metadata_json
      )
      values ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9,now(),$10::jsonb)
      on conflict (funding_account_id, idempotency_key) do nothing
      `,
      [
        accountId,
        tenantId,
        currentBalanceCents,
        promotionalBalanceCents,
        data.promotionalExpiresAt || null,
        Number(usage?.rows[0]?.provider_cost_cents ?? 0),
        Number(usage?.rows[0]?.customer_charge_cents ?? 0),
        data.syncStatus === "current" ? "current" : "stale",
        `manual:${new Date().toISOString()}`,
        JSON.stringify({ recordedFrom: "provider_costs_dashboard" })
      ]
    );
  }

  if (accountId && tenantId === null && data.ownershipMode === "ferocity_managed") {
    await queryPostgres(
      `
      update public.managed_ad_budget_controls
      set provider_funding_account_id = $1::uuid, updated_at = now()
      where provider_key = $2
        and lane_key = 'ferocity_managed'
        and provider_funding_account_id is null
      `,
      [accountId, data.providerKey]
    );
  }

  await evaluateProviderFundingAlerts();
  revalidatePath("/app/provider-costs");
}

export async function reconcileProviderCostAction(formData: FormData) {
  await requirePermission("platform:manage");
  const parsed = reconciliationSchema.safeParse({
    accountId: formData.get("accountId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    providerStatementAmount: formData.get("providerStatementAmount"),
    providerStatementRef: formData.get("providerStatementRef") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return;

  const account = await queryPostgres<{
    id: string;
    tenant_id: string | null;
    provider_key: string;
    ownership_mode: "ferocity_managed" | "customer_owned";
  }>(
    `select id, tenant_id, provider_key, ownership_mode from public.provider_funding_accounts where id = $1 limit 1`,
    [parsed.data.accountId]
  );
  const row = account?.rows[0];
  if (!row) return;
  const tracked = await queryPostgres<{
    provider_cost_cents: string | number;
    customer_charge_cents: string | number;
  }>(
    `
    select coalesce(sum(provider_cost_cents), 0) as provider_cost_cents,
           coalesce(sum(customer_charge_cents), 0) as customer_charge_cents
    from public.usage_meter_events
    where provider_key = $1
      and occurred_at >= $2::date
      and occurred_at < ($3::date + interval '1 day')
      and status not in ('void', 'failed')
      and ($4::uuid is null or tenant_id = $4)
      and (
        $5 = 'customer_owned'
        or customer_charge_cents > 0
        or metadata_json->>'ownershipMode' = 'ferocity_managed'
        or metadata_json->>'providerCostBilledBy' = 'ferocity'
        or metadata_json->>'managedVoice' = 'true'
      )
    `,
    [row.provider_key, parsed.data.periodStart, parsed.data.periodEnd, row.tenant_id, row.ownership_mode]
  );
  const trackedCost = Number(tracked?.rows[0]?.provider_cost_cents ?? 0);
  const trackedCharge = Number(tracked?.rows[0]?.customer_charge_cents ?? 0);
  const providerStatementCost = Math.round(parsed.data.providerStatementAmount * 100);
  const variance = providerStatementCost - trackedCost;
  const status = Math.abs(variance) <= 1 ? "matched" : "needs_review";

  await queryPostgres(
    `
    insert into public.provider_cost_reconciliations (
      funding_account_id, tenant_id, period_start, period_end,
      provider_statement_cost_cents, tracked_provider_cost_cents,
      tracked_customer_charge_cents, variance_cents, status,
      provider_statement_ref, notes, reconciled_at, updated_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
    on conflict (funding_account_id, period_start, period_end) do update
    set provider_statement_cost_cents = excluded.provider_statement_cost_cents,
        tracked_provider_cost_cents = excluded.tracked_provider_cost_cents,
        tracked_customer_charge_cents = excluded.tracked_customer_charge_cents,
        variance_cents = excluded.variance_cents,
        status = excluded.status,
        provider_statement_ref = excluded.provider_statement_ref,
        notes = excluded.notes,
        reconciled_at = now(),
        updated_at = now()
    `,
    [
      row.id,
      row.tenant_id,
      parsed.data.periodStart,
      parsed.data.periodEnd,
      providerStatementCost,
      trackedCost,
      trackedCharge,
      variance,
      status,
      parsed.data.providerStatementRef ?? "",
      parsed.data.notes ?? ""
    ]
  );
  revalidatePath("/app/provider-costs");
}

export async function approveRecommendedProviderCapAction(formData: FormData) {
  await requirePermission("platform:manage");
  const parsed = z.object({ accountId: z.string().uuid() }).safeParse({ accountId: formData.get("accountId") });
  if (!parsed.success) return;

  const dashboard = await getProviderFundingDashboard();
  const account = dashboard.accounts.find((item) => item.id === parsed.data.accountId);
  const currentCap = account?.monthlyProviderSpendCapCents;
  if (!account || !currentCap || currentCap <= 0) return;

  const recommendedCapCents = Math.min(
    5_000_000,
    Math.ceil(Math.max(currentCap * 2, account.health.projectedMonthlyProviderCostCents * 1.25, currentCap + 10_000) / 1000) * 1000
  );

  await queryPostgres(
    `
    update public.provider_funding_accounts
    set monthly_provider_spend_cap_cents = greatest(coalesce(monthly_provider_spend_cap_cents, 0), $2),
        monthly_reload_limit_cents = case
          when reload_enabled then greatest(coalesce(monthly_reload_limit_cents, 0), $2)
          else monthly_reload_limit_cents
        end,
        metadata_json = metadata_json || jsonb_build_object(
          'lastApprovedCapIncreaseAt', now(),
          'lastApprovedCapIncreaseFromCents', monthly_provider_spend_cap_cents,
          'lastApprovedCapIncreaseToCents', $2::numeric
        ),
        updated_at = now()
    where id = $1
    `,
    [account.id, recommendedCapCents]
  );
  await queryPostgres(
    `update public.provider_funding_alerts set status='resolved', resolved_at=now(), updated_at=now() where funding_account_id=$1 and alert_key='capacity:monthly'`,
    [account.id]
  );
  await evaluateProviderFundingAlerts();
  revalidatePath("/app/provider-costs");
}
