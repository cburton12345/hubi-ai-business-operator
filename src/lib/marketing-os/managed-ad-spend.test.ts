import { describe, expect, it } from "vitest";
import { evaluateManagedAdSpend } from "./managed-ad-spend";

const readyControl = {
  status: "active",
  prepaidRequired: true,
  approvedByCustomer: true,
  liveSpendEnabled: true,
  availableCents: 50000,
  reservedCents: 0,
  dailySpentCents: 0,
  monthlySpentCents: 0,
  dailyCapCents: 10000,
  monthlyCapCents: 50000,
  stopLossCents: 0,
  providerFundingAccountId: "00000000-0000-0000-0000-000000000001",
  providerFundingReady: true
};

describe("evaluateManagedAdSpend", () => {
  it("blocks managed spend when live spend is off", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, liveSpendEnabled: false }, 5000);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("blocked");
  });

  it("requires customer approval", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, approvedByCustomer: false }, 5000);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs_approval");
  });

  it("requires prepaid balance when prepaid is required", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, availableCents: 1000 }, 5000);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs_payment");
  });

  it("blocks spend when Ferocity's provider funding account is stale or unavailable", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, providerFundingReady: false }, 5000);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("blocked");
  });

  it("allows managed spend inside approval, prepaid balance, and caps", () => {
    const decision = evaluateManagedAdSpend(readyControl, 5000);
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("allowed");
  });

  it("counts recorded and reserved spend against the daily cap", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, dailySpentCents: 7000, reservedCents: 2000 }, 1500);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs_caps");
  });

  it("pauses spend when the stop-loss would be exceeded", () => {
    const decision = evaluateManagedAdSpend({ ...readyControl, monthlySpentCents: 8000, stopLossCents: 10000 }, 2500);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("paused");
  });
});
