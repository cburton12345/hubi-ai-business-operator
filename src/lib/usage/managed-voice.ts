import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

type VoiceAccessRow = {
  account_status: string;
  credentials_status: string;
  live_actions_enabled: boolean;
  ownership_mode: string;
  tenant_status: string;
  account_type: string;
  plan_key: string | null;
  subscription_status: string | null;
  included_quantity: string | number | null;
  hard_limit_quantity: string | number | null;
  overage_unit_price_cents: string | number | null;
  policy_metadata: Record<string, unknown> | null;
  monthly_minutes: string | number;
  monthly_provider_cost_cents: string | number;
  monthly_customer_charge_cents: string | number;
  active_calls: string | number;
  monthly_provider_cost_cap_cents: string | number | null;
  monthly_customer_charge_cap_cents: string | number | null;
  concurrent_call_limit: number | null;
  max_call_duration_seconds: number | null;
  emergency_paused: boolean;
  global_emergency_paused: boolean;
  global_active_calls: string | number;
  global_monthly_provider_cost_cents: string | number;
  global_provider_cost_cap_cents: string | number | null;
  global_concurrent_call_limit: number | null;
};

export type VoiceAccessDecision = {
  allowed: boolean;
  reason: string;
  errorCategory: string;
  maxDurationSeconds: number;
  ownershipMode: "ferocity_managed" | "workspace" | "unknown";
};

export type VoiceUsageCharge = {
  billableMinutes: number;
  customerChargeCents: number;
};

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function managedOwnership(value: string | null | undefined) {
  return value === "ferocity_managed";
}

export function calculateManagedVoiceCharge(input: {
  priorMinutes: number;
  callMinutes: number;
  includedMinutes: number;
  unitPriceCents: number;
}): VoiceUsageCharge {
  const before = Math.max(0, input.priorMinutes - input.includedMinutes);
  const after = Math.max(0, input.priorMinutes + input.callMinutes - input.includedMinutes);
  const billableMinutes = Math.max(0, after - before);
  return {
    billableMinutes,
    customerChargeCents: Math.ceil(billableMinutes * input.unitPriceCents)
  };
}

