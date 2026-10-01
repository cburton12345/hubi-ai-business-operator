export type NumberLifecycleAction =
  | "none"
  | "provision"
  | "restrict"
  | "restore"
  | "retain"
  | "release"
  | "hold_for_port_out";

export type NumberLifecycleDecision = {
  action: NumberLifecycleAction;
  reason: string;
  retainUntil: string | null;
};

const DAY_MS = 86_400_000;
export const FULL_SERVICE_GRACE_DAYS = 7;
export const NUMBER_RETENTION_DAYS = 30;
export const MANAGED_NUMBER_PLAN_KEYS = ["calls", "starter", "growth", "operator"] as const;

export function planIncludesManagedNumber(planKey: string | null | undefined) {
  return MANAGED_NUMBER_PLAN_KEYS.includes((planKey ?? "") as (typeof MANAGED_NUMBER_PLAN_KEYS)[number]);
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function plusDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function decideManagedNumberLifecycle(input: {
  connectionPath: string | null;
  provisioningApproved: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd?: string | null;
  billingPastDueSince?: string | null;
  retentionStartedAt?: string | null;
  retainUntil?: string | null;
  numberStatus?: string | null;
  hasManagedNumber: boolean;
  portOutRequested: boolean;
  now?: Date;
}): NumberLifecycleDecision {
  const now = input.now ?? new Date();
  const status = (input.subscriptionStatus ?? "").toLowerCase();
  if (input.connectionPath !== "new_ferocity_number" || !input.provisioningApproved) {
    return { action: "none", reason: "Managed number activation was not selected.", retainUntil: null };
  }

  if (["active", "trialing", "manual"].includes(status)) {
    if (!input.hasManagedNumber || input.numberStatus === "released") {
      return { action: "provision", reason: "Managed calling is selected and billing is current.", retainUntil: null };
    }
    if (["paused", "needs_attention"].includes(input.numberStatus ?? "")) {
      return { action: "restore", reason: "Billing recovered while the managed number was retained.", retainUntil: null };
    }
    return { action: "none", reason: "Managed number is current.", retainUntil: null };
  }

  if (!input.hasManagedNumber || input.numberStatus === "released") {
    return { action: "none", reason: "There is no managed number to retain or release.", retainUntil: null };
  }
  if (input.portOutRequested) {
    return { action: "hold_for_port_out", reason: "A customer port-out request blocks automatic release.", retainUntil: input.retainUntil ?? null };
  }

  const periodEnd = validDate(input.currentPeriodEnd);
  if (status === "cancelled" && periodEnd && periodEnd.getTime() > now.getTime()) {
    return { action: "none", reason: "Cancellation is scheduled; service continues through the paid term.", retainUntil: null };
  }

  const pastDueSince = validDate(input.billingPastDueSince);
  if (status === "past_due" && pastDueSince && now.getTime() < plusDays(pastDueSince, FULL_SERVICE_GRACE_DAYS).getTime()) {
    return { action: "none", reason: "Payment is inside the full-service recovery period.", retainUntil: null };
  }

  const retentionStart = validDate(input.retentionStartedAt)
    ?? (status === "past_due" ? pastDueSince : null)
    ?? periodEnd
    ?? now;
  const retainUntil = validDate(input.retainUntil) ?? plusDays(retentionStart, NUMBER_RETENTION_DAYS);
  if (now.getTime() >= retainUntil.getTime()) {
    return { action: "release", reason: "The protected recovery and port-out window ended.", retainUntil: retainUntil.toISOString() };
  }
  if (input.numberStatus !== "paused") {
    return { action: "restrict", reason: "Paid calling is restricted while the number remains protected.", retainUntil: retainUntil.toISOString() };
  }
  return { action: "retain", reason: "The number remains protected for payment recovery or port-out.", retainUntil: retainUntil.toISOString() };
}
