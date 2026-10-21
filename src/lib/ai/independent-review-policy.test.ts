import { describe, expect, it } from "vitest";
import { independentReviewRequirements } from "./independent-review-policy";

describe("independent AI review policy", () => {
  it("requires a second model and a person for critical work", () => {
    expect(independentReviewRequirements("tax")).toEqual({
      tier: "critical", deterministicChecksRequired: true, independentModelRequired: true,
      humanApprovalRequired: true, externalExecutionBlockedOnDisagreement: true,
    });
  });

  it("keeps routine work on the efficient lane", () => {
    expect(independentReviewRequirements("routine").independentModelRequired).toBe(false);
  });
});
