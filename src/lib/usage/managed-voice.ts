import type { QueryResultRow } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { evaluateBillingAccess } from "@/lib/billing/billing-access-policy";
import { isProviderUsageSponsored } from "@/lib/billing/earn-provider-sponsorship";

type VoiceAccessRow = {
  account_status: string;
  credentials_status: string;
  live_actions_enabled: boolean;
  ownership_mode: string;
  tenant_status: string;
  account_type: string;
  plan_key: string | null;
  subscription_status: string | null;
  subscription_metadata: Record<string, unknown> | null;
  allowance_policy_id: string | null;
  included_quantity: string | number | null;
  hard_limit_quantity: string | number | null;
  overage_unit_price_cents: string | number | null;
  policy_metadata: Record<string, unknown> | null;
  monthly_minutes: string | number;
  monthly_provider_cost_cents: string | number;
  monthly_all_provider_cost_cents: string | number;
  sponsorship_status: string | null;
  sponsored_provider_cost_cap_cents: string | number | null;
  monthly_customer_charge_cents: string | number;
  active_calls: string | number;
  monthly_provider_cost_cap_cents: string | number | null;
  monthly_customer_charge_cap_cents: string | number | null;
  concurrent_call_limit: number | null;
  max_call_duration_seconds: number | null;
  emergency_paused: boolean;
  failed_payment_behavior: string | null;
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
  restrictedMode?: "take_message_only";
  pricingSnapshot?: VoicePricingSnapshot;
};

