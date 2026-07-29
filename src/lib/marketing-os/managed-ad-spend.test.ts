import { describe, expect, it } from "vitest";
import { evaluateManagedAdSpend } from "./managed-ad-spend";

const readyControl = {
  status: "active",
  prepaidRequired: true,
  approvedByCustomer: true,
  liveSpendEnabled: true,
  availableCents: 50000,
  dailyCapCents: 10000,
  monthlyCapCents: 50000
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

  it("allows managed spend inside approval, prepaid balance, and caps", () => {
    const decision = evaluateManagedAdSpend(readyControl, 5000);
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("allowed");
  });
});
