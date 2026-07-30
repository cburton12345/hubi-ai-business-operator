import { describe, expect, it } from "vitest";
import { calculateProviderFundingHealth } from "@/lib/usage/provider-funding";

const now = new Date("2026-07-10T12:00:00.000Z");

function healthyInput() {
  return {
    currentBalanceCents: 10_000,
    promotionalBalanceCents: 2_500,
    promotionalExpiresAt: "2026-08-01T00:00:00.000Z",
    monthlyProviderCostCents: 1_000,
    monthlyCustomerChargeCents: 2_000,
    reloadEnabled: true,
    reloadTriggerBalanceCents: 2_000,
    lowBalanceThresholdCents: 2_000,
    criticalBalanceThresholdCents: 500,
    paymentStatus: "current",
    syncStatus: "current",
    lastBalanceSyncAt: "2026-07-10T08:00:00.000Z"
  };
}

describe("provider funding health", () => {
  it("calculates runway, projection, and margin from tracked usage", () => {
    const health = calculateProviderFundingHealth(healthyInput(), now);

    expect(health.status).toBe("healthy");
    expect(health.totalAvailableCents).toBe(12_500);
    expect(health.averageDailyBurnCents).toBe(100);
    expect(health.projectedMonthlyProviderCostCents).toBe(3_100);
    expect(health.estimatedDaysRemaining).toBe(125);
    expect(health.grossMarginCents).toBe(1_000);
    expect(health.grossMarginPercent).toBe(50);
  });

  it("does not count an expired promotional balance", () => {
    const health = calculateProviderFundingHealth({
      ...healthyInput(),
      currentBalanceCents: 1_500,
      promotionalBalanceCents: 30_000,
      promotionalExpiresAt: "2026-07-01T00:00:00.000Z"
    }, now);

    expect(health.promotionalBalanceCents).toBe(0);
    expect(health.totalAvailableCents).toBe(1_500);
    expect(health.status).toBe("low");
    expect(health.needsReload).toBe(true);
  });

  it("prioritizes a provider payment failure over balance health", () => {
    const health = calculateProviderFundingHealth({
      ...healthyInput(),
      paymentStatus: "failed"
    }, now);

    expect(health.status).toBe("payment_issue");
  });

  it("flags missing and stale balances for synchronization", () => {
    expect(calculateProviderFundingHealth({
      ...healthyInput(),
      currentBalanceCents: null
    }, now).status).toBe("needs_sync");

    expect(calculateProviderFundingHealth({
      ...healthyInput(),
      lastBalanceSyncAt: "2026-07-08T00:00:00.000Z"
    }, now).status).toBe("needs_sync");
  });

  it("flags depleted and critical account balances", () => {
    expect(calculateProviderFundingHealth({
      ...healthyInput(),
      currentBalanceCents: 0,
      promotionalBalanceCents: 0
    }, now).status).toBe("depleted");

    expect(calculateProviderFundingHealth({
      ...healthyInput(),
      currentBalanceCents: 400,
      promotionalBalanceCents: 0
    }, now).status).toBe("critical");
  });
});