export type VoicePricingSnapshot = {
  policyId: string;
  planKey: string | null;
  includedMinutes: number;
  unitPriceCents: number;
  pricingDisclosed: boolean;
  autoBillDisclosedOverage: boolean;
  sponsoredByFerocity: boolean;
  capturedAt: string;
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

export function requiresManagedVoiceAllowancePolicy(input: {
  ownershipMode: string | null | undefined;
  accountType: string | null | undefined;
  sponsored: boolean;
}) {
  return managedOwnership(input.ownershipMode)
    && input.accountType !== "internal"
    && !input.sponsored;
}

function pricingSnapshotFromRow(row: Pick<VoiceAccessRow,
  "allowance_policy_id" | "plan_key" | "included_quantity" | "overage_unit_price_cents" | "policy_metadata"
>, sponsored: boolean): VoicePricingSnapshot | undefined {
  if (!row.allowance_policy_id) return undefined;
  return {
    policyId: row.allowance_policy_id,
    planKey: row.plan_key,
    includedMinutes: numeric(row.included_quantity),
    unitPriceCents: numeric(row.overage_unit_price_cents),
    pricingDisclosed: row.policy_metadata?.disclosedOverage === true,
    autoBillDisclosedOverage: row.policy_metadata?.autoBillDisclosedOverage === true,
    sponsoredByFerocity: sponsored,
    capturedAt: new Date().toISOString()
  };
}

export function validVoicePricingSnapshot(value: unknown): VoicePricingSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.policyId !== "string"
    || snapshot.policyId.length === 0
    || !(typeof snapshot.planKey === "string" || snapshot.planKey === null)
    || typeof snapshot.includedMinutes !== "number"
    || !Number.isFinite(snapshot.includedMinutes)
    || snapshot.includedMinutes < 0
    || typeof snapshot.unitPriceCents !== "number"
    || !Number.isFinite(snapshot.unitPriceCents)
    || snapshot.unitPriceCents < 0
    || typeof snapshot.pricingDisclosed !== "boolean"
    || typeof snapshot.autoBillDisclosedOverage !== "boolean"
    || typeof snapshot.sponsoredByFerocity !== "boolean"
    || typeof snapshot.capturedAt !== "string"
    || !Number.isFinite(Date.parse(snapshot.capturedAt))
  ) return null;
  return snapshot as VoicePricingSnapshot;
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
        s.status as subscription_status,
        s.metadata_json as subscription_metadata
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
    sponsorship as (
      select status,monthly_provider_cost_cap_cents
      from public.earn_provider_sponsorships
      where tenant_id=$1 and status='active'
        and starts_at<=now() and (ends_at is null or ends_at>now())
      limit 1
    ),
    usage as (
      select
        coalesce(sum(quantity) filter (where feature_key = 'ai_receptionist'), 0) as monthly_minutes,
        coalesce(sum(provider_cost_cents) filter (where feature_key = 'ai_receptionist'), 0) as monthly_provider_cost_cents,
        coalesce(sum(customer_charge_cents) filter (where feature_key = 'ai_receptionist'), 0) as monthly_customer_charge_cents,
        coalesce(sum(provider_cost_cents), 0) as monthly_all_provider_cost_cents
      from public.usage_meter_events
      where tenant_id = $1
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
      p.id as allowance_policy_id,
      p.included_quantity,
      p.hard_limit_quantity,
      p.overage_unit_price_cents,
      p.metadata_json as policy_metadata,
      u.monthly_minutes,
      u.monthly_provider_cost_cents,
      u.monthly_all_provider_cost_cents,
      s.status as sponsorship_status,
      s.monthly_provider_cost_cap_cents as sponsored_provider_cost_cap_cents,
      u.monthly_customer_charge_cents,
      ac.active_calls,
      l.monthly_provider_cost_cap_cents,
      l.monthly_customer_charge_cap_cents,
      l.concurrent_call_limit,
      l.max_call_duration_seconds,
      coalesce(l.emergency_paused, false) as emergency_paused,
      l.failed_payment_behavior,
      coalesce(g.emergency_paused, false) as global_emergency_paused,
      gu.global_active_calls,
      gu.global_monthly_provider_cost_cents,
      g.monthly_provider_cost_cap_cents as global_provider_cost_cap_cents,
      g.concurrent_call_limit as global_concurrent_call_limit
    from account a
    cross join tenant_plan tp
    left join policy p on true
    left join sponsorship s on true
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
  callDirection?: "inbound" | "outbound";
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

  if (row.tenant_status !== "active" && row.tenant_status !== "trial") {
    return { allowed: false, reason: "Workspace is not active.", errorCategory: "tenant_inactive", maxDurationSeconds: 0, ownershipMode };
  }
  if (row.emergency_paused || (ownershipMode === "ferocity_managed" && row.global_emergency_paused)) {
    return { allowed: false, reason: "Voice service is temporarily paused.", errorCategory: "emergency_pause", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && row.account_type !== "internal"
    && !evaluateBillingAccess({ status: row.subscription_status, metadata: row.subscription_metadata }).allowManagedSpend
  ) {
    if (input.callDirection === "inbound" && row.failed_payment_behavior === "take_message_only") {
      return {
        allowed: true,
        reason: "Billing needs attention; inbound calls are limited to taking a message.",
        errorCategory: "billing_restricted",
        maxDurationSeconds: Math.min(180, row.max_call_duration_seconds ?? 180),
        ownershipMode,
        restrictedMode: "take_message_only"
      };
    }
    return { allowed: false, reason: "Managed voice is paused until billing is current.", errorCategory: "billing_not_current", maxDurationSeconds: 0, ownershipMode };
  }

  const sponsored = isProviderUsageSponsored(row.sponsorship_status);
  if (
    requiresManagedVoiceAllowancePolicy({
      ownershipMode: row.ownership_mode,
      accountType: row.account_type,
      sponsored
    })
    && !row.allowance_policy_id
  ) {
    return {
      allowed: false,
      reason: "Managed voice pricing is not configured for this workspace.",
      errorCategory: "managed_voice_allowance_missing",
      maxDurationSeconds: 0,
      ownershipMode
    };
  }

  const usedMinutes = numeric(row.monthly_minutes);
  const hardLimit = row.hard_limit_quantity === null ? null : numeric(row.hard_limit_quantity);
  if (hardLimit !== null && usedMinutes >= hardLimit) {
    return { allowed: false, reason: "Monthly AI receptionist limit reached.", errorCategory: "hard_usage_limit", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && sponsored
    && row.sponsored_provider_cost_cap_cents !== null
    && numeric(row.monthly_all_provider_cost_cents) >= numeric(row.sponsored_provider_cost_cap_cents)
  ) {
    return { allowed: false, reason: "This pilot reached its Ferocity-sponsored provider-cost budget and needs review.", errorCategory: "sponsored_provider_cost_cap", maxDurationSeconds: 0, ownershipMode };
  }
  if (
    ownershipMode === "ferocity_managed"
    && !sponsored
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
  const admittedDuration = Math.max(60, Math.min(configuredDuration, remainingSeconds || configuredDuration));
  return {
    allowed: true,
    reason: testCall ? "Authorized test call passed managed-voice admission checks." : "Voice service is available.",
    errorCategory: "",
    maxDurationSeconds: testCall ? Math.min(600, admittedDuration) : admittedDuration,
    ownershipMode,
    pricingSnapshot: pricingSnapshotFromRow(row, sponsored)
  };
}

export async function getVoiceMaxDurationSeconds(tenantId: string, providerKey: string) {
  const decision = await evaluateVoiceAccess({ tenantId, providerKey, purpose: "authorized_test" });
  return decision.allowed ? decision.maxDurationSeconds : 600;
}

type VoiceUsageInput = {
  tenantId: string;
  providerKey: string;
  providerCallId: string;
  callId: string;
  durationSeconds: number;
  providerCostCents: number;
};

type VoiceUsageQuery = <T extends QueryResultRow>(
  text: string,
  values?: unknown[]
) => Promise<{ rows: T[] } | null>;

async function recordVoiceUsageInTransaction(input: VoiceUsageInput, query: VoiceUsageQuery) {
  const minutes = Math.ceil(Math.max(0, input.durationSeconds) / 60);
  if (minutes <= 0) return { recorded: false, customerChargeCents: 0, retryable: false };

  const existing = await query<{
    id: string;
    quantity: string | number;
    customer_charge_cents: string | number;
    status: string;
    metadata_json: Record<string, unknown> | null;
  }>(
    `
    select id, quantity, customer_charge_cents, status, metadata_json
    from public.usage_meter_events
    where tenant_id = $1 and idempotency_key = $2
    limit 1
    `,
    [input.tenantId, `${input.tenantId}:${input.providerKey}:call:${input.providerCallId}:minute`]
  );
  if (existing?.rows[0]) {
    const pricing = await query<{
      ownership_mode: string; plan_key: string | null; sponsorship_status: string | null; allowance_policy_id: string | null;
      included_quantity: string | number | null;
      overage_unit_price_cents: string | number | null; metadata_json: Record<string, unknown> | null;
      other_minutes: string | number; admission_pricing_snapshot: unknown;
    }>(
      `with tenant_plan as (
         select coalesce(s.plan_key,t.plan_key,'free') as plan_key from public.tenants t
         left join public.billing_subscriptions s on s.tenant_id=t.id where t.id=$1
       ), policy as (
         select p.* from public.usage_allowance_policies p,tenant_plan tp
         where p.feature_key='ai_receptionist' and p.unit_type='minute' and p.status='active'
           and (p.tenant_id=$1 or (p.tenant_id is null and p.plan_key=tp.plan_key))
         order by (p.tenant_id is not null) desc limit 1
       )
       select a.ownership_mode,tp.plan_key,p.id as allowance_policy_id,
         (select status from public.earn_provider_sponsorships es where es.tenant_id=$1 and es.status='active'
           and es.starts_at<=now() and (es.ends_at is null or es.ends_at>now()) limit 1) sponsorship_status,
         p.included_quantity,p.overage_unit_price_cents,p.metadata_json,
         (select c.admission_pricing_snapshot_json from public.receptionist_calls c
          where c.tenant_id=$1 and c.id=$4 limit 1) admission_pricing_snapshot,
         (select coalesce(sum(u.quantity),0) from public.usage_meter_events u
          where u.tenant_id=$1 and u.feature_key='ai_receptionist'
            and u.billing_period_start=date_trunc('month',now())::date
            and u.status not in ('void','failed') and u.id<>$3) as other_minutes
       from public.provider_accounts a cross join tenant_plan tp left join policy p on true
       where a.tenant_id=$1 and a.provider_key=$2 limit 1`,
      [input.tenantId, input.providerKey, existing.rows[0].id, input.callId]
    );
    const price = pricing?.rows[0];
    const managed = managedOwnership(price?.ownership_mode) || existing.rows[0].metadata_json?.managedVoice === true;
    const sponsored = isProviderUsageSponsored(price?.sponsorship_status);
    const currentSnapshot = price?.allowance_policy_id ? {
      policyId: price.allowance_policy_id,
      planKey: price.plan_key,
      includedMinutes: numeric(price.included_quantity),
      unitPriceCents: numeric(price.overage_unit_price_cents),
      pricingDisclosed: price.metadata_json?.disclosedOverage === true,
      autoBillDisclosedOverage: price.metadata_json?.autoBillDisclosedOverage === true,
      sponsoredByFerocity: sponsored,
      capturedAt: new Date().toISOString()
    } satisfies VoicePricingSnapshot : null;
    const admissionSnapshot = validVoicePricingSnapshot(price?.admission_pricing_snapshot);
    const recordedSnapshot = validVoicePricingSnapshot(existing.rows[0].metadata_json?.usagePricingSnapshot);
    const effectivePricing = recordedSnapshot ?? admissionSnapshot ?? currentSnapshot;
    const recordedSponsored = typeof existing.rows[0].metadata_json?.sponsoredByFerocity === "boolean"
      ? existing.rows[0].metadata_json.sponsoredByFerocity
      : undefined;
    const effectiveSponsored = recordedSnapshot?.sponsoredByFerocity
      ?? recordedSponsored
      ?? admissionSnapshot?.sponsoredByFerocity
      ?? currentSnapshot?.sponsoredByFerocity
      ?? sponsored;
    const existingFinalized = existing.rows[0].metadata_json?.customerChargeFinalized === true;
    const pricingUnavailable = managed && !effectiveSponsored && !effectivePricing;
    const pricingPending = pricingUnavailable && !existingFinalized;
    const effectiveMinutes = Math.max(minutes, numeric(existing.rows[0].quantity));
    const previousCharge = numeric(existing.rows[0].customer_charge_cents);
    const revisedCharge = managed && !effectiveSponsored && effectivePricing
      ? calculateManagedVoiceCharge({
          priorMinutes: numeric(price?.other_minutes), callMinutes: effectiveMinutes,
          includedMinutes: effectivePricing.includedMinutes,
          unitPriceCents: effectivePricing.unitPriceCents
        }).customerChargeCents
      : pricingUnavailable ? previousCharge : 0;
    const autoApproved = managed && revisedCharge > 0
      && effectivePricing?.pricingDisclosed === true
      && effectivePricing.autoBillDisclosedOverage === true;
    const customerChargeFinalized = existingFinalized || !pricingPending;
    const meterStatus = pricingUnavailable && existingFinalized
      ? existing.rows[0].status
      : pricingPending
      ? "pending_review"
      : revisedCharge <= 0 ? "included" : autoApproved ? "approved" : "pending_review";
    await query(
      `
      update public.usage_meter_events
      set provider_cost_cents = greatest(provider_cost_cents, $3),
          quantity = greatest(quantity, $4),
          customer_charge_cents = $5,
          status = $6,
          metadata_json = metadata_json || $7::jsonb
      where tenant_id = $1 and id = $2
      `,
      [
        input.tenantId,
        existing.rows[0].id,
        input.providerCostCents,
        effectiveMinutes,
        revisedCharge,
        meterStatus,
        JSON.stringify({
          providerCostFinalized:
            existing.rows[0].metadata_json?.providerCostFinalized === true || input.providerCostCents > 0,
          usageReconciledAt: new Date().toISOString(),
          sponsoredByFerocity: effectiveSponsored,
          usagePricingSnapshot: effectivePricing,
          pricingReconciliationStatus: pricingPending ? "pending_pricing_policy" : "reconciled",
          customerChargeFinalized
        })
      ]
    );
    await query(
      `
      update public.receptionist_calls
      set estimated_provider_cost_cents = greatest(estimated_provider_cost_cents, $3),
          billable_customer_amount_cents = $4,
          usage_units = greatest(usage_units,$5),
          metadata_json = metadata_json || $6::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        input.tenantId,
        input.callId,
        input.providerCostCents,
        Math.max(previousCharge, revisedCharge),
        effectiveMinutes,
        JSON.stringify({
          pricingReconciliationStatus: pricingPending ? "pending_pricing_policy" : "reconciled",
          customerChargeFinalized
        })
      ]
    );
    if (managed && price && customerChargeFinalized) {
      const monthKey = new Date().toISOString().slice(0, 7);
      await query(
        `update public.billing_usage_charges
         set amount_cents=(
               select ceil(coalesce(sum(u.customer_charge_cents),0))::integer
               from public.usage_meter_events u
               where u.tenant_id=$1 and u.feature_key='ai_receptionist'
                 and u.billing_period_start=date_trunc('month',now())::date
                 and u.status not in ('void','failed')
             ),updated_at=now()
         where tenant_id=$1 and charge_key=$2 and source_table='usage_meter_events' and source_id=$2`,
        [input.tenantId, `managed_voice:${monthKey}`]
      );
    }
    return { recorded: false, customerChargeCents: revisedCharge, retryable: false };
  }

  const contextResult = await query<{
    ownership_mode: string;
    plan_key: string | null;
    sponsorship_status: string | null;
    allowance_policy_id: string | null;
    included_quantity: string | number | null;
    hard_limit_quantity: string | number | null;
    overage_unit_price_cents: string | number | null;
    metadata_json: Record<string, unknown> | null;
    prior_minutes: string | number;
    admission_pricing_snapshot: unknown;
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
      p.id as allowance_policy_id,
      (select status from public.earn_provider_sponsorships es where es.tenant_id=$1 and es.status='active'
        and es.starts_at<=now() and (es.ends_at is null or es.ends_at>now()) limit 1) sponsorship_status,
      p.included_quantity,
      p.hard_limit_quantity,
      p.overage_unit_price_cents,
      p.metadata_json,
      (select c.admission_pricing_snapshot_json from public.receptionist_calls c
       where c.tenant_id=$1 and c.id=$3 limit 1) admission_pricing_snapshot,
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
    [input.tenantId, input.providerKey, input.callId]
  );
  const context = contextResult?.rows[0];
  const managed = managedOwnership(context?.ownership_mode);
  const sponsored = isProviderUsageSponsored(context?.sponsorship_status);
  const currentSnapshot = context?.allowance_policy_id ? {
    policyId: context.allowance_policy_id,
    planKey: context.plan_key,
    includedMinutes: numeric(context.included_quantity),
    unitPriceCents: numeric(context.overage_unit_price_cents),
    pricingDisclosed: context.metadata_json?.disclosedOverage === true,
    autoBillDisclosedOverage: context.metadata_json?.autoBillDisclosedOverage === true,
    sponsoredByFerocity: sponsored,
    capturedAt: new Date().toISOString()
  } satisfies VoicePricingSnapshot : null;
  const admissionSnapshot = validVoicePricingSnapshot(context?.admission_pricing_snapshot);
  const effectivePricing = admissionSnapshot ?? currentSnapshot;
  const effectiveSponsored = admissionSnapshot?.sponsoredByFerocity ?? sponsored;
  const pricingPending = !context || (managed && !effectiveSponsored && !effectivePricing);
  const charge = managed && !effectiveSponsored && effectivePricing
    ? calculateManagedVoiceCharge({
        priorMinutes: numeric(context?.prior_minutes),
        callMinutes: minutes,
        includedMinutes: effectivePricing.includedMinutes,
        unitPriceCents: effectivePricing.unitPriceCents
      })
    : { billableMinutes: 0, customerChargeCents: 0 };
  const autoApproved =
    managed
    && charge.customerChargeCents > 0
    && effectivePricing?.pricingDisclosed === true
    && effectivePricing.autoBillDisclosedOverage === true;
  const meterStatus = pricingPending
    ? "pending_review"
    : charge.customerChargeCents <= 0 ? "included" : autoApproved ? "approved" : "pending_review";
  const idempotencyKey = `${input.tenantId}:${input.providerKey}:call:${input.providerCallId}:minute`;

  const meter = await query<{
    id: string;
    quantity: string | number;
    provider_cost_cents: string | number;
    customer_charge_cents: string | number;
    status: string;
    metadata_json: Record<string, unknown> | null;
  }>(
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
    on conflict (tenant_id, idempotency_key) do update
    set quantity=greatest(public.usage_meter_events.quantity,excluded.quantity),
        provider_cost_cents=greatest(public.usage_meter_events.provider_cost_cents,excluded.provider_cost_cents),
        customer_charge_cents=case
          when coalesce((public.usage_meter_events.metadata_json->>'customerChargeFinalized')::boolean,false)
            and not coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false)
            then public.usage_meter_events.customer_charge_cents
          else greatest(public.usage_meter_events.customer_charge_cents,excluded.customer_charge_cents)
        end,
        status=case
          when coalesce((public.usage_meter_events.metadata_json->>'customerChargeFinalized')::boolean,false)
            and not coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false)
            then public.usage_meter_events.status
          when coalesce((public.usage_meter_events.metadata_json->>'customerChargeFinalized')::boolean,false)
            and coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false)
            then case
              when greatest(public.usage_meter_events.customer_charge_cents,excluded.customer_charge_cents) <= 0
                then 'included'
              when public.usage_meter_events.status='approved' or excluded.status='approved'
                then 'approved'
              else 'pending_review'
            end
          when coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false)
            then excluded.status
          else 'pending_review'
        end,
        metadata_json=public.usage_meter_events.metadata_json || excluded.metadata_json || jsonb_build_object(
          'providerCostFinalized',
          coalesce((public.usage_meter_events.metadata_json->>'providerCostFinalized')::boolean,false)
            or coalesce((excluded.metadata_json->>'providerCostFinalized')::boolean,false),
          'customerChargeFinalized',
          coalesce((public.usage_meter_events.metadata_json->>'customerChargeFinalized')::boolean,false)
            or coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false),
          'pricingReconciliationStatus',case
            when coalesce((public.usage_meter_events.metadata_json->>'customerChargeFinalized')::boolean,false)
              or coalesce((excluded.metadata_json->>'customerChargeFinalized')::boolean,false)
              then 'reconciled'
            else 'pending_pricing_policy'
          end,
          'usagePricingSnapshot',case
            when jsonb_typeof(public.usage_meter_events.metadata_json->'usagePricingSnapshot')='object'
              then public.usage_meter_events.metadata_json->'usagePricingSnapshot'
            else excluded.metadata_json->'usagePricingSnapshot'
          end
        )
    returning id,quantity,provider_cost_cents,customer_charge_cents,status,metadata_json
    `,
    [
      input.tenantId,
      context?.plan_key ?? null,
      input.providerKey,
      input.providerCallId,
      input.callId,
      minutes,
      input.providerCostCents,
      charge.customerChargeCents,
      meterStatus,
      idempotencyKey,
      JSON.stringify({
        ownershipMode: context?.ownership_mode ?? "unknown",
        managedVoice: managed,
        billableMinutes: charge.billableMinutes,
        overageUnitPriceCents: effectivePricing?.unitPriceCents ?? null,
        autoApproved,
        providerCostFinalized: input.providerCostCents > 0,
        sponsoredByFerocity: effectiveSponsored,
        usagePricingSnapshot: effectivePricing,
        pricingReconciliationStatus: pricingPending ? "pending_pricing_policy" : "reconciled",
        customerChargeFinalized: !pricingPending
      })
    ]
  );
  const meterRow = meter?.rows[0];
  const meterId = meterRow?.id;
  if (!meterId) throw new Error("Voice usage meter write returned no durable row.");
  const persistedMinutes = numeric(meterRow.quantity);
  const persistedProviderCost = numeric(meterRow.provider_cost_cents);
  const persistedCustomerCharge = numeric(meterRow.customer_charge_cents);
  const persistedChargeFinalized = meterRow.metadata_json?.customerChargeFinalized === true;

  await query(
    `
    update public.receptionist_calls
    set estimated_provider_cost_cents = greatest(estimated_provider_cost_cents,$3),
        billable_customer_amount_cents = greatest(billable_customer_amount_cents,$4),
        usage_units = greatest(usage_units,$5),
        metadata_json = metadata_json || $6::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      input.tenantId,
      input.callId,
      persistedProviderCost,
      persistedCustomerCharge,
      persistedMinutes,
      JSON.stringify({
        pricingReconciliationStatus: persistedChargeFinalized ? "reconciled" : "pending_pricing_policy",
        customerChargeFinalized: persistedChargeFinalized
      })
    ]
  );

  if (managed && persistedChargeFinalized && persistedCustomerCharge > 0) {
    const monthKey = new Date().toISOString().slice(0, 7);
    await query(
      `
      with monthly_total as (
        select ceil(coalesce(sum(u.customer_charge_cents),0))::integer as amount_cents
        from public.usage_meter_events u
        where u.tenant_id=$1 and u.feature_key='ai_receptionist'
          and u.billing_period_start=date_trunc('month',now())::date
          and u.status not in ('void','failed')
      )
      insert into public.billing_usage_charges (
        tenant_id, plan_key, charge_key, fee_family, description, source_table,
        source_id, amount_cents, status, period_start, period_end, metadata_json
      )
      select
        $1, $2, $3, 'usage_rebilling', $4, 'usage_meter_events', $3, monthly_total.amount_cents, $5,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        $6::jsonb
      from monthly_total
      where monthly_total.amount_cents > 0
      on conflict (tenant_id, charge_key, source_table, source_id)
        where source_table is not null and source_id is not null
      do update set
        amount_cents = excluded.amount_cents,
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
        context?.plan_key ?? effectivePricing?.planKey ?? null,
        `managed_voice:${monthKey}`,
        `Managed AI receptionist overage — ${monthKey}`,
        meterRow.status === "approved" ? "approved" : "pending_review",
        JSON.stringify({
          pricingDisclosed: effectivePricing?.pricingDisclosed === true,
          unitPriceCents: effectivePricing?.unitPriceCents ?? null,
          aggregatedMonthly: true
        })
      ]
    );
  }

  const actualCostPerMinute = input.providerCostCents / minutes;
  const costCeiling = numeric(context?.metadata_json?.providerCostCeilingCentsPerMinute) || 35;
  if (context && managed && actualCostPerMinute > costCeiling) {
    await query(
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
    await query(
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

  return { recorded: true, customerChargeCents: persistedCustomerCharge, retryable: false };
}

export async function recordVoiceUsage(input: VoiceUsageInput) {
  const result = await withPostgresTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `managed-voice-usage:${input.tenantId}`
    ]);
    const query: VoiceUsageQuery = async <T extends QueryResultRow>(text: string, values: unknown[] = []) => {
      return client.query<T>(text, values);
    };
    return recordVoiceUsageInTransaction(input, query);
  });
  return result ?? { recorded: false, customerChargeCents: 0, retryable: true };
}

export function automaticUsageBillingEnabled() {
  return env.FEROCITY_USAGE_BILLING_ENABLED === "true";
}
