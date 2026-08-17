import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), stripe: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { FEROCITY_EARN_SETTLEMENT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_safe" } }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/payments/stripe-connect", () => ({ stripeFormRequest: mocks.stripe }));
vi.mock("@/lib/observability/log-error", () => ({ logAppError: mocks.log }));

import { recordEarnSettlementStripeEvent, syncEarnSettlementToStripe } from "./earn-settlement";

describe("Earn settlement Stripe runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one idempotent invoice item and automatic Stripe invoice", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222",
        period_start: "2026-08-01", period_end: "2026-08-31", total_due_cents: "1234",
        idempotency_key: "earn-settlement:tenant:2026-08-01", external_customer_ref: "cus_123"
      }] })
      .mockResolvedValue({ rows: [] });
    mocks.stripe
      .mockResolvedValueOnce({ id: "ii_123" })
      .mockResolvedValueOnce({ id: "in_123", status: "draft" });

    await expect(syncEarnSettlementToStripe("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
      status: "processing", providerInvoiceId: "in_123", amountCents: 1234
    });
    expect(mocks.stripe.mock.calls[0][2].idempotencyKey).toBe("earn-settlement:tenant:2026-08-01:item");
    expect(mocks.stripe.mock.calls[1][2].idempotencyKey).toBe("earn-settlement:tenant:2026-08-01:invoice");
    expect(String(mocks.stripe.mock.calls[1][1])).toContain("collection_method=charge_automatically");
  });

  it("records a safe failed state for retry when Stripe rejects collection", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222",
        period_start: "2026-08-01", period_end: "2026-08-31", total_due_cents: "500",
        idempotency_key: "earn-settlement:tenant:2026-08-01", external_customer_ref: "cus_123"
      }] })
      .mockResolvedValue({ rows: [] });
    mocks.stripe.mockRejectedValue(new Error("card requires attention"));

    await expect(syncEarnSettlementToStripe("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
      status: "failed", reason: "card requires attention"
    });
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ retryable: true }));
  });

  it("settles linked ledger entries only after a verified paid invoice event", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await recordEarnSettlementStripeEvent({
      eventId: "evt_123", eventType: "invoice.paid", invoiceId: "in_123",
      tenantId: "22222222-2222-4222-8222-222222222222", settlementId: "11111111-1111-4111-8111-111111111111",
      amountPaidCents: 1234
    });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(String(sql)).toContain("status=$4");
    expect(params[3]).toBe("paid");
    expect(params[7]).toBe("settled");
  });
});
