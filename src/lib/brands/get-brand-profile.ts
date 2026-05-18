import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BusinessModel, RiskProfile } from "@/types/core";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

export type BrandProfile = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  domain: string;
  phone: string;
  email: string;
  logoUrl: string;
  businessModel: BusinessModel;
  industry: string;
  vertical: string;
  description: string;
  primaryGoal: string;
  primaryLocation: string;
  riskProfile: RiskProfile;
  status: string;
  marketing: {
    targetCustomers: string;
    ctaGoals: string;
    adGoals: string;
    seoTargets: string;
    reviewStrategy: string;
    followUpStrategy: string;
    toneOfVoice: string;
    approvalMode: "manual" | "low_risk_auto" | "recommend_only";
  };
};

type BrandProfileRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  domain: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  business_model: BusinessModel;
  industry: string | null;
  vertical: string | null;
  description: string | null;
  primary_goal: string | null;
  primary_location: string | null;
  risk_profile: RiskProfile;
  status: string;
  brand_marketing_settings:
    | {
        target_customers: string | null;
        cta_goals: string | null;
        ad_goals: string | null;
        seo_targets: string | null;
        review_strategy: string | null;
        follow_up_strategy: string | null;
        tone_of_voice: string | null;
        approval_mode: "manual" | "low_risk_auto" | "recommend_only";
      }
    | {
        target_customers: string | null;
        cta_goals: string | null;
        ad_goals: string | null;
        seo_targets: string | null;
        review_strategy: string | null;
        follow_up_strategy: string | null;
        tone_of_voice: string | null;
        approval_mode: "manual" | "low_risk_auto" | "recommend_only";
      }[]
    | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | null | undefined) {
  return value ?? "";
}

export async function getBrandProfile(brandSlug: string): Promise<BrandProfile | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, tenant_id, name, slug, domain, phone, email, logo_url, business_model, industry, vertical, description, primary_goal, primary_location, risk_profile, status, brand_marketing_settings(target_customers, cta_goals, ad_goals, seo_targets, review_strategy, follow_up_strategy, tone_of_voice, approval_mode)"
    )
    .eq("tenant_id", internalTenantId)
    .eq("slug", brandSlug)
    .maybeSingle<BrandProfileRow>();

  if (error || !data) {
    return null;
  }

  const marketing = first(data.brand_marketing_settings);

  return {
    id: data.id,
    tenantId: data.tenant_id,
    name: data.name,
    slug: data.slug,
    domain: clean(data.domain),
    phone: clean(data.phone),
    email: clean(data.email),
    logoUrl: clean(data.logo_url),
    businessModel: data.business_model,
    industry: clean(data.industry),
    vertical: clean(data.vertical),
    description: clean(data.description),
    primaryGoal: clean(data.primary_goal),
    primaryLocation: clean(data.primary_location),
    riskProfile: data.risk_profile,
    status: data.status,
    marketing: {
      targetCustomers: clean(marketing?.target_customers),
      ctaGoals: clean(marketing?.cta_goals),
      adGoals: clean(marketing?.ad_goals),
      seoTargets: clean(marketing?.seo_targets),
      reviewStrategy: clean(marketing?.review_strategy),
      followUpStrategy: clean(marketing?.follow_up_strategy),
      toneOfVoice: clean(marketing?.tone_of_voice),
      approvalMode: marketing?.approval_mode ?? "manual"
    }
  };
}
