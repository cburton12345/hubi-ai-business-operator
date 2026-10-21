import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type TestClient = { query: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  withPostgresTransactionResult: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => mocks);

import {
  recordPlatformSubscriptionInvoiceEvent,
  recordPlatformSubscriptionRefundEvent,
} from "@/lib/billing/platform-subscription-revenue";

describe("platform subscription revenue ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records actual paid invoice cash idempotently by Stripe event", async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [{ id: "ledger-1" }] });

    const result = await recordPlatformSubscriptionInvoiceEvent({
      eventId: "evt_paid_1",
      eventType: "invoice.paid",
      invoice: {
        id: "in_1",
        amount_paid: 34900,
        currency: "usd",
        period_start: 1790812800,
        period_end: 1793491200,
        created: 1790812800,
        billing_reason: "subscription_cycle",
      },
      identity: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        planKey: "growth",
        subscriptionId: "sub_1",
        customerId: "cus_1",
      },
    });

    expect(result).toEqual({ recorded: true, collected: true, amountCents: 34900 });
    expect(mocks.queryPostgres).toHaveBeenCalledWith(expect.stringContaining("on conflict (provider_event_id) do nothing"), expect.arrayContaining([
      "evt_paid_1", "in_1", "sub_1", "cus_1", "subscription_invoice_paid", "collected", 34900,
    ]));
  });

  it("records a failed amount as revenue at risk without counting it as cash", async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [{ id: "ledger-risk" }] });

    const result = await recordPlatformSubscriptionInvoiceEvent({
      eventId: "evt_failed_1",
      eventType: "invoice.payment_failed",
      invoice: { id: "in_risk", amount_due: 14900, currency: "usd", created: 1790812800 },
      identity: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        planKey: "starter",
        subscriptionId: "sub_risk",
        customerId: "cus_risk",
      },
    });

    expect(result).toEqual({ recorded: true, collected: false, amountCents: 14900 });
    expect(mocks.queryPostgres).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
      "subscription_invoice_failed", "at_risk", 14900, 0, "usd",
    ]));
  });

  it("records only the incremental refund when Stripe reports a cumulative amount", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{
          tenant_id: "11111111-1111-4111-8111-111111111111",
          plan_key: "growth",
          external_subscription_ref: "sub_1",
          external_customer_ref: "cus_1",
        }] })
        .mockResolvedValueOnce({ rows: [{ refunded_cents: "4000" }] })
        .mockResolvedValueOnce({ rows: [{ id: "refund-2" }] }),
    };
    mocks.withPostgresTransactionResult.mockImplementationOnce(async (operation: (client: TestClient) => Promise<unknown>) => ({
      ok: true,
      value: await operation(client),
    }));

    const result = await recordPlatformSubscriptionRefundEvent({
      eventId: "evt_refund_2",
      charge: { id: "ch_1", customer: "cus_1", amount_refunded: 10000, currency: "usd", created: 1790812800 },
    });

    expect(result).toEqual({ status: "recorded", amountCents: 6000 });
    expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining("'subscription_refund'"), expect.arrayContaining([
      "evt_refund_2", "ch_1", "sub_1", "cus_1", 6000, -6000,
    ]));
  });

  it("ignores a refund that is not tied to a Ferocity subscription customer", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mocks.withPostgresTransactionResult.mockImplementationOnce(async (operation: (client: TestClient) => Promise<unknown>) => ({
      ok: true,
      value: await operation(client),
    }));

    const result = await recordPlatformSubscriptionRefundEvent({
      eventId: "evt_customer_refund",
      charge: { id: "ch_customer", customer: "cus_customer", amount_refunded: 2500 },
    });

    expect(result).toEqual({ status: "not_subscription", amountCents: 0 });
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
