import type { BusinessModel, RiskProfile } from "@/types/core";

export type AiTaskType = "seo_recommendation" | "content_draft" | "campaign_recommendation" | "lead_followup" | "weekly_plan";

export type PromptTenant = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  planKey: string | null;
};

export type PromptBrand = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  domain: string | null;
  businessModel: BusinessModel;
  industry: string | null;
  vertical: string | null;
  description: string | null;
  primaryGoal: string | null;
  primaryLocation: string | null;
  riskProfile: RiskProfile;
};

export type PromptMarketingSettings = {
  targetCustomers: string | null;
  ctaGoals: string | null;
  adGoals: string | null;
  seoTargets: string | null;
  reviewStrategy: string | null;
  followUpStrategy: string | null;
  toneOfVoice: string | null;
  approvalMode: "manual" | "low_risk_auto" | "recommend_only";
};

export type PromptService = {
  name: string;
  slug: string;
  description: string | null;
  priority: number;
};

export type PromptLocation = {
  city: string | null;
  state: string | null;
  serviceAreaName: string | null;
  priority: number;
};

export type PromptOffer = {
  title: string;
  description: string | null;
};

export type BrandPromptContext = {
  schemaVersion: "phase1.brand_prompt_context.v1";
  generatedAt: string;
  tenant: PromptTenant;
  brand: PromptBrand;
  services: PromptService[];
  locations: PromptLocation[];
  offers: PromptOffer[];
  marketing: PromptMarketingSettings;
  safety: {
    riskProfile: RiskProfile;
    approvalMode: PromptMarketingSettings["approvalMode"];
    requiresHumanReview: boolean;
    publicPublishingAllowed: false;
    prohibitedActions: string[];
  };
  phaseScope: {
    phase: "phase_1";
    draftOnly: true;
    canRecommendCampaigns: true;
    canRecommendSeo: true;
    canSendMessages: false;
    canChangeBudgets: false;
  };
};

export type WeeklyAiTaskPlan = {
  type: AiTaskType;
  title: string;
  priority: number;
  promptContext: BrandPromptContext & {
    workflow: {
      cadence: "weekly";
      periodKey: string;
      requestedOutput: string;
    };
  };
};

const defaultMarketing: PromptMarketingSettings = {
  targetCustomers: null,
  ctaGoals: null,
  adGoals: null,
  seoTargets: null,
  reviewStrategy: null,
  followUpStrategy: null,
  toneOfVoice: null,
  approvalMode: "manual"
};

export function buildBrandPromptContext(input: {
  tenant: PromptTenant;
  brand: PromptBrand;
  services?: PromptService[];
  locations?: PromptLocation[];
  offers?: PromptOffer[];
  marketing?: Partial<PromptMarketingSettings> | null;
  generatedAt?: string;
}): BrandPromptContext {
  const marketing = { ...defaultMarketing, ...input.marketing };
  const requiresHumanReview = input.brand.riskProfile !== "normal" || marketing.approvalMode !== "low_risk_auto";

  return {
    schemaVersion: "phase1.brand_prompt_context.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    tenant: input.tenant,
    brand: input.brand,
    services: [...(input.services ?? [])].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)),
    locations: [...(input.locations ?? [])].sort(
      (a, b) => b.priority - a.priority || (a.serviceAreaName ?? a.city ?? "").localeCompare(b.serviceAreaName ?? b.city ?? "")
    ),
    offers: input.offers ?? [],
    marketing,
    safety: {
      riskProfile: input.brand.riskProfile,
      approvalMode: marketing.approvalMode,
      requiresHumanReview,
      publicPublishingAllowed: false,
      prohibitedActions: [
        "Do not publish content automatically.",
        "Do not change ad budgets.",
        "Do not make pricing changes.",
        "Do not delete or materially rewrite important pages.",
        "Do not send customer messages automatically."
      ]
    },
    phaseScope: {
      phase: "phase_1",
      draftOnly: true,
      canRecommendCampaigns: true,
      canRecommendSeo: true,
      canSendMessages: false,
      canChangeBudgets: false
    }
  };
}

export function getWeeklyPeriodKey(date = new Date()) {
  const week = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = week.getUTCDay() || 7;
  week.setUTCDate(week.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(week.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((week.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${week.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function withWorkflow(context: BrandPromptContext, periodKey: string, requestedOutput: string): WeeklyAiTaskPlan["promptContext"] {
  return {
    ...context,
    workflow: {
      cadence: "weekly",
      periodKey,
      requestedOutput
    }
  };
}

export function buildWeeklyAiTaskPlans(context: BrandPromptContext, periodKey = getWeeklyPeriodKey()): WeeklyAiTaskPlan[] {
  const brandName = context.brand.name;
  const priority = context.safety.riskProfile === "legal_sensitive" ? 20 : 10;

  return [
    {
      type: "weekly_plan",
      title: `${brandName}: weekly marketing operator plan`,
      priority,
      promptContext: withWorkflow(context, periodKey, "Create a concise weekly marketing action plan for admin review.")
    },
    {
      type: "content_draft",
      title: `${brandName}: weekly content draft ideas`,
      priority,
      promptContext: withWorkflow(context, periodKey, "Draft safe content ideas only. Do not publish.")
    },
    {
      type: "seo_recommendation",
      title: `${brandName}: weekly SEO recommendations`,
      priority,
      promptContext: withWorkflow(context, periodKey, "Recommend SEO actions using brand services, locations, and goals.")
    },
    {
      type: "campaign_recommendation",
      title: `${brandName}: weekly campaign recommendations`,
      priority,
      promptContext: withWorkflow(context, periodKey, "Recommend campaign angles without changing budgets or launching campaigns.")
    }
  ];
}
