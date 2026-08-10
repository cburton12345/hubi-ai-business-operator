import { queryPostgres } from "@/lib/db/postgres";

export type FundingHealthStatus =
  | "healthy"
  | "watch"
  | "low"
  | "critical"
  | "depleted"
  | "payment_issue"
  | "needs_sync";

export type ProviderFundingAccountRow = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  provider_key: string;
  account_key: string;
  display_name: string;
  capability_key: string;
  ownership_mode: "ferocity_managed" | "customer_owned";
  status: string;
  currency: string;
  balance_tracking_mode: string;
  current_balance_cents: string | number | null;
  promotional_balance_cents: string | number | null;
  promotional_expires_at: string | null;
  reload_enabled: boolean;
  reload_trigger_balance_cents: string | number | null;
  reload_amount_cents: string | number | null;
  monthly_reload_limit_cents: string | number | null;
  monthly_provider_spend_cap_cents: string | number | null;
  low_balance_threshold_cents: string | number | null;
  critical_balance_threshold_cents: string | number | null;
  payment_status: string;
  sync_status: string;
  last_balance_sync_at: string | null;
  next_balance_sync_at: string | null;
  notes: string;
  metadata_json: Record<string, unknown>;
  monthly_provider_cost_cents: string | number;
  monthly_customer_charge_cents: string | number;
  monthly_quantity: string | number;
};

export type ProviderFundingHealth = {
  status: FundingHealthStatus;
  balanceCents: number | null;
  promotionalBalanceCents: number;
  promotionalExpiresAt: string | null;
  totalAvailableCents: number | null;
  monthlyProviderCostCents: number;
  monthlyCustomerChargeCents: number;
  grossMarginCents: number;
  grossMarginPercent: number | null;
  averageDailyBurnCents: number;
  projectedMonthlyProviderCostCents: number;
  estimatedDaysRemaining: number | null;
  needsReload: boolean;
  reason: string;
};

export type ProviderFundingAccount = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  providerKey: string;
  accountKey: string;
  displayName: string;
  capabilityKey: string;
  ownershipMode: "ferocity_managed" | "customer_owned";
  configuredStatus: string;
  currency: string;
  balanceTrackingMode: string;
  reloadEnabled: boolean;
  reloadTriggerBalanceCents: number | null;
  reloadAmountCents: number | null;
  monthlyReloadLimitCents: number | null;
  monthlyProviderSpendCapCents: number | null;
  lowBalanceThresholdCents: number | null;
  criticalBalanceThresholdCents: number | null;
  paymentStatus: string;
  syncStatus: string;
  lastBalanceSyncAt: string | null;
  nextBalanceSyncAt: string | null;
  notes: string;
  metadata: Record<string, unknown>;
  health: ProviderFundingHealth;
};

export type ProviderFundingDashboard = {
  accounts: ProviderFundingAccount[];
  activeAlerts: Array<{
    id: string;
    accountId: string;
    severity: "low" | "medium" | "high";
    title: string;
    summary: string;
    lastSeenAt: string;
    metadata: Record<string, unknown>;
  }>;
  untrackedProviders: Array<{
    providerKey: string;
    providerCostCents: number;
    customerChargeCents: number;
    quantity: number;
  }>;
  managedAds: Array<{
    providerKey: string;
    prepaidBalanceCents: number;
    reservedCents: number;
    spentCents: number;
    availableCents: number;
    dailyCapCents: number;
    monthlyCapCents: number;
    tenantCount: number;
  }>;
  totals: {
    availableProviderBalanceCents: number;
    monthlyProviderCostCents: number;
    monthlyCustomerChargeCents: number;
    grossMarginCents: number;
    activeAlertCount: number;
  };
};

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function daysInCurrentMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
}

