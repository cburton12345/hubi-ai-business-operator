import { describe, expect, it } from "vitest";
import { assessAdaptiveChannel, assessAdvertisingSetup, buildIncrementalSpendCheckpoints, proposeCrossChannelAllocation } from "./paid-media-orchestrator";

describe("advertising setup assistant", () => {
  it("does not confuse an existing Reddit account with API readiness", () => {
    const result = assessAdvertisingSetup({
      providerKey: "reddit_ads", accountFound: true, authorization: "missing", apiApproved: false,
      businessVerification: "not_required", billingReady: false, trackingReady: false,
      initialSync: "not_started", liveActionsEnabled: false
    });
    expect(result.state).toBe("waiting_for_platform");
    expect(result.canRead).toBe(false);
    expect(result.canLaunch).toBe(false);
    expect(result.steps.map((step) => step.key)).toEqual(expect.arrayContaining(["api_approval", "authorization", "tracking", "billing"]));
  });

  it("keeps launch blocked when a connected account has no live-action authority", () => {
    const result = assessAdvertisingSetup({
      providerKey: "google_ads", accountFound: true, authorization: "connected", apiApproved: true,
      businessVerification: "verified", billingReady: true, trackingReady: true,
      initialSync: "complete", liveActionsEnabled: false
    });
    expect(result.state).toBe("ready");
    expect(result.canRead).toBe(true);
    expect(result.canWriteDrafts).toBe(true);
    expect(result.canLaunch).toBe(false);
  });

  it("marks an expired authorization explicitly", () => {
    const result = assessAdvertisingSetup({
      providerKey: "meta_ads", accountFound: true, authorization: "expired", apiApproved: true,
      businessVerification: "verified", billingReady: true, trackingReady: true,
      initialSync: "complete", liveActionsEnabled: false
    });
    expect(result.state).toBe("authorization_expired");
  });
});

describe("cross-channel allocation", () => {
  it("uses downstream outcomes rather than platform ROAS alone", () => {
    const plan = proposeCrossChannelAllocation({
      monthlyBudgetCents: 300_000,
      evidence: [
        { providerKey: "google_ads", spendCents: 100_000, leads: 30, qualifiedLeads: 15, bookedAppointments: 10, soldJobs: 5, revenueCents: 1_000_000, grossProfitCents: 400_000, attributionConfidence: 0.9, sampleDays: 30, capacityFit: 1, eligible: true },
        { providerKey: "meta_ads", spendCents: 50_000, leads: 100, qualifiedLeads: 8, bookedAppointments: 3, soldJobs: 1, revenueCents: 150_000, grossProfitCents: 40_000, attributionConfidence: 0.8, sampleDays: 30, capacityFit: 1, eligible: true }
      ]
    });
    expect(plan[0].providerKey).toBe("google_ads");
    expect(plan.reduce((sum, item) => sum + item.proposedBudgetCents, 0)).toBe(300_000);
    expect(plan.every((item) => item.requiresApproval)).toBe(true);
  });

  it("excludes weak attribution and capacity mismatches", () => {
    const plan = proposeCrossChannelAllocation({
      monthlyBudgetCents: 100_000,
      evidence: [
        { providerKey: "tiktok_ads", spendCents: 20_000, leads: 50, qualifiedLeads: 10, bookedAppointments: 4, soldJobs: 2, revenueCents: 200_000, attributionConfidence: 0.3, sampleDays: 30, capacityFit: 1, eligible: true },
        { providerKey: "microsoft_ads", spendCents: 20_000, leads: 10, qualifiedLeads: 5, bookedAppointments: 2, soldJobs: 1, revenueCents: 100_000, attributionConfidence: 0.8, sampleDays: 30, capacityFit: 0, eligible: true }
      ]
    });
    expect(plan).toEqual([]);
  });

  it("reconciles every approved cent even when learning floors apply", () => {
    const plan = proposeCrossChannelAllocation({
      monthlyBudgetCents: 100_003,
      minimumLearningBudgetCents: 10_000,
      evidence: [
        { providerKey: "google_ads", spendCents: 10_000, leads: 8, qualifiedLeads: 4, bookedAppointments: 2, soldJobs: 1, revenueCents: 80_000, grossProfitCents: 40_000, attributionConfidence: 0.8, sampleDays: 20, capacityFit: 1, eligible: true },
        { providerKey: "meta_ads", spendCents: 10_000, leads: 6, qualifiedLeads: 3, bookedAppointments: 1, soldJobs: 1, revenueCents: 50_000, grossProfitCents: 20_000, attributionConfidence: 0.8, sampleDays: 20, capacityFit: 1, eligible: true },
        { providerKey: "microsoft_ads", spendCents: 10_000, leads: 4, qualifiedLeads: 2, bookedAppointments: 1, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, attributionConfidence: 0.8, sampleDays: 20, capacityFit: 1, eligible: true }
      ]
    });
    expect(plan.reduce((sum, item) => sum + item.proposedBudgetCents, 0)).toBe(100_003);
    expect(plan.every((item) => item.proposedBudgetCents >= 10_000)).toBe(true);
  });
});

