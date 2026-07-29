import { describe, expect, it } from "vitest";
import { fieldLogNeedsReview, liveActionPolicyForMode } from "./autonomy-policy";

describe("Ferocity autonomy policy", () => {
  it("honors an owner's automatic setting for normal live actions", () => {
    expect(liveActionPolicyForMode("email_send", "enabled")).toMatchObject({
      status: "live",
      requiresHumanApproval: false
    });
  });

  it("keeps billing authority protected even when a broad service is enabled", () => {
    expect(liveActionPolicyForMode("billing_sync", "enabled")).toMatchObject({
      status: "approval_required",
      requiresHumanApproval: true
    });
  });

  it("keeps provider and public actions behind review when selected", () => {
    expect(liveActionPolicyForMode("publish_content", "review_required")).toMatchObject({
      status: "approval_required",
      requiresHumanApproval: true
    });
  });

  it("auto-files routine field logs but escalates consequential risks", () => {
    expect(fieldLogNeedsReview("enabled", [{ category: "schedule", severity: "medium" }])).toBe(false);
    expect(fieldLogNeedsReview("enabled", [{ category: "safety", severity: "medium" }])).toBe(true);
    expect(fieldLogNeedsReview("enabled", [{ category: "information", severity: "high" }])).toBe(true);
    expect(fieldLogNeedsReview("review_required", [])).toBe(true);
  });
});
