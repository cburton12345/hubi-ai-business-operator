import { describe, expect, it } from "vitest";
import { createConstructionFieldLogFallback, normalizeConstructionFieldLogDraft } from "./field-log";
import { assessConstructionJobHealth, type ConstructionJobHealthInput } from "./job-health";

function job(overrides: Partial<ConstructionJobHealthInput> = {}): ConstructionJobHealthInput {
  return {
    id: "job-1",
    title: "Oak Street remodel",
    customerName: "Taylor",
    status: "in_progress",
    scheduledStart: null,
    scheduledEnd: null,
    estimateId: "estimate-1",
    estimateTotalCents: 100_000,
    approvedChangeCents: 0,
    pendingChangeCount: 0,
    expenseCents: 20_000,
    materialActualCents: 0,
    materialLogCents: 0,
    peoplePaidCents: 10_000,
    invoiceTotalCents: 100_000,
    invoicePaidCents: 50_000,
    overdueInvoiceCount: 0,
    unreviewedExpenseCount: 0,
    blockingWarningCount: 0,
    openWarningCount: 0,
    blockedAssignmentCount: 0,
    missedAssignmentCount: 0,
    overduePurchaseOrderCount: 0,
    committedPurchaseOrderCents: 0,
    recentDailyFlags: [],
    ...overrides
  };
}

describe("construction job health", () => {
  it("keeps a job on track when connected records show no warning", () => {
    const result = assessConstructionJobHealth(job());
    expect(result.healthStatus).toBe("on_track");
    expect(result.risks).toHaveLength(0);
  });

  it("identifies high money exposure and overdue customer money", () => {
    const result = assessConstructionJobHealth(job({
      expenseCents: 80_000,
      peoplePaidCents: 10_000,
      overdueInvoiceCount: 1,
      invoicePaidCents: 20_000
    }));
    expect(result.healthStatus).toBe("money_risk");
    expect(result.risks.map((risk) => risk.key)).toEqual(expect.arrayContaining(["cost_exposure", "overdue_money"]));
  });

  it("identifies blocked and past-due work as a schedule risk", () => {
    const result = assessConstructionJobHealth(job({
      scheduledEnd: "2020-01-01",
      blockedAssignmentCount: 1
    }));
    expect(result.healthStatus).toBe("schedule_risk");
    expect(result.risks.map((risk) => risk.key)).toEqual(expect.arrayContaining(["field_work_blocked", "past_scheduled_end"]));
  });

  it("identifies an overdue purchase order as procurement risk", () => {
    const result = assessConstructionJobHealth(job({
      overduePurchaseOrderCount: 1,
      committedPurchaseOrderCents: 15_000
    }));
    expect(result.healthStatus).toBe("procurement_risk");
  });

  it("prioritizes a reported safety issue", () => {
    const result = assessConstructionJobHealth(job({
      recentDailyFlags: [{
        category: "safety",
        severity: "critical",
        title: "Possible injury",
        detail: "A field note mentions an injury."
      }]
    }));
    expect(result.healthStatus).toBe("safety_risk");
    expect(result.severity).toBe("critical");
  });

  it("uses the largest material basis instead of adding duplicate cost feeds", () => {
    const result = assessConstructionJobHealth(job({
      expenseCents: 30_000,
      materialActualCents: 25_000,
      materialLogCents: 20_000,
      peoplePaidCents: 10_000
    }));
    expect(result.trackedCostCents).toBe(40_000);
  });

  it("provides evidence for every warning", () => {
    const result = assessConstructionJobHealth(job({
      pendingChangeCount: 1,
      unreviewedExpenseCount: 2,
      overduePurchaseOrderCount: 1
    }));
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.risks.every((risk) => risk.evidence.length > 0)).toBe(true);
  });
});

describe("construction field-note preparation", () => {
  it("flags safety, schedule, procurement, and trade conflict terms without AI", () => {
    const draft = createConstructionFieldLogFallback(
      "Delivery was late, room 214 has a plumbing conflict, and the crew reported an unsafe opening."
    );
    expect(draft.riskFlags.map((flag) => flag.category)).toEqual(
      expect.arrayContaining(["safety", "schedule", "procurement", "information"])
    );
    expect(draft.confidence).toBe("low");
  });

  it("preserves deterministic safety flags when an AI response omits them", () => {
    const fallback = createConstructionFieldLogFallback("A worker reported an injury near the stair opening.");
    const normalized = normalizeConstructionFieldLogDraft({
      summary: "An incident was reported.",
      riskFlags: []
    }, fallback);
    expect(normalized.riskFlags.some((flag) => flag.category === "safety")).toBe(true);
  });
});
