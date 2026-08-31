import { describe, expect, it } from "vitest";
import { supportGuidanceFor } from "./self-service";

describe("supportGuidanceFor", () => {
  it("offers safe self-service for routine access issues", () => {
    const result = supportGuidanceFor({ issueType: "account", description: "I forgot my password" });
    expect(result.key).toBe("account_access");
    expect(result.escalationRequired).toBe(false);
    expect(result.steps.join(" ")).toContain("reset-password");
  });

  it("requires review for security and billing disputes", () => {
    expect(supportGuidanceFor({ issueType: "technical", description: "My account was hacked" }).escalationRequired).toBe(true);
    expect(supportGuidanceFor({ issueType: "billing", description: "I was charged twice and want a refund" }).key).toBe("billing_dispute_review");
  });
});
