import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { can, type AccessActor } from "@/lib/auth/permissions";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("customer onboarding authorization", () => {
  it("lets owners and admins connect providers but not operators or viewers", () => {
    const actor = (tenantRole: AccessActor["tenantRole"]): AccessActor => ({
      userId: "user-1",
      email: "person@example.com",
      platformRole: "user",
      tenantRole,
    });
    expect(can(actor("owner"), "tenant:manage")).toBe(true);
    expect(can(actor("admin"), "tenant:manage")).toBe(true);
    expect(can(actor("operator"), "tenant:manage")).toBe(false);
    expect(can(actor("viewer"), "tenant:manage")).toBe(false);
  });

  it("protects OAuth start, callback, calendar setup, and mailbox sync with tenant management", () => {
    for (const path of [
      "src/app/api/integrations/[provider]/oauth/start/route.ts",
      "src/lib/integrations/complete-standard-oauth.ts",
      "src/app/app/integrations/calendar/actions.ts",
      "src/app/app/email-watch/actions.ts",
    ]) {
      expect(read(path), path).toContain('requirePermission("tenant:manage")');
    }
  });

  it("keeps internal workspace provisioning restricted to platform administrators", () => {
    expect(read("src/app/app/onboarding/page.tsx")).toContain('requirePermission("platform:manage")');
    expect(read("src/app/app/onboarding/actions.ts")).toContain('requirePermission("platform:manage")');
  });
});
