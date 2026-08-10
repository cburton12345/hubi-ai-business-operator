import { describe, expect, it } from "vitest";
import { normalizeStripeV2Account, stripeConnectStatus } from "./stripe-connect";

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

  it("reports submitted accounts awaiting Stripe review without calling them connected", () => {
    const account = normalizeStripeV2Account({
      id: "acct_pending",
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: "restricted" },
            stripe_balance: { payouts: { status: "pending" } }
          }
        }
      },
      requirements: { entries: [] }
    });

    expect(account.details_submitted).toBe(true);
    expect(account.charges_enabled).toBe(false);
    expect(account.payouts_enabled).toBe(false);
    expect(stripeConnectStatus(account)).toBe("pending_review");
  });

  it("keeps genuinely unsupported capabilities restricted", () => {
    const account = normalizeStripeV2Account({
      id: "acct_unsupported",
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: "unsupported" },
            stripe_balance: { payouts: { status: "unsupported" } }
          }
        }
      },
      requirements: { entries: [] }
    });

    expect(stripeConnectStatus(account)).toBe("restricted");
  });
});
