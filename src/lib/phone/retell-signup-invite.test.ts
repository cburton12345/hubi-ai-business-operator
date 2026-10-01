import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { processRetellSignupInviteTool } from "./retell-signup-invite";

function body(args: Record<string, unknown>) {
  return JSON.stringify({
    name: "create_ferocity_signup",
    call: {
      call_id: "call_signup_123",
      agent_id: "agent_ferocity",
      to_number: "+17154404288"
    },
    args
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    resolveTenant: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
    resolveApiKey: vi.fn().mockResolvedValue("retell-api-key"),
    verifySignature: vi.fn().mockReturnValue(true),
    submit: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe("secure Retell signup invitations", () => {
  it("creates an invitation only after explicit consent and confirmed identity fields", async () => {
    const deps = dependencies();
    const result = await processRetellSignupInviteTool(
      body({
        full_name: "Interested Owner",
        company_name: "Interested Business",
        email: "owner@example.com",
        business_type: "Landscaping",
        consent_to_create_account: true
      }),
      "valid-signature",
      deps
    );

    expect(result).toMatchObject({ ok: true, status: "invite_sent" });
    expect(deps.submit).toHaveBeenCalledWith({
      name: "Interested Owner",
      companyName: "Interested Business",
      email: "owner@example.com",
      businessType: "Landscaping",
      phone: "+17154404288"
    });
    expect(result.message).toContain("choose their password privately");
  });

  it("refuses missing consent, invalid email, or an unauthenticated tool call", async () => {
    const noConsent = dependencies();
    const consentResult = await processRetellSignupInviteTool(
      body({ full_name: "Owner", company_name: "Business", email: "owner@example.com" }),
      "valid-signature",
      noConsent
    );
    expect(consentResult.ok).toBe(false);
    expect(noConsent.submit).not.toHaveBeenCalled();

    const invalidEmail = dependencies();
    const emailResult = await processRetellSignupInviteTool(
      body({ full_name: "Owner", company_name: "Business", email: "not-an-email", consent_to_create_account: true }),
      "valid-signature",
      invalidEmail
    );
    expect(emailResult.ok).toBe(false);
    expect(invalidEmail.submit).not.toHaveBeenCalled();

    const unauthenticated = dependencies({ verifySignature: vi.fn().mockReturnValue(false) });
    const authResult = await processRetellSignupInviteTool(
      body({ full_name: "Owner", company_name: "Business", email: "owner@example.com", consent_to_create_account: true }),
      "bad-signature",
      unauthenticated
    );
    expect(authResult.ok).toBe(false);
    expect(unauthenticated.submit).not.toHaveBeenCalled();
  });

  it("keeps phone signup and public Earn signup wired to secure invitations", () => {
    const retellConfig = fs.readFileSync(path.join(process.cwd(), "scripts", "configure-ferocity-retell-owner.mjs"), "utf8");
    const accessRoute = fs.readFileSync(path.join(process.cwd(), "src", "app", "api", "access-requests", "route.ts"), "utf8");

    expect(retellConfig).toContain("create_ferocity_signup");
    expect(retellConfig).toContain("Never ask the person to say or choose a password");
    expect(retellConfig).toContain("consent_to_create_account");
    expect(accessRoute).toContain('parsed.data.requestedPlan === "earn"');
    expect(accessRoute).toContain('insert into public.workspace_invites');
    expect(accessRoute).toContain("explicitAgreementAcceptanceRequiredAfterSecureLogin");
  });
});
