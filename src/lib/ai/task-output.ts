import type { BrandPromptContext, AiTaskType } from "@/lib/ai/prompt-context";
import type { RiskLevel } from "@/types/core";

type AiTaskOutputInput = {
  taskId: string;
  taskType: AiTaskType;
  taskTitle: string;
  tenantId: string;
  brandId: string;
  promptContext: BrandPromptContext & {
    workflow?: {
      periodKey?: string;
      requestedOutput?: string;
    };
  };
};

export type DraftOutput = {
  tenant_id: string;
  brand_id: string;
  ai_task_id: string;
  content_type: "blog" | "facebook_post" | "gbp_post" | "landing_page" | "city_page" | "service_page" | "google_ad" | "facebook_ad" | "email" | "sms";
  title: string;
  body: string;
  metadata_json: Record<string, unknown>;
  status: "draft" | "needs_review";
  risk_level: RiskLevel;
};

export type RecommendationOutput = {
  tenant_id: string;
  brand_id: string;
  category: "seo" | "ads" | "content" | "lead_management" | "operations";
  title: string;
  summary: string;
  rationale: string;
  suggested_action: string;
  impact_estimate: "low" | "medium" | "high";
  effort_estimate: "low" | "medium" | "high";
  risk_level: RiskLevel;
  status: "open";
  created_by: "ai" | "system";
};

export type ApprovalOutput = {
  tenant_id: string;
  brand_id: string;
  target_type: "ai_draft" | "recommendation";
  target_id?: string;
  status: "pending";
  risk_level: RiskLevel;
  notes: string;
};

export type GeneratedTaskOutput = {
  drafts: DraftOutput[];
  recommendations: RecommendationOutput[];
};

export function classifyTaskRisk(context: BrandPromptContext, taskType: AiTaskType): RiskLevel {
  if (context.brand.riskProfile === "legal_sensitive") {
    return "high";
  }

  if (taskType === "campaign_recommendation" || taskType === "lead_followup") {
    return "medium";
  }

  return "low";
}

function metadata(input: AiTaskOutputInput, outputKind: string) {
  return {
    generator: "phase2_deterministic_operator",
    outputKind,
    periodKey: input.promptContext.workflow?.periodKey ?? null,
    requestedOutput: input.promptContext.workflow?.requestedOutput ?? null,
    schemaVersion: input.promptContext.schemaVersion,
    safety: input.promptContext.safety,
    phaseScope: input.promptContext.phaseScope
  };
}

function brandBasics(context: BrandPromptContext) {
  const serviceNames = context.services.map((service) => service.name).slice(0, 5);
  const locations = context.locations
    .map((location) => location.serviceAreaName ?? [location.city, location.state].filter(Boolean).join(", "))
    .filter(Boolean)
    .slice(0, 5);

  return {
    serviceLine: serviceNames.length > 0 ? serviceNames.join(", ") : context.brand.industry ?? "core services",
    locationLine: locations.length > 0 ? locations.join(", ") : context.brand.primaryLocation ?? "target service areas",
    audience: context.marketing.targetCustomers ?? "the brand's target customers",
    cta: context.marketing.ctaGoals ?? "request information",
    tone: context.marketing.toneOfVoice ?? "direct, useful, and conversion-focused"
  };
}

function contentDraft(input: AiTaskOutputInput, riskLevel: RiskLevel): DraftOutput {
  const context = input.promptContext;
  const basics = brandBasics(context);
  const legalGuardrail =
    context.brand.riskProfile === "legal_sensitive"
      ? "\n\nCompliance note: keep this educational, avoid legal advice, avoid outcome guarantees, and require admin/legal review before public use."
      : "";

  return {
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    ai_task_id: input.taskId,
    content_type: "blog",
    title: `${context.brand.name}: weekly content draft`,
    body: [
      `Draft angle for ${context.brand.name}`,
      `Audience: ${basics.audience}`,
      `Focus: ${basics.serviceLine}`,
      `Market: ${basics.locationLine}`,
      `Tone: ${basics.tone}`,
      `CTA: ${basics.cta}`,
      "",
      "Draft brief: create one helpful article or post that answers a practical customer question, supports the primary business goal, and can be reviewed before publishing.",
      legalGuardrail.trim()
    ]
      .filter(Boolean)
      .join("\n"),
    metadata_json: metadata(input, "content_draft"),
    status: "needs_review",
    risk_level: riskLevel
  };
}

function seoRecommendation(input: AiTaskOutputInput, riskLevel: RiskLevel): RecommendationOutput {
  const context = input.promptContext;
  const basics = brandBasics(context);

  return {
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    category: "seo",
    title: `${context.brand.name}: weekly SEO priority`,
    summary: `Create or improve search content around ${basics.serviceLine} for ${basics.locationLine}.`,
    rationale: `The brand goal is ${context.brand.primaryGoal ?? "growth"}, and the current SEO target setting is ${
      context.marketing.seoTargets ?? "draft SEO recommendations only"
    }.`,
    suggested_action: "Prepare one reviewable SEO brief with target query, page intent, supporting sections, CTA, and internal-link suggestions.",
    impact_estimate: "medium",
    effort_estimate: "medium",
    risk_level: riskLevel,
    status: "open",
    created_by: "system"
  };
}

function campaignRecommendation(input: AiTaskOutputInput, riskLevel: RiskLevel): RecommendationOutput {
  const context = input.promptContext;
  const basics = brandBasics(context);

  return {
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    category: "ads",
    title: `${context.brand.name}: weekly campaign angle`,
    summary: `Recommend a campaign concept for ${basics.audience} with CTA: ${basics.cta}.`,
    rationale: `Phase 1 allows campaign recommendations only. No campaigns are launched and no budgets are changed.`,
    suggested_action: "Draft one campaign hypothesis with audience, offer angle, landing-page need, risk notes, and approval requirement.",
    impact_estimate: "medium",
    effort_estimate: "low",
    risk_level: riskLevel,
    status: "open",
    created_by: "system"
  };
}

function weeklyPlanRecommendation(input: AiTaskOutputInput, riskLevel: RiskLevel): RecommendationOutput {
  const context = input.promptContext;

  return {
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    category: "operations",
    title: `${context.brand.name}: weekly operator plan`,
    summary: "Review lead flow, content needs, SEO priorities, and campaign opportunities for the week.",
    rationale: "The operator should create useful work for admin review without taking high-risk public actions.",
    suggested_action: "Review this week's generated draft, SEO priority, and campaign recommendation before approving follow-up work.",
    impact_estimate: "medium",
    effort_estimate: "low",
    risk_level: riskLevel,
    status: "open",
    created_by: "system"
  };
}

export function generateTaskOutput(input: AiTaskOutputInput): GeneratedTaskOutput {
  const riskLevel = classifyTaskRisk(input.promptContext, input.taskType);

  if (input.taskType === "content_draft") {
    return {
      drafts: [contentDraft(input, riskLevel)],
      recommendations: []
    };
  }

  if (input.taskType === "seo_recommendation") {
    return {
      drafts: [],
      recommendations: [seoRecommendation(input, riskLevel)]
    };
  }

  if (input.taskType === "campaign_recommendation") {
    return {
      drafts: [],
      recommendations: [campaignRecommendation(input, riskLevel)]
    };
  }

  if (input.taskType === "weekly_plan") {
    return {
      drafts: [],
      recommendations: [weeklyPlanRecommendation(input, riskLevel)]
    };
  }

  return {
    drafts: [],
    recommendations: []
  };
}
