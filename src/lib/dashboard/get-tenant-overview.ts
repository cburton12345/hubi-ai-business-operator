import { internalBrands } from "@/lib/dashboard/demo-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import type { BrandSummary } from "@/types/core";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  account_type: string;
  status: string;
  onboarding_status: string;
};

type BrandRow = {
  name: string;
  slug: string;
  business_model: BrandSummary["businessModel"];
  industry: string | null;
  primary_goal: string | null;
  risk_profile: BrandSummary["riskProfile"];
};

export async function getTenantOverview(tenantSlug: string) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const tenantResult = await queryPostgres<TenantRow>(
      `
      select id, name, slug, account_type, status, onboarding_status
      from public.tenants
      where slug = $1
      limit 1
      `,
      [tenantSlug]
    );
    const tenant = tenantResult?.rows[0];

    if (tenant) {
      const brandResult = await queryPostgres<BrandRow>(
        `
        select name, slug, business_model, industry, primary_goal, risk_profile
        from public.brands
        where tenant_id = $1
        order by name
        `,
        [tenant.id]
      );

      return {
        name: tenant.name,
        slug: tenant.slug,
        accountType: tenant.account_type,
        status: tenant.status,
        onboardingStatus: tenant.onboarding_status,
        brands: (brandResult?.rows ?? []).map((brand) => ({
          name: brand.name,
          slug: brand.slug,
          businessModel: brand.business_model,
          industry: brand.industry ?? "Uncategorized",
          primaryGoal: brand.primary_goal ?? "No primary goal set.",
          riskProfile: brand.risk_profile
        }))
      };
    }
  }

  if (supabase) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, slug, account_type, status, onboarding_status")
      .eq("slug", tenantSlug)
      .maybeSingle<TenantRow>();

    if (!tenant) {
      return null;
    }

    const { data: brandRows } = await supabase
      .from("brands")
      .select("name, slug, business_model, industry, primary_goal, risk_profile")
      .eq("tenant_id", tenant.id)
      .order("name");

    const brands = ((brandRows as BrandRow[] | null) ?? []).map((brand) => ({
      name: brand.name,
      slug: brand.slug,
      businessModel: brand.business_model,
      industry: brand.industry ?? "Uncategorized",
      primaryGoal: brand.primary_goal ?? "No primary goal set.",
      riskProfile: brand.risk_profile
    }));

    return {
      name: tenant.name,
      slug: tenant.slug,
      accountType: tenant.account_type,
      status: tenant.status,
      onboardingStatus: tenant.onboarding_status,
      brands
    };
  }

  if (tenantSlug !== "internal-portfolio") {
    return null;
  }

  return {
    name: "Internal Portfolio",
    slug: tenantSlug,
    accountType: "internal",
    status: "active",
    onboardingStatus: "completed",
    brands: internalBrands
  };
}