describe("adaptive channel evidence", () => {
  const current = { providerKey: "google_ads" as const, spendCents: 100_000, leads: 30, qualifiedLeads: 15, bookedAppointments: 8, soldJobs: 5, revenueCents: 800_000, grossProfitCents: 300_000, attributionConfidence: 0.9, sampleDays: 30, capacityFit: 1, eligible: true };

  it("treats mature source-to-cash results as proven rather than relying on clicks", () => {
    const result = assessAdaptiveChannel({ current });
    expect(result.state).toBe("proven");
    expect(result.action).toBe("scale_candidate");
    expect(result.grossProfitReturn).toBe(3);
  });

  it("detects when a previously effective channel is no longer working now", () => {
    const result = assessAdaptiveChannel({
      current: { ...current, grossProfitCents: 150_000 },
      previous: { ...current, grossProfitCents: 300_000 }
    });
    expect(result.state).toBe("declining");
    expect(result.action).toBe("constrain");
    expect(result.trendPercent).toBe(-50);
  });

  it("fails closed when paid spend lacks profit measurement", () => {
    const result = assessAdaptiveChannel({ current: { ...current, grossProfitCents: undefined } });
    expect(result.action).toBe("repair_measurement");
  });

  it("does not call an untested paid channel proven because it has imported outcomes", () => {
    const result = assessAdaptiveChannel({ current: { ...current, spendCents: 0 } });
    expect(result.state).toBe("hypothesis");
    expect(result.action).toBe("test_carefully");
  });

  it("constrains spend that consumes more gross profit than it produces", () => {
    const result = assessAdaptiveChannel({ current: { ...current, grossProfitCents: 80_000 } });
    expect(result.action).toBe("constrain");
  });
});

describe("incremental campaign spend", () => {
  it("observes each crossed five-dollar boundary available from provider snapshots", () => {
    const checkpoints = buildIncrementalSpendCheckpoints({ observations: [
      { observedAt: "2026-10-01T00:00:00Z", spendCents: 300, qualifiedLeads: 0, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, attributionConfidence: 0.9 },
      { observedAt: "2026-10-02T00:00:00Z", spendCents: 800, qualifiedLeads: 1, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, attributionConfidence: 0.9 }
    ] });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({ cumulativeSpendCents: 1100, crossedMilestones: 2, milestoneCents: 1000, action: "observe" });
  });

  it("does not call five dollars a winner but can enforce a later stop loss", () => {
    const checkpoints = buildIncrementalSpendCheckpoints({ observations: [
      { observedAt: "2026-10-01T00:00:00Z", spendCents: 500, qualifiedLeads: 0, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, attributionConfidence: 0.9 },
      { observedAt: "2026-10-02T00:00:00Z", spendCents: 2000, qualifiedLeads: 0, soldJobs: 0, revenueCents: 0, grossProfitCents: 0, attributionConfidence: 0.9 }
    ] });
    expect(checkpoints[0].action).toBe("observe");
    expect(checkpoints[1].action).toBe("stop_loss");
  });
});
