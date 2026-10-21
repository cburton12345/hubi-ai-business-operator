import { beforeEach, describe, expect, it, vi } from "vitest";

const queryPostgres = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

import { getPlatformActivity } from "@/lib/platform/get-platform-activity";

describe("platform revenue activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports acquisition, verified activation, recovery, and recurring plan value separately", async () => {
    queryPostgres
      .mockResolvedValueOnce({ rows: [{
        views_24h: "10", views_7d: "70", views_30d: "300",
        checkout_started_30d: "20", checkout_redirected_30d: "15", paid_30d: "6",
        activated_30d: "4", at_risk: "2", stalled_provisioning: "1", failed_checkout_30d: "3",
        abandoned_checkout_30d: "5", active_plan_value_cents: "104400", at_risk_plan_value_cents: "14900",
        collected_month_cents: "119800", refunded_month_cents: "9900", net_collected_month_cents: "109900", payment_risk_cents: "34900",
        provider_cost_month_cents: "12000",
        open_support: "2",
      }] })
      .mockResolvedValueOnce({ rows: [{ path: "/pricing", views: "40" }] })
      .mockResolvedValueOnce({ rows: [{ source: "direct", views: "25" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "request-1", company_name: "Example Co", email: "owner@example.com", requested_plan: "growth",
        checkout_status: "redirected", created_at: new Date("2026-10-16T12:00:00.000Z"),
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const activity = await getPlatformActivity();

    expect(activity.metrics).toMatchObject({
      checkoutStarted30d: 20,
      checkoutRedirected30d: 15,
      paid30d: 6,
      activated30d: 4,
      stalledProvisioning: 1,
      failedCheckout30d: 3,
      abandonedCheckout30d: 5,
      activePlanValueCents: 104400,
      atRiskPlanValueCents: 14900,
      collectedMonthCents: 119800,
      refundedMonthCents: 9900,
      netCollectedMonthCents: 109900,
      paymentRiskCents: 34900,
      providerCostMonthCents: 12000,
    });
    expect(activity.subscriptions[0]).toMatchObject({ status: "redirected", title: "Example Co" });
  });
});
