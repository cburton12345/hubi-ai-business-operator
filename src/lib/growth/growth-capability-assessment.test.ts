import { describe, expect, it } from "vitest";
import { buildGrowthCapabilityAssessment } from "./ai-growth-department";

describe("growth capability assessment", () => {
  it("rates the complete business loop instead of counting tools", () => {
    const result = buildGrowthCapabilityAssessment({ brands: 1, services: 2, locations: 1, forms: 1, leads: 5, followUps: 3, reviews: 1, proof: 2, contentOutputs: 5, publishing: 2, estimates: 2, jobs: 1, invoices: 1, payments: 1, attribution: 3, memory: 4 });
    expect(result.score).toBe(100);
    expect(result.stages.every((stage) => stage.status === "ready")).toBe(true);
  });

  it("identifies the actual missing stages", () => {
    const result = buildGrowthCapabilityAssessment({ brands: 1, services: 1, locations: 0, forms: 0, leads: 0, followUps: 0, reviews: 0, proof: 0, contentOutputs: 0, publishing: 0, estimates: 0, jobs: 0, invoices: 0, payments: 0, attribution: 0, memory: 0 });
    expect(result.stages.find((stage) => stage.key === "foundation")?.status).toBe("partial");
    expect(result.stages.find((stage) => stage.key === "capture")?.status).toBe("missing");
    expect(result.score).toBeLessThan(20);
  });
});
