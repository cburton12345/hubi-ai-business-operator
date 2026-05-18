import { describe, expect, it } from "vitest";
import { buildBrandPromptContext } from "@/lib/ai/prompt-context";
import { classifyTaskRisk, generateTaskOutput } from "@/lib/ai/task-output";

const tenant = {
  id: "tenant-1",
  name: "Internal Portfolio",
  slug: "internal-portfolio",
  accountType: "internal",
  planKey: "internal"
};

function contextFor(riskProfile: "normal" | "regulated" | "legal_sensitive") {
  return buildBrandPromptContext({
    tenant,
    brand: {
      id: "brand-1",
      tenantId: "tenant-1",
      name: riskProfile === "legal_sensitive" ? "Ferocity" : "Storm Restoration",
      slug: riskProfile === "legal_sensitive" ? "ferocity" : "storm-restoration",
      domain: null,
      businessModel: riskProfile === "legal_sensitive" ? "lead_generation" : "local_service",
      industry: riskProfile === "legal_sensitive" ? "Personal injury lead generation" : "Roofing / storm restoration",
      vertical: riskProfile === "legal_sensitive" ? "personal_injury" : "roofing",
      description: null,
      primaryGoal: "Generate qualified leads.",
      primaryLocation: null,
      riskProfile
    },
    marketing: {
      targetCustomers: "Homeowners and local buyers",
      ctaGoals: "Request a quote"
    },
    generatedAt: "2026-05-18T00:00:00.000Z"
  });
}

describe("AI task output generation", () => {
  it("keeps legal-sensitive task outputs high risk", () => {
    const context = contextFor("legal_sensitive");

    expect(classifyTaskRisk(context, "content_draft")).toBe("high");
    expect(classifyTaskRisk(context, "seo_recommendation")).toBe("high");
  });

  it("generates draft-only content records for content tasks", () => {
    const context = contextFor("normal");
    const output = generateTaskOutput({
      taskId: "task-1",
      taskType: "content_draft",
      taskTitle: "Draft weekly content",
      tenantId: "tenant-1",
      brandId: "brand-1",
      promptContext: context
    });

    expect(output.drafts).toHaveLength(1);
    expect(output.recommendations).toHaveLength(0);
    expect(output.drafts[0].status).toBe("needs_review");
    expect(output.drafts[0].metadata_json).toMatchObject({
      generator: "phase1_deterministic_operator",
      outputKind: "content_draft"
    });
  });

  it("generates recommendation records for SEO and campaign tasks", () => {
    const context = contextFor("normal");
    const seoOutput = generateTaskOutput({
      taskId: "task-2",
      taskType: "seo_recommendation",
      taskTitle: "SEO",
      tenantId: "tenant-1",
      brandId: "brand-1",
      promptContext: context
    });
    const campaignOutput = generateTaskOutput({
      taskId: "task-3",
      taskType: "campaign_recommendation",
      taskTitle: "Campaign",
      tenantId: "tenant-1",
      brandId: "brand-1",
      promptContext: context
    });

    expect(seoOutput.recommendations[0].category).toBe("seo");
    expect(campaignOutput.recommendations[0].category).toBe("ads");
    expect(campaignOutput.recommendations[0].risk_level).toBe("medium");
  });
});
