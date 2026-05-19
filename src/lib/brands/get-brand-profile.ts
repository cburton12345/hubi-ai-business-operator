import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import type { BusinessModel, RiskProfile } from "@/types/core";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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
  services: { id: string; name: string; slug: string; description: string; priority: number; active: boolean }[];
  locations: { id: string; serviceAreaName: string; city: string; state: string; priority: number; active: boolean }[];
  offers: { id: string; title: string; description: string; active: boolean }[];
  landingPages: { id: string; title: string; slug: string; pageType: string; primaryKeyword: string; status: string }[];
  seoKeywords: { id: string; keyword: string; intent: string; priority: number; targetUrl: string }[];
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

async function loadBrandOperations(tenantId: string, brandId: string) {
  const [services, locations, offers, pages, keywords] = await Promise.all([
    queryPostgres<{ id: string; name: string; slug: string; description: string | null; priority: number; active: boolean }>(
      "select id, name, slug, description, priority, active from public.brand_services where tenant_id = $1 and brand_id = $2 order by active desc, priority desc, name",
      [tenantId, brandId]
    ),
    queryPostgres<{ id: string; service_area_name: string | null; city: string | null; state: string | null; priority: number; active: boolean }>(
      "select id, service_area_name, city, state, priority, active from public.brand_locations where tenant_id = $1 and brand_id = $2 order by active desc, priority desc, service_area_name",
      [tenantId, brandId]
    ),
    queryPostgres<{ id: string; title: string; description: string | null; active: boolean }>(
      "select id, title, description, active from public.brand_offers where tenant_id = $1 and brand_id = $2 order by active desc, created_at desc",
      [tenantId, brandId]
    ),
    queryPostgres<{ id: string; title: string; slug: string; page_type: string; primary_keyword: string | null; status: string }>(
      "select id, title, slug, page_type, primary_keyword, status from public.brand_landing_pages where tenant_id = $1 and brand_id = $2 order by title",
      [tenantId, brandId]
    ),
    queryPostgres<{ id: string; keyword: string; intent: string; priority: number; target_url: string | null }>(
      "select id, keyword, intent, priority, target_url from public.brand_seo_keywords where tenant_id = $1 and brand_id = $2 order by priority desc, keyword",
      [tenantId, brandId]
    )
  ]);

  return {
    services: (services?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: clean(row.description),
      priority: row.priority,
      active: row.active
    })),
    locations: (locations?.rows ?? []).map((row) => ({
      id: row.id,
      serviceAreaName: clean(row.service_area_name),
      city: clean(row.city),
      state: clean(row.state),
      priority: row.priority,
      active: row.active
    })),
    offers: (offers?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: clean(row.description),
      active: row.active
    })),
    landingPages: (pages?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      pageType: row.page_type,
      primaryKeyword: clean(row.primary_keyword),
      status: row.status
    })),
    seoKeywords: (keywords?.rows ?? []).map((row) => ({
      id: row.id,
      keyword: row.keyword,
      intent: row.intent,
      priority: row.priority,
      targetUrl: clean(row.target_url)
    }))
  };
}

export async function getBrandProfile(brandSlug: string): Promise<BrandProfile | null> {
  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

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
      [workspaceId, brandSlug]
    );

    const data = result?.rows[0];

    if (!data) {
      return null;
    }

    const operations = await loadBrandOperations(data.tenant_id, data.id);

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
      },
      ...operations
    };
  }

  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, tenant_id, name, slug, domain, phone, email, logo_url, business_model, industry, vertical, description, primary_goal, primary_location, risk_profile, status, brand_marketing_settings(target_customers, cta_goals, ad_goals, seo_targets, review_strategy, follow_up_strategy, tone_of_voice, approval_mode)"
    )
    .eq("tenant_id", workspaceId)
    .eq("slug", brandSlug)
    .maybeSingle<BrandProfileRow>();

  if (error || !data) {
    return null;
  }

  const marketing = first(data.brand_marketing_settings);
  const operations = await loadBrandOperations(data.tenant_id, data.id);

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
    },
    ...operations
  };
}
