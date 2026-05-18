import { describe, expect, it } from "vitest";
import { publicLeadSchema } from "@/lib/leads/schemas";
import { evaluateLeadSubmission } from "@/lib/leads/spam-guard";

function lead(overrides: Record<string, unknown> = {}) {
  const parsed = publicLeadSchema.parse({
    formPublicKey: "internal-ferocity-primary-lead-form",
    email: "test@example.com",
    leadType: "general",
    consentToContact: true,
    details: {},
    ...overrides
  });

  return parsed;
}

describe("lead spam guard", () => {
  it("rejects honeypot submissions", () => {
    const result = evaluateLeadSubmission(lead({ website: "bot-site" }), {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("requires contact information", () => {
    const result = evaluateLeadSubmission(lead({ email: undefined, phone: undefined }), {});

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Either email or phone");
  });

  it("requires consent and disclaimer acknowledgement for legal intake", () => {
    const result = evaluateLeadSubmission(
      lead({
        leadType: "case_intake",
        consentToContact: false,
        details: {
          legalDisclaimerAcknowledged: false
        }
      }),
      {}
    );

    expect(result.ok).toBe(false);
  });

  it("allows tracked, consented legal intake", () => {
    const result = evaluateLeadSubmission(
      lead({
        leadType: "case_intake",
        consentToContact: true,
        details: {
          legalDisclaimerAcknowledged: true
        },
        utm: {
          source: "google",
          medium: "cpc",
          campaign: "ferocity-intake"
        }
      }),
      {}
    );

    expect(result.ok).toBe(true);
  });
});
