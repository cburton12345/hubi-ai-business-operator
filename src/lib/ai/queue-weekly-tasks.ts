import { buildBrandPromptContext, buildWeeklyAiTaskPlans, getWeeklyPeriodKey, type BrandPromptContext } from "@/lib/ai/prompt-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  account_type: string;
  plan_key: string | null;
};

type BrandRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  domain: string | null;
  business_model: BrandPromptContext["brand"]["businessModel"];
  industry: string | null;
  vertical: string | null;
  description: string | null;
  primary_goal: string | null;
  primary_location: string | null;
  risk_profile: BrandPromptContext["brand"]["riskProfile"];
};

type ServiceRow = {
  brand_id: string;
  name: string;
  slug: string;
  description: string | null;
  priority: number;
};

type LocationRow = {
  brand_id: string;
  city: string | null;
  state: string | null;
  service_area_name: string | null;
  priority: number;
};

type OfferRow = {
  brand_id: string;
  title: string;
  description: string | null;
};

type MarketingRow = {
  brand_id: string;
  target_customers: string | null;
  cta_goals: string | null;
  ad_goals: string | null;
  seo_targets: string | null;
  review_strategy: string | null;
  follow_up_strategy: string | null;
  tone_of_voice: string | null;
  approval_mode: BrandPromptContext["marketing"]["approvalMode"];
};

export type QueueWeeklyAiTasksResult = {
  ok: boolean;
  periodKey: string;
  inserted: number;
  skipped: number;
  message: string;
};

function groupByBrandId<T extends { brand_id: string }>(rows: T[] | null | undefined) {
  const grouped = new Map<string, T[]>();

  for (const row of rows ?? []) {
    grouped.set(row.brand_id, [...(grouped.get(row.brand_id) ?? []), row]);
  }

  return grouped;
}

export async function queueWeeklyAiTasks(tenantId = internalTenantId): Promise<QueueWeeklyAiTasksResult> {
  const supabase = createSupabaseAdminClient();
  const periodKey = getWeeklyPeriodKey();

  if (!supabase) {
    return {
      ok: false,
      periodKey,
      inserted: 0,
      skipped: 0,
      message: "Supabase admin environment is not configured."
    };
  }

  const [{ data: tenant }, { data: brands }, { data: services }, { data: locations }, { data: offers }, { data: settings }] =
    await Promise.all([
      supabase.from("tenants").select("id, name, slug, account_type, plan_key").eq("id", tenantId).single(),
      supabase
        .from("brands")
        .select(
          "id, tenant_id, name, slug, domain, business_model, industry, vertical, description, primary_goal, primary_location, risk_profile"
        )
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("brand_services")
        .select("brand_id, name, slug, description, priority")
        .eq("tenant_id", tenantId)
        .eq("active", true),
      supabase
        .from("brand_locations")
        .select("brand_id, city, state, service_area_name, priority")
        .eq("tenant_id", tenantId)
        .eq("active", true),
      supabase.from("brand_offers").select("brand_id, title, description").eq("tenant_id", tenantId).eq("active", true),
      supabase
        .from("brand_marketing_settings")
        .select(
          "brand_id, target_customers, cta_goals, ad_goals, seo_targets, review_strategy, follow_up_strategy, tone_of_voice, approval_mode"
        )
        .eq("tenant_id", tenantId)
    ]);

  if (!tenant || !brands) {
    return {
      ok: false,
      periodKey,
      inserted: 0,
      skipped: 0,
      message: "No tenant or active brands found."
    };
  }

  const typedTenant = tenant as TenantRow;
  const typedBrands = brands as BrandRow[];
  const servicesByBrand = groupByBrandId(services as ServiceRow[]);
  const locationsByBrand = groupByBrandId(locations as LocationRow[]);
  const offersByBrand = groupByBrandId(offers as OfferRow[]);
  const settingsByBrand = new Map((settings as MarketingRow[] | null | undefined)?.map((row) => [row.brand_id, row]) ?? []);

  const taskRows = typedBrands.flatMap((brand) => {
    const context = buildBrandPromptContext({
      tenant: {
        id: typedTenant.id,
        name: typedTenant.name,
        slug: typedTenant.slug,
        accountType: typedTenant.account_type,
        planKey: typedTenant.plan_key
      },
      brand: {
        id: brand.id,
        tenantId: brand.tenant_id,
        name: brand.name,
        slug: brand.slug,
        domain: brand.domain,
        businessModel: brand.business_model,
        industry: brand.industry,
        vertical: brand.vertical,
        description: brand.description,
        primaryGoal: brand.primary_goal,
        primaryLocation: brand.primary_location,
        riskProfile: brand.risk_profile
      },
      services: (servicesByBrand.get(brand.id) ?? []).map((service) => ({
        name: service.name,
        slug: service.slug,
        description: service.description,
        priority: service.priority
      })),
      locations: (locationsByBrand.get(brand.id) ?? []).map((location) => ({
        city: location.city,
        state: location.state,
        serviceAreaName: location.service_area_name,
        priority: location.priority
      })),
      offers: (offersByBrand.get(brand.id) ?? []).map((offer) => ({
        title: offer.title,
        description: offer.description
      })),
      marketing: settingsByBrand.get(brand.id)
        ? {
            targetCustomers: settingsByBrand.get(brand.id)!.target_customers,
            ctaGoals: settingsByBrand.get(brand.id)!.cta_goals,
            adGoals: settingsByBrand.get(brand.id)!.ad_goals,
            seoTargets: settingsByBrand.get(brand.id)!.seo_targets,
            reviewStrategy: settingsByBrand.get(brand.id)!.review_strategy,
            followUpStrategy: settingsByBrand.get(brand.id)!.follow_up_strategy,
            toneOfVoice: settingsByBrand.get(brand.id)!.tone_of_voice,
            approvalMode: settingsByBrand.get(brand.id)!.approval_mode
          }
        : null
    });

    return buildWeeklyAiTaskPlans(context, periodKey).map((task) => ({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      type: task.type,
      title: task.title,
      prompt_context_json: task.promptContext,
      status: "queued",
      priority: task.priority,
      created_by: "system"
    }));
  });

  if (taskRows.length === 0) {
    return {
      ok: true,
      periodKey,
      inserted: 0,
      skipped: 0,
      message: "No active brands needed weekly tasks."
    };
  }

  const { error } = await supabase.from("ai_tasks").insert(taskRows);

  if (error) {
    return {
      ok: false,
      periodKey,
      inserted: 0,
      skipped: taskRows.length,
      message: error.message
    };
  }

  return {
    ok: true,
    periodKey,
    inserted: taskRows.length,
    skipped: 0,
    message: `Queued ${taskRows.length} weekly AI tasks for ${typedBrands.length} active brands.`
  };
}
