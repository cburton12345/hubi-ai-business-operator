import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { internalBrands, starterRecommendations, starterTasks } from "@/lib/dashboard/demo-data";
import type { BrandSummary } from "@/types/core";
import { queryPostgres } from "@/lib/db/postgres";

type BrandRow = {
  name: string;
  slug: string;
  business_model: BrandSummary["businessModel"];
  industry: string | null;
  primary_goal: string | null;
  risk_profile: BrandSummary["riskProfile"];
};

export async function getDashboardSnapshot() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const brandResult = await queryPostgres<BrandRow>(
      `
      select name, slug, business_model, industry, primary_goal, risk_profile
      from public.brands
      where tenant_id = $1
      order by name
      `,
      ["11111111-1111-4111-8111-111111111111"]
    );
    const countResult = await queryPostgres<{
      open_leads: string;
      pending_drafts: string;
      pending_approvals: string;
    }>(
      `
      select
        (select count(*) from public.leads where status = 'new') as open_leads,
        (select count(*) from public.ai_drafts where status = 'needs_review') as pending_drafts,
        (select count(*) from public.approvals where status = 'pending') as pending_approvals
      `
    );

    if (brandResult) {
      const brands = brandResult.rows.map((brand) => ({
        name: brand.name,
        slug: brand.slug,
        businessModel: brand.business_model,
        industry: brand.industry ?? "Uncategorized",
        primaryGoal: brand.primary_goal ?? "No primary goal set.",
        riskProfile: brand.risk_profile
      }));
      const counts = countResult?.rows[0];

      return {
        tenantName: "AI Business Operator",
        brands,
        recommendations: starterRecommendations,
        tasks: starterTasks,
        metrics: {
          brands: brands.length,
          openLeads: Number(counts?.open_leads ?? 0),
          pendingDrafts: Number(counts?.pending_drafts ?? 0),
          pendingApprovals: Number(counts?.pending_approvals ?? 0)
        }
      };
    }

    return {
      tenantName: "Internal Portfolio",
      brands: internalBrands,
      recommendations: starterRecommendations,
      tasks: starterTasks,
      metrics: {
        brands: internalBrands.length,
        openLeads: 0,
        pendingDrafts: starterTasks.length,
        pendingApprovals: starterRecommendations.filter((item) => item.riskLevel !== "low").length
      }
    };
  }

  const [{ data: brandRows, count: brandCount }, { count: leadCount }, { count: draftCount }, { count: approvalCount }] =
    await Promise.all([
      supabase
        .from("brands")
        .select("name, slug, business_model, industry, primary_goal, risk_profile", { count: "exact" })
        .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
        .order("name"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("ai_drafts").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
      supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending")
    ]);

  const brands = ((brandRows as BrandRow[] | null) ?? []).map((brand) => ({
    name: brand.name,
    slug: brand.slug,
    businessModel: brand.business_model,
    industry: brand.industry ?? "Uncategorized",
    primaryGoal: brand.primary_goal ?? "No primary goal set.",
    riskProfile: brand.risk_profile
  }));

  return {
    tenantName: "AI Business Operator",
    brands: brands.length > 0 ? brands : internalBrands,
    recommendations: starterRecommendations,
    tasks: starterTasks,
    metrics: {
      brands: brandCount ?? internalBrands.length,
      openLeads: leadCount ?? 0,
      pendingDrafts: draftCount ?? 0,
      pendingApprovals: approvalCount ?? 0
    }
  };
}
