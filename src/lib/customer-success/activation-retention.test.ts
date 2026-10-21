import { describe, expect, it } from "vitest";

import { decideCustomerSuccessLifecycle } from "./activation-retention-decision";

describe("decideCustomerSuccessLifecycle", () => {
  it("flags a paid workspace that has not reached first value", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: false, daysSinceSignup: 4, daysSinceActivity: 4,
      hasBusinessProfile: true, connectedSystems: 0, ferocityCommands: 0, operationalRecords: 0, verifiedResults: 0
    });
    expect(result.stage).toBe("at_risk");
    expect(result.firstValueReached).toBe(false);
    expect(result.nextBestAction).toContain("first useful business outcome");
  });

  it("recognizes a retained workspace from real activity and business records", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: true, daysSinceSignup: 45, daysSinceActivity: 1,
      hasBusinessProfile: true, connectedSystems: 2, ferocityCommands: 12, operationalRecords: 8, verifiedResults: 3
    });
    expect(result.stage).toBe("retained");
    expect(result.activationScore).toBe(100);
    expect(result.healthScore).toBe(100);
  });

  it("does not confuse a conversation with a useful result", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: false, daysSinceSignup: 2, daysSinceActivity: 0,
      hasBusinessProfile: true, connectedSystems: 1, ferocityCommands: 4, operationalRecords: 0, verifiedResults: 0
    });
    expect(result.firstValueReached).toBe(false);
    expect(result.stage).toBe("at_risk");
  });

  it("does not treat unverified records or incomplete document work as first value", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: true, daysSinceSignup: 3, daysSinceActivity: 0,
      hasBusinessProfile: true, connectedSystems: 1, ferocityCommands: 2, operationalRecords: 14, verifiedResults: 0
    });
    expect(result.firstValueReached).toBe(false);
    expect(result.stage).toBe("at_risk");
    expect(result.riskReasons).toContain("The workspace has not reached a measurable first useful result.");
  });

  it("routes a past-due customer to billing recovery immediately", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "past_due", onboardingComplete: true, daysSinceSignup: 45, daysSinceActivity: 1,
      hasBusinessProfile: true, connectedSystems: 2, ferocityCommands: 12, operationalRecords: 8, verifiedResults: 3
    });
    expect(result.stage).toBe("at_risk");
    expect(result.riskReasons).toContain("The subscription needs billing attention.");
    expect(result.nextBestAction).toContain("Open Billing");
  });
});
