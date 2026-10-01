import { describe, expect, it } from "vitest";
import { assessAdvertisingSetup, proposeCrossChannelAllocation } from "./paid-media-orchestrator";

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
});
