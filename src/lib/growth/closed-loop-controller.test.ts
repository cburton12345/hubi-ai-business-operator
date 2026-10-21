import { describe, expect, it } from "vitest";
import { chooseGrowthDirective } from "./closed-loop-controller";

const healthy = { targetCollectedRevenueCents: 1_000_000, collectedRevenueCents: 400_000, dataCompletenessScore: 90, attributionCoverageRate: 0.8, capacityAvailableJobs: 20, committedJobs: 5, grossMarginRate: 0.45, minimumGrossMarginRate: 0.3, customerAcquisitionCostCents: 10_000, maximumCustomerAcquisitionCostCents: 20_000, returnOnAdSpend: 5, minimumReturnOnAdSpend: 3 };

describe("closed loop growth controller", () => {
  it("expands only when target gap, evidence, capacity and economics agree", () => expect(chooseGrowthDirective(healthy).directive).toBe("expand"));
  it("repairs data before changing demand", () => expect(chooseGrowthDirective({ ...healthy, dataCompletenessScore: 20, attributionCoverageRate: 0.1 }).directive).toBe("repair_data"));
  it("repairs paid measurement instead of trusting projected economics", () => expect(chooseGrowthDirective({ ...healthy, paidSpendCents: 50_000, paidEconomicsComplete: false }).directive).toBe("repair_data"));
  it("constrains paid demand when current spend has no attributed sale", () => expect(chooseGrowthDirective({ ...healthy, paidSpendCents: 50_000, paidSoldJobs: 0, paidEconomicsComplete: true }).directive).toBe("constrain"));
  it("constrains growth when capacity is full", () => expect(chooseGrowthDirective({ ...healthy, committedJobs: 20 }).directive).toBe("constrain"));
  it("holds when the target is met", () => expect(chooseGrowthDirective({ ...healthy, collectedRevenueCents: 1_000_000 }).directive).toBe("hold"));
});