export function calculateProviderFundingHealth(
  input: {
    currentBalanceCents: number | null;
    promotionalBalanceCents?: number | null;
    promotionalExpiresAt?: string | null;
    monthlyProviderCostCents: number;
    monthlyCustomerChargeCents: number;
    reloadEnabled: boolean;
    reloadTriggerBalanceCents: number | null;
    lowBalanceThresholdCents: number | null;
    criticalBalanceThresholdCents: number | null;
    paymentStatus: string;
    syncStatus: string;
    lastBalanceSyncAt: string | null;
  },
  now = new Date()
): ProviderFundingHealth {
  const balanceCents = input.currentBalanceCents;
  const promotionExpired = input.promotionalExpiresAt
    ? new Date(input.promotionalExpiresAt).getTime() <= now.getTime()
    : false;
  const promotionalBalanceCents = promotionExpired ? 0 : Math.max(0, input.promotionalBalanceCents ?? 0);
  const totalAvailableCents = balanceCents === null ? null : Math.max(0, balanceCents + promotionalBalanceCents);
  const monthlyProviderCostCents = Math.max(0, input.monthlyProviderCostCents);
  const monthlyCustomerChargeCents = Math.max(0, input.monthlyCustomerChargeCents);
  const grossMarginCents = monthlyCustomerChargeCents - monthlyProviderCostCents;
  const grossMarginPercent =
    monthlyCustomerChargeCents > 0 ? Math.round((grossMarginCents / monthlyCustomerChargeCents) * 1000) / 10 : null;
  const elapsedDays = Math.max(1, now.getUTCDate());
  const averageDailyBurnCents = monthlyProviderCostCents / elapsedDays;
  const projectedMonthlyProviderCostCents = Math.ceil(averageDailyBurnCents * daysInCurrentMonth(now));
  const estimatedDaysRemaining =
    totalAvailableCents === null || averageDailyBurnCents <= 0
      ? null
      : Math.max(0, Math.round((totalAvailableCents / averageDailyBurnCents) * 10) / 10);
  const lowThreshold = input.lowBalanceThresholdCents ?? input.reloadTriggerBalanceCents ?? 0;
  const criticalThreshold = input.criticalBalanceThresholdCents ?? Math.min(lowThreshold, Math.max(0, lowThreshold / 2));
  const needsReload =
    totalAvailableCents !== null
    && input.reloadEnabled
    && input.reloadTriggerBalanceCents !== null
    && totalAvailableCents <= input.reloadTriggerBalanceCents;
  const lastSyncMs = input.lastBalanceSyncAt ? new Date(input.lastBalanceSyncAt).getTime() : Number.NaN;
  const stale = input.syncStatus !== "current"
    || !Number.isFinite(lastSyncMs)
    || now.getTime() - lastSyncMs > 36 * 60 * 60 * 1000;

  let status: FundingHealthStatus = "healthy";
  let reason = "Provider funding is healthy.";

  if (["failed", "expired", "action_required"].includes(input.paymentStatus)) {
    status = "payment_issue";
    reason = "The provider payment method needs attention.";
  } else if (totalAvailableCents === null || stale) {
    status = "needs_sync";
    reason = totalAvailableCents === null
      ? "The provider balance has not been recorded."
      : "The provider balance is stale and should be refreshed.";
  } else if (totalAvailableCents <= 0) {
    status = "depleted";
    reason = "The provider balance is depleted.";
  } else if (totalAvailableCents <= criticalThreshold || (estimatedDaysRemaining !== null && estimatedDaysRemaining <= 2)) {
    status = "critical";
    reason = needsReload
      ? "The balance is critical and the provider reload should be verified now."
      : "The balance is critical and service interruption is likely.";
  } else if (totalAvailableCents <= lowThreshold || (estimatedDaysRemaining !== null && estimatedDaysRemaining <= 7)) {
    status = "low";
    reason = needsReload
      ? "The balance is below its reload trigger; verify that the reload succeeds."
      : "The balance is low and needs attention.";
  } else if (
    estimatedDaysRemaining !== null
    && estimatedDaysRemaining <= 14
  ) {
    status = "watch";
    reason = "The projected balance runway is under two weeks.";
  }

  return {
    status,
    balanceCents,
    promotionalBalanceCents,
    promotionalExpiresAt: input.promotionalExpiresAt ?? null,
    totalAvailableCents,
    monthlyProviderCostCents,
    monthlyCustomerChargeCents,
    grossMarginCents,
    grossMarginPercent,
    averageDailyBurnCents,
    projectedMonthlyProviderCostCents,
    estimatedDaysRemaining,
    needsReload,
    reason
  };
}

