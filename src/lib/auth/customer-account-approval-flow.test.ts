import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("customer request approval and account recovery", () => {
  it("provisions a customer workspace instead of inviting the requester into the approver workspace", () => {
    const actions = source("src/app/app/access-requests/actions.ts");
    expect(actions).not.toContain("getCurrentWorkspaceId");
    expect(actions).toContain("insert into public.tenants");
    expect(actions).toContain("account_type,status,billing_status,plan_key,onboarding_status");
    expect(actions).toContain("Approve");
    expect(actions).toContain("Username: ${request.email}");
    expect(actions).toContain('new URL("/reset-password"');
  });

  it("lets an invited customer create and confirm a private password", () => {
    const invitePage = source("src/app/invite/[token]/page.tsx");
    const inviteAction = source("src/app/invite/[token]/actions.ts");
    expect(invitePage).toContain("will be your username");
    expect(invitePage).toContain('name="confirmPassword"');
    expect(inviteAction).toContain("value.password === value.confirmPassword");
    expect(inviteAction).toContain("hashPassword(parsed.data.password)");
    expect(inviteAction).toContain('/app/ferocity?onboarding=1');
  });

  it("keeps normal sign-in and forgot-password recovery visible", () => {
    const loginPage = source("src/app/login/page.tsx");
    const resetPage = source("src/app/reset-password/page.tsx");
    expect(loginPage).toContain('href="/reset-password"');
    expect(loginPage).toContain("Forgot password?");
    expect(resetPage).toContain("send a secure reset link");
  });
});
