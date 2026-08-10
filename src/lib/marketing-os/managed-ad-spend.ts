import { queryPostgres } from "@/lib/db/postgres";

export type ManagedAdBudgetControl = {
  id: string;
  providerKey: string;
  status: string;
  prepaidRequired: boolean;
  approvedByCustomer: boolean;
  liveSpendEnabled: boolean;
  prepaidBalanceCents: number;
  reservedCents: number;
  spentCents: number;
  dailySpentCents: number;
  monthlySpentCents: number;
  availableCents: number;
  dailyCapCents: number;
  monthlyCapCents: number;
  managementFeeBps: number;
  stopLossCents: number;
  providerFundingAccountId: string | null;
  providerFundingReady: boolean;
  notes: string;
};

export type ManagedAdSpendDecision = {
  allowed: boolean;
  status: "allowed" | "blocked" | "needs_payment" | "needs_approval" | "needs_caps" | "paused";
  reason: string;
};

function cents(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function evaluateManagedAdSpend(control: Pick<
  ManagedAdBudgetControl,
  | "status"
  | "prepaidRequired"
  | "approvedByCustomer"
  | "liveSpendEnabled"
  | "availableCents"
  | "dailyCapCents"
  | "monthlyCapCents"
  | "dailySpentCents"
  | "monthlySpentCents"
  | "reservedCents"
  | "stopLossCents"
  | "providerFundingAccountId"
  | "providerFundingReady"
>, requestedSpendCents: number): ManagedAdSpendDecision {
  const requested = cents(requestedSpendCents);

  if (!control.liveSpendEnabled || ["not_ready", "blocked", "archived"].includes(control.status)) {
    return {
      allowed: false,
      status: "blocked",
      reason: "Managed ad spend is off until the provider account, approval, prepaid budget, and hard caps are ready."
    };
  }

  if (control.status === "paused") {
    return { allowed: false, status: "paused", reason: "Managed ad spend is paused for this workspace." };
  }

  if (!control.approvedByCustomer) {
    return { allowed: false, status: "needs_approval", reason: "Customer approval is required before Ferocity-managed ad spend." };
  }

  if (!control.providerFundingAccountId || !control.providerFundingReady) {
    return { allowed: false, status: "blocked", reason: "The Ferocity provider billing account needs a current, funded balance before launch." };
  }

  if (control.dailyCapCents <= 0 || control.monthlyCapCents <= 0) {
    return { allowed: false, status: "needs_caps", reason: "Daily and monthly ad spend caps must be set before launch." };
  }

  if (requested <= 0) {
    return { allowed: false, status: "blocked", reason: "Requested spend must be greater than zero." };
  }

  if (control.dailySpentCents + control.reservedCents + requested > control.dailyCapCents) {
    return { allowed: false, status: "needs_caps", reason: "This spend would exceed the remaining daily cap." };
  }

  if (control.monthlySpentCents + control.reservedCents + requested > control.monthlyCapCents) {
    return { allowed: false, status: "needs_caps", reason: "This spend would exceed the remaining monthly cap." };
  }

  if (control.stopLossCents > 0 && control.monthlySpentCents + control.reservedCents + requested > control.stopLossCents) {
    return { allowed: false, status: "paused", reason: "The managed-ad stop-loss threshold was reached." };
  }

  if (control.prepaidRequired && requested > control.availableCents) {
    return { allowed: false, status: "needs_payment", reason: "Prepaid ad budget is not high enough for this spend." };
  }

  return { allowed: true, status: "allowed", reason: "Managed ad spend is within approval, prepaid balance, and budget caps." };
}

export async function getManagedAdBudgetControls(tenantId: string): Promise<ManagedAdBudgetControl[]> {
  const result = await queryPostgres<{
    id: string;
    provider_key: string;
    status: string;
    prepaid_required: boolean;
    approved_by_customer: boolean;
    live_spend_enabled: boolean;
    prepaid_balance_cents: number;
    reserved_cents: number;
    spent_cents: number;
    daily_cap_cents: number;
    monthly_cap_cents: number;
    management_fee_bps: number;
    stop_loss_cents: number;
    daily_spent_cents: number;
    monthly_spent_cents: number;
    provider_funding_account_id: string | null;
    provider_funding_ready: boolean;
    notes: string;
  }>(
    `
    select c.id, c.provider_key, c.status, c.prepaid_required, c.approved_by_customer, c.live_spend_enabled,
           c.prepaid_balance_cents, c.reserved_cents, c.spent_cents, c.daily_cap_cents, c.monthly_cap_cents,
           c.management_fee_bps, c.stop_loss_cents, c.provider_funding_account_id, c.notes,
           (
             f.id is not null
             and f.payment_status = 'current'
             and f.status not in ('depleted', 'payment_issue', 'paused', 'closed')
             and f.last_balance_sync_at is not null
             and f.last_balance_sync_at >= now() - interval '36 hours'
           ) as provider_funding_ready,
           coalesce((
             select sum(e.amount_cents)
             from public.managed_ad_spend_events e
             where e.budget_control_id = c.id
               and e.event_type = 'spend_recorded'
               and e.created_at >= date_trunc('day', now())
           ), 0)::integer as daily_spent_cents,
           coalesce((
             select sum(e.amount_cents)
             from public.managed_ad_spend_events e
             where e.budget_control_id = c.id
               and e.event_type = 'spend_recorded'
               and e.created_at >= date_trunc('month', now())
           ), 0)::integer as monthly_spent_cents
    from public.managed_ad_budget_controls c
    left join public.provider_funding_accounts f on f.id = c.provider_funding_account_id
    where c.tenant_id = $1 and c.lane_key = 'ferocity_managed'
    order by c.provider_key
    `,
    [tenantId]
  );

  return (result?.rows ?? []).map((row) => {
    const prepaidBalanceCents = cents(row.prepaid_balance_cents);
    const reservedCents = cents(row.reserved_cents);
    const spentCents = cents(row.spent_cents);
    return {
      id: row.id,
      providerKey: row.provider_key,
      status: row.status,
      prepaidRequired: row.prepaid_required,
      approvedByCustomer: row.approved_by_customer,
      liveSpendEnabled: row.live_spend_enabled,
      prepaidBalanceCents,
      reservedCents,
      spentCents,
      dailySpentCents: cents(row.daily_spent_cents),
      monthlySpentCents: cents(row.monthly_spent_cents),
      availableCents: Math.max(0, prepaidBalanceCents - reservedCents - spentCents),
      dailyCapCents: cents(row.daily_cap_cents),
      monthlyCapCents: cents(row.monthly_cap_cents),
      managementFeeBps: cents(row.management_fee_bps),
      stopLossCents: cents(row.stop_loss_cents),
      providerFundingAccountId: row.provider_funding_account_id,
      providerFundingReady: row.provider_funding_ready,
      notes: row.notes
    };
  });
}

export async function canUseManagedAdSpend(tenantId: string, providerKey: string, requestedSpendCents: number) {
  const controls = await getManagedAdBudgetControls(tenantId);
  const control = controls.find((item) => item.providerKey === providerKey);
  if (!control) {
    return {
      allowed: false,
      status: "blocked",
      reason: "No managed ad budget control exists for this provider."
    } satisfies ManagedAdSpendDecision;
  }
  return evaluateManagedAdSpend(control, requestedSpendCents);
}

export type ManagedAdSpendReservationDecision = {
  reservationId: string | null;
  allowed: boolean;
  status: string;
  reason: string;
  availableCents: number;
  dailyRemainingCents: number;
  monthlyRemainingCents: number;
};

export async function reserveManagedAdSpend(input: {
  tenantId: string;
  providerKey: string;
  requestedSpendCents: number;
  idempotencyKey: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ManagedAdSpendReservationDecision> {
  const result = await queryPostgres<{
    reservation_id: string | null;
    allowed: boolean;
    decision_status: string;
    reason: string;
    available_cents: number;
    daily_remaining_cents: number;
    monthly_remaining_cents: number;
  }>(
    `
    select *
    from public.reserve_managed_ad_spend(
      $1::uuid, $2, $3::integer, $4, $5, nullif($6, '')::uuid, $7::jsonb
    )
    `,
    [
      input.tenantId,
      input.providerKey,
      cents(input.requestedSpendCents),
      input.idempotencyKey,
      input.sourceTable ?? null,
      input.sourceId ?? "",
      JSON.stringify(input.metadata ?? {})
    ]
  );

  const row = result?.rows[0];
  if (!row) {
    return {
      reservationId: null,
      allowed: false,
      status: "blocked",
      reason: "Managed-ad budget reservation could not be verified.",
      availableCents: 0,
      dailyRemainingCents: 0,
      monthlyRemainingCents: 0
    };
  }

  return {
    reservationId: row.reservation_id,
    allowed: row.allowed,
    status: row.decision_status,
    reason: row.reason,
    availableCents: cents(row.available_cents),
    dailyRemainingCents: cents(row.daily_remaining_cents),
    monthlyRemainingCents: cents(row.monthly_remaining_cents)
  };
}

export async function settleManagedAdSpend(input: {
  tenantId: string;
  reservationId: string;
  actualSpendCents: number;
  externalReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ settled: boolean }>(
    `select public.settle_managed_ad_spend($1::uuid, $2::uuid, $3::integer, $4, $5::jsonb) as settled`,
    [
      input.tenantId,
      input.reservationId,
      cents(input.actualSpendCents),
      input.externalReference ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result?.rows[0]?.settled === true;
}

export async function releaseManagedAdSpend(input: {
  tenantId: string;
  reservationId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ released: boolean }>(
    `select public.release_managed_ad_spend($1::uuid, $2::uuid, $3, $4::jsonb) as released`,
    [input.tenantId, input.reservationId, input.reason ?? "Provider action did not execute", JSON.stringify(input.metadata ?? {})]
  );
  return result?.rows[0]?.released === true;
}
