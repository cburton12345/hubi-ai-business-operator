import { describe, expect, it } from "vitest";
import { getOwnerChatCapabilities } from "@/lib/ferocity/owner-chat-access";
import type { AccessActor } from "@/lib/auth/permissions";

const actor = (tenantRole: AccessActor["tenantRole"]): AccessActor => ({
  userId: "user-1",
  email: "user@example.com",
  platformRole: "user",
  tenantRole,
});

describe("owner chat access", () => {
  it("keeps viewers out of the owner operating surface", () => {
    const capabilities = getOwnerChatCapabilities(actor("viewer"));
    expect(capabilities.canOpenOwnerChat).toBe(false);
    expect(capabilities.canConfigureOnboarding).toBe(false);
    expect(capabilities.canControlGoals).toBe(false);
    expect(capabilities.canReviewApproval("low")).toBe(false);
  });

  it("lets operators work without granting tenant setup or goal control", () => {
    const capabilities = getOwnerChatCapabilities(actor("operator"));
    expect(capabilities.canOpenOwnerChat).toBe(true);
    expect(capabilities.canConfigureOnboarding).toBe(false);
    expect(capabilities.canControlGoals).toBe(false);
    expect(capabilities.canReviewApproval("low")).toBe(true);
    expect(capabilities.canReviewApproval("medium")).toBe(false);
  });

  it("gives owners and admins setup, controls, and their authorized approvals", () => {
    for (const role of ["owner", "admin"] as const) {
      const capabilities = getOwnerChatCapabilities(actor(role));
      expect(capabilities.canOpenOwnerChat).toBe(true);
      expect(capabilities.canConfigureOnboarding).toBe(true);
      expect(capabilities.canControlGoals).toBe(true);
      expect(capabilities.canReviewApproval("high")).toBe(true);
    }
  });

  it("rejects malformed risk values instead of treating them as low risk", () => {
    expect(getOwnerChatCapabilities(actor("owner")).canReviewApproval("unknown")).toBe(false);
  });
});
