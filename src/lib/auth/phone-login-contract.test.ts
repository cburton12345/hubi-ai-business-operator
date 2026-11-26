import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("phone or email workspace sign-in contract", () => {
  it("resolves only one active worker identity and still requires the account password", async () => {
    const actions = await readFile(new URL("../../app/login/actions.ts", import.meta.url), "utf8");
    expect(actions).toContain("regexp_replace(coalesce(worker.phone, ''), '[^0-9]', '', 'g') = any($1::text[])");
    expect(actions).toContain("where (select count(*) from phone_candidates) = 1");
    expect(actions).toContain("membership.status = 'active'");
    expect(actions).toContain("tenant.status in ('active', 'trial')");
    expect(actions).toContain("signInWithSupabasePassword(resolvedEmail, parsed.data.password)");
    expect(actions).toContain("verifyPassword({");
  });

  it("keeps one neutral credential error and trusted-device continuity", async () => {
    const page = await readFile(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
    const actions = await readFile(new URL("../../app/login/actions.ts", import.meta.url), "utf8");
    expect(page).toContain('name="identifier"');
    expect(page).toContain('autoComplete="username"');
    expect(page).toContain("Invalid email, phone, or password.");
    expect(actions).toContain("workspace-password-login");
    expect(actions).toContain("now() + interval '90 days'");
    expect(actions).not.toContain("phoneCandidates[0]");
  });
});
