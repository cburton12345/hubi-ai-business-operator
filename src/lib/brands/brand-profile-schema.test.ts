import { describe, expect, it } from "vitest";
import { brandProfileUpdateSchema, emptyToNull } from "@/lib/brands/brand-profile-schema";

describe("brand profile schema", () => {
  it("accepts Phase 1 editable brand and marketing fields", () => {
    const parsed = brandProfileUpdateSchema.parse({
      brandId: "22222222-2222-4222-8222-222222222206",
      name: "Ferocity",
      domain: "",
      phone: "",
      email: "",
      logoUrl: "",
      industry: "Personal injury lead generation",
      vertical: "personal_injury",
      description: "Legal-sensitive lead generation brand.",
      primaryGoal: "Generate qualified leads.",
      primaryLocation: "",
      riskProfile: "legal_sensitive",
      status: "active",
      targetCustomers: "People seeking personal injury information.",
      ctaGoals: "Request a case review intake.",
      adGoals: "Recommend only.",
      seoTargets: "Draft recommendations only.",
      reviewStrategy: "Do not auto-send.",
      followUpStrategy: "Draft only.",
      toneOfVoice: "Careful and compliant.",
      approvalMode: "manual"
    });

    expect(parsed.riskProfile).toBe("legal_sensitive");
    expect(parsed.approvalMode).toBe("manual");
  });

  it("normalizes empty optional values for storage", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("   ")).toBeNull();
    expect(emptyToNull("marketplacepro.live")).toBe("marketplacepro.live");
  });
});
