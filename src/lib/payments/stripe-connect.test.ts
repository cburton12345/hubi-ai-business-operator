import { describe, expect, it } from "vitest";
import { normalizeStripeV2Account } from "./stripe-connect";

describe("normalizeStripeV2Account", () => {
  it("requires both card charging and payout capabilities before an account is ready", () => {
    const account = normalizeStripeV2Account({
      id: "acct_ready",
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: "active" },
            stripe_balance: { payouts: { status: "restricted" } }
          }
        }
      },
      requirements: { entries: [] }
    });

    expect(account.charges_enabled).toBe(true);
    expect(account.payouts_enabled).toBe(false);
    expect(account.details_submitted).toBe(true);
  });

  it("marks payouts ready only when Stripe reports the payout capability active", () => {
    const account = normalizeStripeV2Account({
      id: "acct_ready",
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: "active" },
            stripe_balance: { payouts: { status: "active" } }
          }
        }
      },
      requirements: { entries: [] }
    });

    expect(account.charges_enabled).toBe(true);
    expect(account.payouts_enabled).toBe(true);
    expect(account.details_submitted).toBe(true);
  });
});
