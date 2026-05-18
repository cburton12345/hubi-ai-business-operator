import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
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
    const result = await queryPostgres<
      Omit<BrandProfileRow, "brand_marketing_settings"> & {
        target_customers: string | null;
        cta_goals: string | null;
        ad_goals: string | null;
        seo_targets: string | null;
        review_strategy: string | null;
        follow_up_strategy: string | null;
        tone_of_voice: string | null;
        approval_mode: "manual" | "low_risk_auto" | "recommend_only" | null;
      }
    >(
      `
      select
        b.id,
        b.tenant_id,
        b.name,
        b.slug,
        b.domain,
        b.phone,
        b.email,
        b.logo_url,
        b.business_model,
        b.industry,
        b.vertical,
        b.description,
        b.primary_goal,
        b.primary_location,
        b.risk_profile,
        b.status,
        ms.target_customers,
        ms.cta_goals,
        ms.ad_goals,
        ms.seo_targets,
        ms.review_strategy,
        ms.follow_up_strategy,
        ms.tone_of_voice,
        ms.approval_mode
      from public.brands b
      left join public.brand_marketing_settings ms on ms.brand_id = b.id
      where b.tenant_id = $1 and b.slug = $2
      limit 1
      `,
      [internalTenantId, brandSlug]
    );

    const data = result?.rows[0];

    if (!data) {
      return null;
    }

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
        targetCustomers: clean(data.target_customers),
        ctaGoals: clean(data.cta_goals),
        adGoals: clean(data.ad_goals),
        seoTargets: clean(data.seo_targets),
        reviewStrategy: clean(data.review_strategy),
        followUpStrategy: clean(data.follow_up_strategy),
        toneOfVoice: clean(data.tone_of_voice),
        approvalMode: data.approval_mode ?? "manual"
      }
    };
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