async function loadVoiceAccessRow(tenantId: string, providerKey: string) {
  const result = await queryPostgres<VoiceAccessRow>(
    `
    with account as (
      select status, credentials_status, live_actions_enabled, ownership_mode
      from public.provider_accounts
      where tenant_id = $1 and provider_key = $2
      limit 1
    ),
    tenant_plan as (
      select
        t.status as tenant_status,
        t.account_type,
        coalesce(s.plan_key, t.plan_key, 'free') as plan_key,
        s.status as subscription_status
      from public.tenants t
      left join public.billing_subscriptions s on s.tenant_id = t.id
      where t.id = $1
    ),
    policy as (
      select p.*
      from public.usage_allowance_policies p, tenant_plan tp
      where p.feature_key = 'ai_receptionist'
        and p.unit_type = 'minute'
        and p.status = 'active'
        and (p.tenant_id = $1 or (p.tenant_id is null and p.plan_key = tp.plan_key))
      order by (p.tenant_id is not null) desc
      limit 1
    ),
    usage as (
      select
        coalesce(sum(quantity), 0) as monthly_minutes,
        coalesce(sum(provider_cost_cents), 0) as monthly_provider_cost_cents,
        coalesce(sum(customer_charge_cents), 0) as monthly_customer_charge_cents
      from public.usage_meter_events
      where tenant_id = $1
        and feature_key = 'ai_receptionist'
        and billing_period_start = date_trunc('month', now())::date
        and status not in ('void', 'failed')
    ),
    active as (
      select count(*) as active_calls
      from public.receptionist_calls
      where tenant_id = $1
        and provider_key = $2
        and status in ('received', 'ringing', 'in_progress')
        and started_at >= now() - interval '4 hours'
    ),
    tenant_limit as (
      select *
      from public.spend_limits
      where tenant_id = $1
        and status = 'active'
        and (
          scope_type = 'tenant'
          or (scope_type = 'provider' and scope_key = $2)
          or (scope_type = 'feature' and scope_key = 'ai_receptionist')
        )
      order by
        case scope_type when 'provider' then 0 when 'feature' then 1 else 2 end
      limit 1
    ),
    global_limit as (
      select *
      from public.spend_limits
      where tenant_id is null
        and scope_type = 'global'
        and scope_key in ('managed_voice', 'all')
        and status = 'active'
      order by case scope_key when 'managed_voice' then 0 else 1 end
      limit 1
    ),
    global_usage as (
      select
        coalesce((
          select sum(u.provider_cost_cents)
          from public.usage_meter_events u
          join public.provider_accounts pa
            on pa.tenant_id = u.tenant_id
           and pa.provider_key = u.provider_key
           and pa.ownership_mode = 'ferocity_managed'
          where u.feature_key = 'ai_receptionist'
            and u.billing_period_start = date_trunc('month', now())::date
            and u.status not in ('void', 'failed')
        ), 0) as global_monthly_provider_cost_cents,
        (
          select count(*)
          from public.receptionist_calls c
          join public.provider_accounts pa
            on pa.tenant_id = c.tenant_id
           and pa.provider_key = c.provider_key
           and pa.ownership_mode = 'ferocity_managed'
          where c.status in ('received', 'ringing', 'in_progress')
            and c.started_at >= now() - interval '4 hours'
        ) as global_active_calls
    )
    select
      a.status as account_status,
      a.credentials_status,
      a.live_actions_enabled,
      a.ownership_mode,
      tp.tenant_status,
      tp.account_type,
      tp.plan_key,
      tp.subscription_status,
      p.included_quantity,
      p.hard_limit_quantity,
      p.overage_unit_price_cents,
      p.metadata_json as policy_metadata,
      u.monthly_minutes,
      u.monthly_provider_cost_cents,
      u.monthly_customer_charge_cents,
      ac.active_calls,
      l.monthly_provider_cost_cap_cents,
      l.monthly_customer_charge_cap_cents,
      l.concurrent_call_limit,
      l.max_call_duration_seconds,
      coalesce(l.emergency_paused, false) as emergency_paused,
      coalesce(g.emergency_paused, false) as global_emergency_paused,
      gu.global_active_calls,
      gu.global_monthly_provider_cost_cents,
      g.monthly_provider_cost_cap_cents as global_provider_cost_cap_cents,
      g.concurrent_call_limit as global_concurrent_call_limit
    from account a
    cross join tenant_plan tp
    left join policy p on true
    cross join usage u
    cross join active ac
    left join tenant_limit l on true
    left join global_limit g on true
    cross join global_usage gu
    limit 1
    `,
    [tenantId, providerKey]
  );
  return result?.rows[0] ?? null;
}

