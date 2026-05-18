import { internalBrands } from "@/lib/dashboard/demo-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BrandSummary } from "@/types/core";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
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

  if (supabase) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, slug")
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
      brands
    };
  }

  if (tenantSlug !== "internal-portfolio") {
    return null;
  }

  return {
    name: "Internal Portfolio",
    slug: tenantSlug,
    brands: internalBrands
  };
}
