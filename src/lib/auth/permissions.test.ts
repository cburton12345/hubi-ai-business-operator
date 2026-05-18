import { describe, expect, it } from "vitest";
import { can, canReviewRisk, describeTenantRole, type AccessActor } from "@/lib/auth/permissions";

const baseActor: AccessActor = {
  userId: "user-1",
  email: "owner@example.com",
  platformRole: "user"
};

describe("permissions", () => {
  it("lets tenant owners manage tenant and high-risk approvals", () => {
    const actor = { ...baseActor, tenantRole: "owner" as const };

    expect(can(actor, "tenant:manage")).toBe(true);
    expect(canReviewRisk(actor, "high")).toBe(true);
  });

  it("keeps operators away from high-risk approvals", () => {
    const actor = { ...baseActor, tenantRole: "operator" as const };

    expect(can(actor, "lead:manage")).toBe(true);
    expect(canReviewRisk(actor, "low")).toBe(true);
    expect(canReviewRisk(actor, "medium")).toBe(false);
    expect(canReviewRisk(actor, "high")).toBe(false);
  });

  it("gives platform super admins platform management", () => {
    const actor = { ...baseActor, platformRole: "super_admin" as const };

    expect(can(actor, "platform:manage")).toBe(true);
    expect(canReviewRisk(actor, "high")).toBe(true);
  });

  it("documents every tenant role", () => {
    expect(describeTenantRole("viewer")).toContain("Read-only");
  });
});
