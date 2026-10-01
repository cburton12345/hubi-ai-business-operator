import { describe, expect, it } from "vitest";
import { buildReverseRevenuePlan } from "./reverse-revenue-plan";

describe("reverse revenue planning", () => {
  it("works backward from collected revenue without hiding assumptions", () => {
    const plan = buildReverseRevenuePlan({
      targetCollectedRevenueCents: 1_000_000, averageCollectedJobCents: 100_000, grossMarginRate: 0.5,
      costPerLeadCents: 2_000, availableJobCapacity: 20, currentCommittedJobs: 2,
      rates: {
        winToCollected: { rate: 1, sampleSize: 40, source: "observed" }, estimateToWin: { rate: 0.5, sampleSize: 40, source: "observed" },
        showToEstimate: { rate: 1, sampleSize: 40, source: "observed" }, appointmentToShow: { rate: 0.8, sampleSize: 40, source: "observed" },
        qualifiedToAppointment: { rate: 0.5, sampleSize: 40, source: "observed" }, leadToQualified: { rate: 0.5, sampleSize: 40, source: "observed" },
        trafficToLead: { rate: 0.1, sampleSize: 100, source: "observed" }
      }
    });
    expect(plan.required).toMatchObject({ collectedJobs: 10, wonJobs: 10, estimates: 20, shows: 20, appointments: 25, qualifiedLeads: 50, leads: 100, traffic: 1000 });
    expect(plan.economics.estimatedAcquisitionSpendCents).toBe(200_000);
    expect(plan.capacity.feasible).toBe(true);
    expect(plan.confidence).toBe("high");
  });

  it("flags fallback assumptions and capacity conflicts", () => {
    const plan = buildReverseRevenuePlan({ targetCollectedRevenueCents: 2_000_000, availableJobCapacity: 2, currentCommittedJobs: 2 });
    expect(plan.confidence).toBe("low");
    expect(plan.capacity.feasible).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes("fallback"))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes("capacity"))).toBe(true);
  });
});
