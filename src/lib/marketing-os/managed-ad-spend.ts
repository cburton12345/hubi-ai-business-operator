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
  availableCents: number;
  dailyCapCents: number;
  monthlyCapCents: number;
  managementFeeBps: number;
  stopLossCents: number;
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
  "status" | "prepaidRequired" | "approvedByCustomer" | "liveSpendEnabled" | "availableCents" | "dailyCapCents" | "monthlyCapCents"
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

  if (control.dailyCapCents <= 0 || control.monthlyCapCents <= 0) {
    return { allowed: false, status: "needs_caps", reason: "Daily and monthly ad spend caps must be set before launch." };
  }

  if (requested <= 0) {
    return { allowed: false, status: "blocked", reason: "Requested spend must be greater than zero." };
  }

  if (requested > control.dailyCapCents) {
    return { allowed: false, status: "needs_caps", reason: "Requested spend is higher than the daily cap." };
  }

  if (requested > control.monthlyCapCents) {
    return { allowed: false, status: "needs_caps", reason: "Requested spend is higher than the monthly cap." };
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
    notes: string;
  }>(
    `
    select id, provider_key, status, prepaid_required, approved_by_customer, live_spend_enabled,
           prepaid_balance_cents, reserved_cents, spent_cents, daily_cap_cents, monthly_cap_cents,
           management_fee_bps, stop_loss_cents, notes
    from public.managed_ad_budget_controls
    where tenant_id = $1 and lane_key = 'ferocity_managed'
    order by provider_key
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
      availableCents: Math.max(0, prepaidBalanceCents - reservedCents - spentCents),
      dailyCapCents: cents(row.daily_cap_cents),
      monthlyCapCents: cents(row.monthly_cap_cents),
      managementFeeBps: cents(row.management_fee_bps),
      stopLossCents: cents(row.stop_loss_cents),
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
