import { describe, expect, it } from "vitest";

import { decideCustomerSuccessLifecycle } from "./activation-retention-decision";

describe("decideCustomerSuccessLifecycle", () => {
  it("flags a paid workspace that has not reached first value", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: false, daysSinceSignup: 4, daysSinceActivity: 4,
      hasBusinessProfile: true, connectedSystems: 0, ferocityCommands: 0, operationalRecords: 0
    });
    expect(result.stage).toBe("at_risk");
    expect(result.firstValueReached).toBe(false);
    expect(result.nextBestAction).toContain("first useful business outcome");
  });

  it("recognizes a retained workspace from real activity and business records", () => {
    const result = decideCustomerSuccessLifecycle({
      billingStatus: "active", onboardingComplete: true, daysSinceSignup: 45, daysSinceActivity: 1,
      hasBusinessProfile: true, connectedSystems: 2, ferocityCommands: 12, operationalRecords: 8
    });
    expect(result.stage).toBe("retained");
    expect(result.activationScore).toBe(100);
    expect(result.healthScore).toBe(100);
  });
});
