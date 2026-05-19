import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { internalBrands } from "@/lib/dashboard/demo-data";
import type { BrandSummary } from "@/types/core";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  business_model: BrandSummary["businessModel"];
  industry: string | null;
  primary_goal: string | null;
  risk_profile: BrandSummary["riskProfile"];
  status: string;
};

export type BrandSelectorRow = BrandSummary & {
  id: string;
  domain: string;
  status: string;
};

export async function getBrandSelectorRows(): Promise<BrandSelectorRow[]> {
  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      name: string;
      slug: string;
      domain: string | null;
      business_model: BrandSummary["businessModel"];
      industry: string | null;
      primary_goal: string | null;
      risk_profile: BrandSummary["riskProfile"];
      status: string;
    }>(
      `
      select id, name, slug, domain, business_model, industry, primary_goal, risk_profile, status
      from public.brands
      where tenant_id = $1
      order by name
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        domain: brand.domain ?? "",
        businessModel: brand.business_model,
        industry: brand.industry ?? "Uncategorized",
        primaryGoal: brand.primary_goal ?? "No primary goal set.",
        riskProfile: brand.risk_profile,
        status: brand.status
      }));
    }

    return internalBrands.map((brand) => ({
      ...brand,
      id: brand.slug,
      domain: "",
      status: "active"
    }));
  }

  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, domain, business_model, industry, primary_goal, risk_profile, status")
    .eq("tenant_id", workspaceId)
    .order("name");

  if (error || !data) {
    return [];
  }

  return (data as BrandRow[]).map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    domain: brand.domain ?? "",
    businessModel: brand.business_model,
    industry: brand.industry ?? "Uncategorized",
    primaryGoal: brand.primary_goal ?? "No primary goal set.",
    riskProfile: brand.risk_profile,
    status: brand.status
  }));
}
