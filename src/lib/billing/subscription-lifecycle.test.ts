import { describe, expect, it } from "vitest";
import { getInvoiceSubscriptionId, mapStripeSubscriptionStatus } from "./subscription-lifecycle";

describe("subscription lifecycle", () => {
  it("maps Stripe lifecycle states without granting failed subscriptions a trial", () => {
    expect(mapStripeSubscriptionStatus("active", "customer.subscription.updated")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing", "customer.subscription.created")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("incomplete", "customer.subscription.updated")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid", "customer.subscription.updated")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("active", "customer.subscription.deleted")).toBe("cancelled");
  });

  it("reads both legacy and current Stripe invoice subscription shapes", () => {
    expect(getInvoiceSubscriptionId({ subscription: "sub_legacy" })).toBe("sub_legacy");
    expect(getInvoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_current" } } })).toBe("sub_current");
  });

  it("does not confuse non-subscription invoices with recurring billing", () => {
    expect(getInvoiceSubscriptionId({ customer: "cus_123", billing_reason: "manual" })).toBeNull();
  });
});
