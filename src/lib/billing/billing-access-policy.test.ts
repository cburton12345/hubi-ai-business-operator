import { describe, expect, it } from "vitest";
import { evaluateBillingAccess } from "./billing-access-policy";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("evaluateBillingAccess", () => {
  it("keeps active and trial subscriptions fully available", () => {
    expect(evaluateBillingAccess({ status: "active", now })).toMatchObject({ stage: "current", allowPaidActions: true });
    expect(evaluateBillingAccess({ status: "trialing", now })).toMatchObject({ stage: "current", allowManagedSpend: true });
  });

  it("keeps service running for the first seven days after a failed payment", () => {
    expect(evaluateBillingAccess({
      status: "past_due",
      metadata: { billingPastDueSince: "2026-08-20T12:00:00.000Z" },
      now
    })).toMatchObject({ stage: "grace", allowPaidActions: true, daysPastDue: 4 });
  });

  it("fails open into grace when an older record has no failure timestamp", () => {
    expect(evaluateBillingAccess({ status: "past_due", now })).toMatchObject({ stage: "grace", allowPaidActions: true });
  });

  it("pauses new paid actions after grace without taking away data access", () => {
    expect(evaluateBillingAccess({
      status: "past_due",
      metadata: { billingPastDueSince: "2026-08-15T12:00:00.000Z" },
      now
    })).toMatchObject({ stage: "restricted", allowPaidActions: false, preserveDataAccess: true });
  });

  it("suspends paid automation after day fourteen and recovers immediately on payment", () => {
    const metadata = { billingPastDueSince: "2026-08-01T12:00:00.000Z" };
    expect(evaluateBillingAccess({ status: "past_due", metadata, now })).toMatchObject({ stage: "suspended", allowPaidActions: false });
    expect(evaluateBillingAccess({ status: "active", metadata, now })).toMatchObject({ stage: "current", allowPaidActions: true });
  });

  it("does not treat an unknown billing state as a free grace period", () => {
    expect(evaluateBillingAccess({ status: "unknown", now })).toMatchObject({ stage: "suspended", allowPaidActions: false });
  });
});