function toAccount(row: ProviderFundingAccountRow, now = new Date()): ProviderFundingAccount {
  const currentBalanceCents = nullableNumber(row.current_balance_cents);
  const promotionalBalanceCents = nullableNumber(row.promotional_balance_cents);
  const reloadTriggerBalanceCents = nullableNumber(row.reload_trigger_balance_cents);
  const lowBalanceThresholdCents = nullableNumber(row.low_balance_threshold_cents);
  const criticalBalanceThresholdCents = nullableNumber(row.critical_balance_threshold_cents);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    providerKey: row.provider_key,
    accountKey: row.account_key,
    displayName: row.display_name,
    capabilityKey: row.capability_key,
    ownershipMode: row.ownership_mode,
    configuredStatus: row.status,
    currency: row.currency,
    balanceTrackingMode: row.balance_tracking_mode,
    reloadEnabled: row.reload_enabled,
    reloadTriggerBalanceCents,
    reloadAmountCents: nullableNumber(row.reload_amount_cents),
    monthlyReloadLimitCents: nullableNumber(row.monthly_reload_limit_cents),
    monthlyProviderSpendCapCents: nullableNumber(row.monthly_provider_spend_cap_cents),
    lowBalanceThresholdCents,
    criticalBalanceThresholdCents,
    paymentStatus: row.payment_status,
    syncStatus: row.sync_status,
    lastBalanceSyncAt: row.last_balance_sync_at,
    nextBalanceSyncAt: row.next_balance_sync_at,
    notes: row.notes,
    metadata: row.metadata_json ?? {},
    health: calculateProviderFundingHealth({
      currentBalanceCents,
      promotionalBalanceCents,
      promotionalExpiresAt: row.promotional_expires_at,
      monthlyProviderCostCents: numeric(row.monthly_provider_cost_cents),
      monthlyCustomerChargeCents: numeric(row.monthly_customer_charge_cents),
      reloadEnabled: row.reload_enabled,
      reloadTriggerBalanceCents,
      lowBalanceThresholdCents,
      criticalBalanceThresholdCents,
      paymentStatus: row.payment_status,
      syncStatus: row.sync_status,
      lastBalanceSyncAt: row.last_balance_sync_at
    }, now)
  };
}

