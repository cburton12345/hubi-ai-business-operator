import { describe, expect, it } from "vitest";
import { buildBrandPromptContext, buildWeeklyAiTaskPlans, getWeeklyPeriodKey } from "@/lib/ai/prompt-context";

const tenant = {
  id: "tenant-1",
  name: "Internal Portfolio",
  slug: "internal-portfolio",
  accountType: "internal",
  planKey: "internal"
};

const brand = {
  id: "brand-1",
  tenantId: "tenant-1",
  name: "Ferocity",
  slug: "ferocity",
  domain: null,
  phone: null,
  email: null,
  businessModel: "lead_generation" as const,
  industry: "Personal injury lead generation",
  vertical: "personal_injury",
  description: "Legal-sensitive intake brand.",
  primaryGoal: "Generate consent-based personal injury leads.",
  primaryLocation: null,
  riskProfile: "legal_sensitive" as const
};

describe("AI prompt context", () => {
  it("builds a review-required, draft-only context for legal-sensitive brands", () => {
    const context = buildBrandPromptContext({
      tenant,
      brand,
      generatedAt: "2026-05-18T00:00:00.000Z",
      marketing: {
        approvalMode: "manual",
        toneOfVoice: "Clear, careful, compliant, and empathetic."
      }
    });

    expect(context.schemaVersion).toBe("phase2.brand_prompt_context.v1");
    expect(context.safety.requiresHumanReview).toBe(true);
    expect(context.safety.publicPublishingAllowed).toBe(false);
    expect(context.phaseScope.draftOnly).toBe(true);
    expect(context.phaseScope.canChangeBudgets).toBe(false);
  });

  it("creates the weekly task set with period metadata", () => {
    const context = buildBrandPromptContext({ tenant, brand, generatedAt: "2026-05-18T00:00:00.000Z" });
    const tasks = buildWeeklyAiTaskPlans(context, "2026-W21");

    expect(tasks.map((task) => task.type)).toEqual([
      "weekly_plan",
      "content_draft",
      "seo_recommendation",
      "campaign_recommendation"
    ]);
    expect(tasks.every((task) => task.promptContext.workflow.periodKey === "2026-W21")).toBe(true);
    expect(tasks.every((task) => task.priority === 20)).toBe(true);
  });

  it("uses ISO-style week keys", () => {
    expect(getWeeklyPeriodKey(new Date("2026-05-18T12:00:00.000Z"))).toBe("2026-W21");
  });
});