export async function evaluateVoiceAccess(input: {
  tenantId: string;
  providerKey: string;
  purpose?: "production" | "authorized_test";
}): Promise<VoiceAccessDecision> {
  const row = await loadVoiceAccessRow(input.tenantId, input.providerKey);
  const testCall = input.purpose === "authorized_test";
  if (!row) {
    return {
      allowed: false,
      reason: "Voice service could not be safely verified.",
      errorCategory: "voice_safety_check_unavailable",
      maxDurationSeconds: testCall ? 600 : 0,
      ownershipMode: "unknown"
    };
  }

  const ownershipMode = managedOwnership(row.ownership_mode) ? "ferocity_managed" : "workspace";
  const configured = row.credentials_status === "configured";
  const connected = row.account_status === "connected";
  if (!configured || (!connected && !testCall) || (!row.live_actions_enabled && !testCall)) {
    return {
      allowed: false,
      reason: "Voice service is not active for this workspace.",
      errorCategory: "voice_not_active",
      maxDurationSeconds: 0,
      ownershipMode
    };
  }

  if (testCall) {
    return {
      allowed: true,
      reason: "Authorized test call.",
      errorCategory: "",
      maxDurationSeconds: Math.min(600, row.max_call_duration_seconds ?? 600),
      ownershipMode
    };
  }

  if (row.tenant_status !== "active" && row.tenant_status !== "trial") {
    return { allowed: false, reason: "Workspace is not active.", errorCategory: "tenant_inactive", maxDurationSeconds: 0, ownershipMode };
  }
  if (row.emergency_paused || (ownershipMode === "ferocity_managed" && row.global_emergency_paused)) {
    return { allowed: false, reason: "Voice service is temporarily paused.", errorCategory: "emergency_pause", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.account_type !== "internal"
    && row.subscription_status !== "active"
    && row.subscription_status !== "trialing"
    && row.subscription_status !== "manual"
  ) {
    return { allowed: false, reason: "Managed voice is paused until billing is current.", errorCategory: "billing_not_current", maxDurationSeconds: 0, ownershipMode };
  }

  const usedMinutes = numeric(row.monthly_minutes);
  const hardLimit = row.hard_limit_quantity === null ? null : numeric(row.hard_limit_quantity);
  if (hardLimit !== null && usedMinutes >= hardLimit) {
    return { allowed: false, reason: "Monthly AI receptionist limit reached.", errorCategory: "hard_usage_limit", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.monthly_provider_cost_cap_cents !== null
    && numeric(row.monthly_provider_cost_cents) >= numeric(row.monthly_provider_cost_cap_cents)
  ) {
    return { allowed: false, reason: "Monthly managed-voice safety limit reached.", errorCategory: "provider_cost_cap", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.global_provider_cost_cap_cents !== null
    && numeric(row.global_monthly_provider_cost_cents) >= numeric(row.global_provider_cost_cap_cents)
  ) {
    return { allowed: false, reason: "Managed voice is temporarily at its platform safety limit.", errorCategory: "global_provider_cost_cap", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.monthly_customer_charge_cap_cents !== null
    && numeric(row.monthly_customer_charge_cents) >= numeric(row.monthly_customer_charge_cap_cents)
  ) {
    return { allowed: false, reason: "Monthly managed-voice billing limit reached.", errorCategory: "customer_charge_cap", maxDurationSeconds: 0, ownershipMode };
  }
  if (row.concurrent_call_limit !== null && numeric(row.active_calls) >= row.concurrent_call_limit) {
    return { allowed: false, reason: "All available phone lines are currently busy.", errorCategory: "concurrent_call_limit", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.global_concurrent_call_limit !== null
    && numeric(row.global_active_calls) >= row.global_concurrent_call_limit
  ) {
    return { allowed: false, reason: "Managed phone capacity is temporarily busy.", errorCategory: "global_concurrent_call_limit", maxDurationSeconds: 0, ownershipMode };
  }

  const configuredDuration = Math.max(60, row.max_call_duration_seconds ?? 1800);
  const remainingSeconds = hardLimit === null ? configuredDuration : Math.floor(Math.max(0, hardLimit - usedMinutes) * 60);
  return {
    allowed: true,
    reason: "Voice service is available.",
    errorCategory: "",
    maxDurationSeconds: Math.max(60, Math.min(configuredDuration, remainingSeconds || configuredDuration)),
    ownershipMode
  };
}

export async function getVoiceMaxDurationSeconds(tenantId: string, providerKey: string) {
  const decision = await evaluateVoiceAccess({ tenantId, providerKey, purpose: "authorized_test" });
  return decision.allowed ? decision.maxDurationSeconds : 600;
}

export async function recordVoiceUsage(input: {
  tenantId: string;
  providerKey: string;
  providerCallId: string;
  callId: string;
  durationSeconds: number;
  providerCostCents: number;
}) {
  const minutes = Math.ceil(Math.max(0, input.durationSeconds) / 60);
  if (minutes <= 0) return { recorded: false, customerChargeCents: 0 };

  const existing = await queryPostgres<{ id: string; customer_charge_cents: string | number }>(
    `
    select id, customer_charge_cents
    from public.usage_meter_events
    where tenant_id = $1 and idempotency_key = $2
    limit 1
    `,
    [input.tenantId, `${input.tenantId}:${input.providerKey}:call:${input.providerCallId}:minute`]
  );
  if (existing?.rows[0]) {
    await queryPostgres(
      `
      update public.usage_meter_events
      set provider_cost_cents = greatest(provider_cost_cents, $3),
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and id = $2
      `,
      [
        input.tenantId,
        existing.rows[0].id,
        input.providerCostCents,
        JSON.stringify({ providerCostFinalized: input.providerCostCents > 0 })
      ]
    );
    await queryPostgres(
      `
      update public.receptionist_calls
      set estimated_provider_cost_cents = greatest(estimated_provider_cost_cents, $3),
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [input.tenantId, input.callId, input.providerCostCents]
    );
    return { recorded: false, customerChargeCents: numeric(existing.rows[0].customer_charge_cents) };
  }

  const contextResult = await queryPostgres<{
    ownership_mode: string;
    plan_key: string | null;
    included_quantity: string | number | null;
    hard_limit_quantity: string | number | null;
    overage_unit_price_cents: string | number | null;
    metadata_json: Record<string, unknown> | null;
    prior_minutes: string | number;
  }>(
    `
    with tenant_plan as (
      select coalesce(s.plan_key, t.plan_key, 'free') as plan_key
      from public.tenants t
      left join public.billing_subscriptions s on s.tenant_id = t.id
      where t.id = $1
    ),
    policy as (
      select p.*
      from public.usage_allowance_policies p, tenant_plan tp
      where p.feature_key = 'ai_receptionist'
        and p.unit_type = 'minute'
        and p.status = 'active'
        and (p.tenant_id = $1 or (p.tenant_id is null and p.plan_key = tp.plan_key))
      order by (p.tenant_id is not null) desc
      limit 1
    )
    select
      a.ownership_mode,
      tp.plan_key,
      p.included_quantity,
      p.hard_limit_quantity,
      p.overage_unit_price_cents,
      p.metadata_json,
      (
        select coalesce(sum(u.quantity), 0)
        from public.usage_meter_events u
        where u.tenant_id = $1
          and u.feature_key = 'ai_receptionist'
          and u.billing_period_start = date_trunc('month', now())::date
          and u.status not in ('void', 'failed')
      ) as prior_minutes
    from public.provider_accounts a
    cross join tenant_plan tp
    left join policy p on true
    where a.tenant_id = $1 and a.provider_key = $2
    limit 1
    `,
    [input.tenantId, input.providerKey]
  );
  const context = contextResult?.rows[0];
  if (!context) return { recorded: false, customerChargeCents: 0 };

  const managed = managedOwnership(context.ownership_mode);
  const charge = managed
    ? calculateManagedVoiceCharge({
        priorMinutes: numeric(context.prior_minutes),
        callMinutes: minutes,
        includedMinutes: numeric(context.included_quantity),
        unitPriceCents: numeric(context.overage_unit_price_cents)
      })
    : { billableMinutes: 0, customerChargeCents: 0 };
  const autoApproved =
    managed
    && charge.customerChargeCents > 0
    && context.metadata_json?.disclosedOverage === true
    && context.metadata_json?.autoBillDisclosedOverage === true;
  const meterStatus = charge.customerChargeCents <= 0 ? "included" : autoApproved ? "approved" : "pending_review";
  const idempotencyKey = `${input.tenantId}:${input.providerKey}:call:${input.providerCallId}:minute`;

  const meter = await queryPostgres<{ id: string }>(
    `
    insert into public.usage_meter_events (
      tenant_id, plan_key, subscription_tenant_id, feature_key, provider_key,
      provider_resource_id, provider_event_id, source_table, source_id, unit_type,
      quantity, provider_cost_cents, customer_charge_cents, status, source,
      idempotency_key, metadata_json
    )
    values (
      $1, $2, $1, 'ai_receptionist', $3, $4, $4, 'receptionist_calls', $5,
      'minute', $6, $7, $8, $9, 'provider_webhook', $10, $11::jsonb
    )
    on conflict (tenant_id, idempotency_key) do nothing
    returning id
    `,
    [
      input.tenantId,
      context.plan_key,
      input.providerKey,
      input.providerCallId,
      input.callId,
      minutes,
      input.providerCostCents,
      charge.customerChargeCents,
      meterStatus,
      idempotencyKey,
      JSON.stringify({
        ownershipMode: context.ownership_mode,
        managedVoice: managed,
        billableMinutes: charge.billableMinutes,
        overageUnitPriceCents: numeric(context.overage_unit_price_cents),
        autoApproved
      })
    ]
  );
  const meterId = meter?.rows[0]?.id;
  if (!meterId) return { recorded: false, customerChargeCents: 0 };

  await queryPostgres(
    `
    update public.receptionist_calls
    set estimated_provider_cost_cents = $3,
        billable_customer_amount_cents = $4,
        usage_units = $5,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [input.tenantId, input.callId, input.providerCostCents, charge.customerChargeCents, minutes]
  );

  if (managed && charge.customerChargeCents > 0) {
    const monthKey = new Date().toISOString().slice(0, 7);
    await queryPostgres(
      `
      insert into public.billing_usage_charges (
        tenant_id, plan_key, charge_key, fee_family, description, source_table,
        source_id, amount_cents, status, period_start, period_end, metadata_json
      )
      values (
        $1, $2, $3, 'usage_rebilling', $4, 'usage_meter_events', $3, $5, $6,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        $7::jsonb
      )
      on conflict (tenant_id, charge_key, source_table, source_id)
        where source_table is not null and source_id is not null
      do update set
        amount_cents = public.billing_usage_charges.amount_cents + excluded.amount_cents,
        status = case
          when public.billing_usage_charges.status in ('pending_review', 'approved', 'failed')
            then excluded.status
          else public.billing_usage_charges.status
        end,
        metadata_json = public.billing_usage_charges.metadata_json || excluded.metadata_json,
        updated_at = now()
      `,
      [
        input.tenantId,
        context.plan_key,
        `managed_voice:${monthKey}`,
        `Managed AI receptionist overage — ${monthKey}`,
        charge.customerChargeCents,
        autoApproved ? "approved" : "pending_review",
        JSON.stringify({
          pricingDisclosed: context.metadata_json?.disclosedOverage === true,
          unitPriceCents: numeric(context.overage_unit_price_cents),
          aggregatedMonthly: true
        })
      ]
    );
  }

  const actualCostPerMinute = input.providerCostCents / minutes;
  const costCeiling = numeric(context.metadata_json?.providerCostCeilingCentsPerMinute) || 35;
  if (managed && actualCostPerMinute > costCeiling) {
    await queryPostgres(
      `
      update public.provider_accounts
      set status = 'paused',
          live_actions_enabled = false,
          metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where tenant_id = $1 and provider_key = $2
      `,
      [
        input.tenantId,
        input.providerKey,
        JSON.stringify({
          pausedBy: "managed_voice_cost_ceiling",
          actualCostPerMinuteCents: actualCostPerMinute,
          costCeilingCentsPerMinute: costCeiling,
          pausedAt: new Date().toISOString()
        })
      ]
    );
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, event_family, event_type, title, body, metadata_json
      )
      values ($1, 'system', 'managed_voice_cost_pause', 'Managed voice paused for cost review',
        'A provider call exceeded the managed-voice cost ceiling. Other workspaces and bring-your-own connections remain unaffected.',
        $2::jsonb)
      `,
      [input.tenantId, JSON.stringify({ providerKey: input.providerKey, actualCostPerMinute, costCeiling })]
    );
  }

  return { recorded: true, customerChargeCents: charge.customerChargeCents };
}

export function automaticUsageBillingEnabled() {
  return env.FEROCITY_USAGE_BILLING_ENABLED === "true";
}