export async function getProviderFundingDashboard(): Promise<ProviderFundingDashboard> {
  const [accountResult, alertResult, untrackedResult, managedAdResult] = await Promise.all([
    queryPostgres<ProviderFundingAccountRow>(
      `
      select
        a.*,
        t.name as tenant_name,
        greatest(coalesce(u.monthly_provider_cost_cents, 0), coalesce(ad.monthly_ad_spend_cents, 0)) as monthly_provider_cost_cents,
        coalesce(u.monthly_customer_charge_cents, 0) as monthly_customer_charge_cents,
        coalesce(u.monthly_quantity, 0) as monthly_quantity
      from public.provider_funding_accounts a
      left join public.tenants t on t.id = a.tenant_id
      left join lateral (
        select
          sum(e.provider_cost_cents) as monthly_provider_cost_cents,
          sum(e.customer_charge_cents) as monthly_customer_charge_cents,
          sum(e.quantity) as monthly_quantity
        from public.usage_meter_events e
        where e.provider_key = a.provider_key
          and e.billing_period_start = date_trunc('month', now())::date
          and e.status not in ('void', 'failed')
          and (a.tenant_id is null or e.tenant_id = a.tenant_id)
          and (
            a.ownership_mode = 'customer_owned'
            or e.customer_charge_cents > 0
            or e.metadata_json->>'ownershipMode' = 'ferocity_managed'
            or e.metadata_json->>'providerCostBilledBy' = 'ferocity'
            or e.metadata_json->>'managedVoice' = 'true'
          )
      ) u on true
      left join lateral (
        select sum(e.amount_cents) as monthly_ad_spend_cents
        from public.managed_ad_spend_events e
        join public.managed_ad_budget_controls c on c.id = e.budget_control_id
        where c.provider_funding_account_id = a.id
          and e.event_type = 'spend_recorded'
          and e.created_at >= date_trunc('month', now())
      ) ad on true
      where a.status <> 'closed'
      order by
        case a.status when 'payment_issue' then 0 when 'depleted' then 1 when 'critical' then 2 when 'low_balance' then 3 else 4 end,
        a.display_name
      `
    ),
    queryPostgres<{
      id: string;
      funding_account_id: string;
      severity: "low" | "medium" | "high";
      title: string;
      summary: string;
      last_seen_at: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
      select id, funding_account_id, severity, title, summary, last_seen_at, metadata_json
      from public.provider_funding_alerts
      where status = 'active'
      order by case severity when 'high' then 0 when 'medium' then 1 else 2 end, last_seen_at desc
      limit 100
      `
    ),
    queryPostgres<{
      provider_key: string;
      provider_cost_cents: string | number;
      customer_charge_cents: string | number;
      quantity: string | number;
    }>(
      `
      select
        u.provider_key,
        sum(u.provider_cost_cents) as provider_cost_cents,
        sum(u.customer_charge_cents) as customer_charge_cents,
        sum(u.quantity) as quantity
      from public.usage_meter_events u
      where u.billing_period_start = date_trunc('month', now())::date
        and u.status not in ('void', 'failed')
        and (
          u.customer_charge_cents > 0
          or u.metadata_json->>'ownershipMode' = 'ferocity_managed'
          or u.metadata_json->>'providerCostBilledBy' = 'ferocity'
          or u.metadata_json->>'managedVoice' = 'true'
        )
        and not exists (
          select 1
          from public.provider_funding_accounts a
          where a.provider_key = u.provider_key
            and a.ownership_mode = 'ferocity_managed'
            and a.status <> 'closed'
            and (a.tenant_id is null or a.tenant_id = u.tenant_id)
        )
      group by u.provider_key
      order by sum(u.provider_cost_cents) desc
      `
    ),
    queryPostgres<{
      provider_key: string;
      prepaid_balance_cents: string | number;
      reserved_cents: string | number;
      spent_cents: string | number;
      daily_cap_cents: string | number;
      monthly_cap_cents: string | number;
      tenant_count: string | number;
    }>(
      `
      select
        provider_key,
        sum(prepaid_balance_cents) as prepaid_balance_cents,
        sum(reserved_cents) as reserved_cents,
        sum(spent_cents) as spent_cents,
        sum(daily_cap_cents) as daily_cap_cents,
        sum(monthly_cap_cents) as monthly_cap_cents,
        count(distinct tenant_id) as tenant_count
      from public.managed_ad_budget_controls
      where lane_key = 'ferocity_managed' and status <> 'archived'
      group by provider_key
      order by provider_key
      `
    )
  ]);

  const accounts = (accountResult?.rows ?? []).map((row) => toAccount(row));
  const managedAds = (managedAdResult?.rows ?? []).map((row) => {
    const prepaidBalanceCents = numeric(row.prepaid_balance_cents);
    const reservedCents = numeric(row.reserved_cents);
    const spentCents = numeric(row.spent_cents);
    return {
      providerKey: row.provider_key,
      prepaidBalanceCents,
      reservedCents,
      spentCents,
      availableCents: Math.max(0, prepaidBalanceCents - reservedCents - spentCents),
      dailyCapCents: numeric(row.daily_cap_cents),
      monthlyCapCents: numeric(row.monthly_cap_cents),
      tenantCount: numeric(row.tenant_count)
    };
  });
  const monthlyProviderCostCents = accounts.reduce((sum, account) => sum + account.health.monthlyProviderCostCents, 0);
  const monthlyCustomerChargeCents = accounts.reduce((sum, account) => sum + account.health.monthlyCustomerChargeCents, 0);

  return {
    accounts,
    activeAlerts: (alertResult?.rows ?? []).map((row) => ({
      id: row.id,
      accountId: row.funding_account_id,
      severity: row.severity,
      title: row.title,
      summary: row.summary,
      lastSeenAt: row.last_seen_at,
      metadata: row.metadata_json ?? {}
    })),
    untrackedProviders: (untrackedResult?.rows ?? []).map((row) => ({
      providerKey: row.provider_key,
      providerCostCents: numeric(row.provider_cost_cents),
      customerChargeCents: numeric(row.customer_charge_cents),
      quantity: numeric(row.quantity)
    })),
    managedAds,
    totals: {
      availableProviderBalanceCents: accounts.reduce((sum, account) => sum + (account.health.totalAvailableCents ?? 0), 0),
      monthlyProviderCostCents,
      monthlyCustomerChargeCents,
      grossMarginCents: monthlyCustomerChargeCents - monthlyProviderCostCents,
      activeAlertCount: alertResult?.rows.length ?? 0
    }
  };
}

export async function evaluateProviderFundingAlerts() {
  const dashboard = await getProviderFundingDashboard();
  let active = 0;
  let resolved = 0;

  for (const account of dashboard.accounts) {
    const alertKey = `funding:${account.health.status}`;
    const shouldAlert = !["healthy", "watch"].includes(account.health.status);
    if (shouldAlert) {
      const severity = ["depleted", "critical", "payment_issue"].includes(account.health.status) ? "high" : "medium";
      await queryPostgres(
        `
        insert into public.provider_funding_alerts (
          funding_account_id, tenant_id, alert_key, severity, status, title, summary, metadata_json, last_seen_at, updated_at
        )
        values ($1, $2, $3, $4, 'active', $5, $6, $7::jsonb, now(), now())
        on conflict (funding_account_id, alert_key) do update
        set severity = excluded.severity,
            status = 'active',
            title = excluded.title,
            summary = excluded.summary,
            metadata_json = excluded.metadata_json,
            last_seen_at = now(),
            resolved_at = null,
            updated_at = now()
        `,
        [
          account.id,
          account.tenantId,
          alertKey,
          severity,
          `${account.displayName} funding needs attention`,
          account.health.reason,
          JSON.stringify({
            providerKey: account.providerKey,
            balanceCents: account.health.totalAvailableCents,
            daysRemaining: account.health.estimatedDaysRemaining,
            needsReload: account.health.needsReload,
            paymentStatus: account.paymentStatus,
            syncStatus: account.syncStatus
          })
        ]
      );
      await queryPostgres(
        `
        update public.provider_funding_alerts
        set status = 'resolved', resolved_at = now(), updated_at = now()
        where funding_account_id = $1 and status = 'active' and alert_key like 'funding:%' and alert_key <> $2
        `,
        [account.id, alertKey]
      );
      active += 1;
    } else {
      const result = await queryPostgres(
        `
        update public.provider_funding_alerts
        set status = 'resolved', resolved_at = now(), updated_at = now()
        where funding_account_id = $1 and status = 'active' and alert_key like 'funding:%'
        `,
        [account.id]
      );
      resolved += result?.rowCount ?? 0;
    }

    const cap = account.monthlyProviderSpendCapCents;
    const spent = account.health.monthlyProviderCostCents;
    const utilization = cap && cap > 0 ? spent / cap : 0;
    const capacityAlertKey = "capacity:monthly";
    if (cap && utilization >= 0.7) {
      const recommendedCapCents = Math.min(
        5_000_000,
        Math.ceil(Math.max(cap * 2, account.health.projectedMonthlyProviderCostCents * 1.25, cap + 10_000) / 1000) * 1000
      );
      const severity = utilization >= 0.85 ? "high" : "medium";
      await queryPostgres(
        `
        insert into public.provider_funding_alerts (
          funding_account_id, tenant_id, alert_key, severity, status, title, summary, action_href, metadata_json, last_seen_at, updated_at
        ) values ($1,$2,$3,$4,'active',$5,$6,'/app/provider-costs',$7::jsonb,now(),now())
        on conflict (funding_account_id, alert_key) do update
        set severity=excluded.severity, status='active', title=excluded.title, summary=excluded.summary,
            action_href=excluded.action_href, metadata_json=excluded.metadata_json,
            last_seen_at=now(), resolved_at=null, updated_at=now()
        `,
        [
          account.id,
          account.tenantId,
          capacityAlertKey,
          severity,
          `${account.displayName} is approaching its monthly safety ceiling`,
          `${Math.round(utilization * 100)}% of the ${Math.round(cap / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} ceiling is used. Review the recommended increase before more customer volume arrives.`,
          JSON.stringify({
            providerKey: account.providerKey,
            currentCapCents: cap,
            monthlyProviderCostCents: spent,
            utilizationPercent: Math.round(utilization * 100),
            recommendedCapCents
          })
        ]
      );
      active += 1;
    } else {
      const result = await queryPostgres(
        `update public.provider_funding_alerts set status='resolved', resolved_at=now(), updated_at=now() where funding_account_id=$1 and alert_key=$2 and status='active'`,
        [account.id, capacityAlertKey]
      );
      resolved += result?.rowCount ?? 0;
    }
  }

  const closed = await queryPostgres(
    `
    update public.provider_funding_alerts alert
    set status = 'resolved', resolved_at = now(), updated_at = now()
    from public.provider_funding_accounts account
    where alert.funding_account_id = account.id
      and account.status = 'closed'
      and alert.status = 'active'
    `
  );
  resolved += closed?.rowCount ?? 0;

  return { checked: dashboard.accounts.length, active, resolved };
}
