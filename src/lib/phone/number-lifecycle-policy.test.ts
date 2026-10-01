import { describe, expect, it } from "vitest";
import { decideManagedNumberLifecycle, planIncludesManagedNumber } from "./number-lifecycle-policy";

const now = new Date("2026-09-07T12:00:00.000Z");
const base = {
  connectionPath: "new_ferocity_number",
  provisioningApproved: true,
  subscriptionStatus: "active",
  numberStatus: null,
  hasManagedNumber: false,
  portOutRequested: false,
  now
};

describe("managed phone-number lifecycle policy", () => {
  it("limits included managed numbers to voice-capable paid plans", () => {
    expect(["calls", "starter", "growth", "operator"].every(planIncludesManagedNumber)).toBe(true);
    expect(["earn", "ferocity_connect", "job_tracker", null].some(planIncludesManagedNumber)).toBe(false);
  });

  it("does not buy a number merely because a workspace exists", () => {
    expect(decideManagedNumberLifecycle({ ...base, provisioningApproved: false }).action).toBe("none");
  });

  it("provisions after explicit managed calling activation", () => {
    expect(decideManagedNumberLifecycle(base).action).toBe("provision");
  });

  it("keeps full service during the seven-day payment recovery period", () => {
    expect(decideManagedNumberLifecycle({
      ...base, subscriptionStatus: "past_due", hasManagedNumber: true, numberStatus: "active",
      billingPastDueSince: "2026-09-03T12:00:00.000Z"
    }).action).toBe("none");
  });

  it("restricts service without releasing the number after grace", () => {
    const decision = decideManagedNumberLifecycle({
      ...base, subscriptionStatus: "past_due", hasManagedNumber: true, numberStatus: "active",
      billingPastDueSince: "2026-08-28T12:00:00.000Z"
    });
    expect(decision.action).toBe("restrict");
    expect(decision.retainUntil).toBe("2026-09-27T12:00:00.000Z");
  });

  it("restores a retained number when billing recovers", () => {
    expect(decideManagedNumberLifecycle({ ...base, hasManagedNumber: true, numberStatus: "paused" }).action).toBe("restore");
  });

  it("never automatically releases a number with a port-out request", () => {
    expect(decideManagedNumberLifecycle({
      ...base, subscriptionStatus: "cancelled", hasManagedNumber: true, numberStatus: "paused",
      retentionStartedAt: "2026-07-01T00:00:00.000Z", portOutRequested: true
    }).action).toBe("hold_for_port_out");
  });

  it("releases only after the thirty-day retention window", () => {
    expect(decideManagedNumberLifecycle({
      ...base, subscriptionStatus: "cancelled", hasManagedNumber: true, numberStatus: "paused",
      retentionStartedAt: "2026-07-01T00:00:00.000Z"
    }).action).toBe("release");
  });
});
