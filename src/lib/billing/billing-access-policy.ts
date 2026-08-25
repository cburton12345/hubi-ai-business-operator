export type BillingAccessStage = "current" | "grace" | "restricted" | "suspended";

export type BillingAccessPolicy = {
  stage: BillingAccessStage;
  allowPaidActions: boolean;
  allowManagedSpend: boolean;
  preserveDataAccess: true;
  reason: string;
  daysPastDue: number;
};

const FULL_SERVICE_GRACE_DAYS = 7;
const SUSPENSION_DAY = 15;

function validDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function evaluateBillingAccess(input: {
  status: string | null | undefined;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}): BillingAccessPolicy {
  const status = (input.status ?? "").toLowerCase();
  if (["active", "trialing", "manual"].includes(status)) {
    return {
      stage: "current",
      allowPaidActions: true,
      allowManagedSpend: true,
      preserveDataAccess: true,
      reason: "Subscription is current.",
      daysPastDue: 0
    };
  }

  if (status === "cancelled" || status === "canceled") {
    return {
      stage: "suspended",
      allowPaidActions: false,
      allowManagedSpend: false,
      preserveDataAccess: true,
      reason: "Subscription ended. Data and billing access remain available, but paid actions are paused.",
      daysPastDue: SUSPENSION_DAY
    };
  }

  if (!["past_due", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(status)) {
    return {
      stage: "suspended",
      allowPaidActions: false,
      allowManagedSpend: false,
      preserveDataAccess: true,
      reason: "A current subscription could not be verified. Data and billing access remain available, but paid actions are paused.",
      daysPastDue: SUSPENSION_DAY
    };
  }

  // If Stripe reports past due before Ferocity has stored the first-failure
  // timestamp, fail open into the grace period rather than interrupting work.
  const now = input.now ?? new Date();
  const pastDueSince = validDate(input.metadata?.billingPastDueSince);
  const daysPastDue = pastDueSince
    ? Math.max(0, Math.floor((now.getTime() - pastDueSince.getTime()) / 86_400_000))
    : 0;

  if (daysPastDue < FULL_SERVICE_GRACE_DAYS) {
    return {
      stage: "grace",
      allowPaidActions: true,
      allowManagedSpend: true,
      preserveDataAccess: true,
      reason: "Payment needs attention, but Ferocity is keeping the workspace running during the recovery period.",
      daysPastDue
    };
  }

  if (daysPastDue < SUSPENSION_DAY) {
    return {
      stage: "restricted",
      allowPaidActions: false,
      allowManagedSpend: false,
      preserveDataAccess: true,
      reason: "Payment is still past due. New paid actions are paused, while data and billing access remain available.",
      daysPastDue
    };
  }

  return {
    stage: "suspended",
    allowPaidActions: false,
    allowManagedSpend: false,
    preserveDataAccess: true,
    reason: "The recovery period ended. Paid automation is paused until payment is restored; workspace data remains available.",
    daysPastDue
  };
}
