import { describe, expect, it } from "vitest";
import { publicLeadSchema } from "@/lib/leads/schemas";

describe("publicLeadSchema", () => {
  it("accepts a valid lead capture payload", () => {
    const result = publicLeadSchema.safeParse({
      formPublicKey: "internal-ferocity-primary-lead-form",
      name: "Test Lead",
      email: "lead@example.com",
      leadType: "case_intake",
      consentToContact: true,
      details: {
        legalDisclaimerAcknowledged: true
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = publicLeadSchema.safeParse({
      formPublicKey: "internal-ferocity-primary-lead-form",
      email: "not-an-email"
    });

    expect(result.success).toBe(false);
  });

  it("accepts marketplace bidder and consignor lead types", () => {
    const bidder = publicLeadSchema.safeParse({
      formPublicKey: "marketplace-primary-lead-form",
      leadType: "bidder",
      phone: "555-0101"
    });
    const consignor = publicLeadSchema.safeParse({
      formPublicKey: "marketplace-primary-lead-form",
      leadType: "consignor",
      email: "seller@example.com"
    });

    expect(bidder.success).toBe(true);
    expect(consignor.success).toBe(true);
  });
});
