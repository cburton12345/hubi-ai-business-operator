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

type BreakdownRow = {
  label: string;
  count: string;
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
      content_created_this_week: string;
      ai_recommendations: string;
      stale_leads: string;
    }>(
      `
      select
        (select count(*) from public.leads where status = 'new') as open_leads,
        (select count(*) from public.ai_drafts where status = 'needs_review') as pending_drafts,
        (select count(*) from public.approvals where status = 'pending') as pending_approvals,
        (select count(*) from public.ai_drafts where created_at >= date_trunc('week', now())) as content_created_this_week,
        (select count(*) from public.recommendations where status in ('open', 'approved')) as ai_recommendations,
        (select count(*) from public.leads where status in ('new', 'contacted') and created_at < now() - interval '3 days') as stale_leads
      `
    );
    const [leadsByBrand, leadsBySource, leadsByCampaign] = await Promise.all([
      queryPostgres<BreakdownRow>(
        `
        select b.name as label, count(*)::text as count
        from public.leads l
        join public.brands b on b.id = l.brand_id
        where l.tenant_id = $1
        group by b.name
        order by count(*) desc, b.name
        limit 8
        `,
        ["11111111-1111-4111-8111-111111111111"]
      ),
      queryPostgres<BreakdownRow>(
        `
        select coalesce(nullif(source, ''), 'Unknown') as label, count(*)::text as count
        from public.leads
        where tenant_id = $1
        group by coalesce(nullif(source, ''), 'Unknown')
        order by count(*) desc, label
        limit 8
        `,
        ["11111111-1111-4111-8111-111111111111"]
      ),
      queryPostgres<BreakdownRow>(
        `
        select coalesce(nullif(source_detail, ''), metadata_json->>'campaign', 'Untracked') as label, count(*)::text as count
        from public.leads
        where tenant_id = $1
        group by coalesce(nullif(source_detail, ''), metadata_json->>'campaign', 'Untracked')
        order by count(*) desc, label
        limit 8
        `,
        ["11111111-1111-4111-8111-111111111111"]
      )
    ]);

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
          pendingApprovals: Number(counts?.pending_approvals ?? 0),
          contentCreatedThisWeek: Number(counts?.content_created_this_week ?? 0),
          aiRecommendations: Number(counts?.ai_recommendations ?? 0),
          staleLeads: Number(counts?.stale_leads ?? 0)
        },
        reporting: {
          leadsByBrand: (leadsByBrand?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) })),
          leadsBySource: (leadsBySource?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) })),
          leadsByCampaign: (leadsByCampaign?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) }))
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
        pendingApprovals: starterRecommendations.filter((item) => item.riskLevel !== "low").length,
        contentCreatedThisWeek: 0,
        aiRecommendations: starterRecommendations.length,
        staleLeads: 0
      },
      reporting: {
        leadsByBrand: [],
        leadsBySource: [],
        leadsByCampaign: []
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
      pendingApprovals: approvalCount ?? 0,
      contentCreatedThisWeek: 0,
      aiRecommendations: starterRecommendations.length,
      staleLeads: 0
    },
    reporting: {
      leadsByBrand: [],
      leadsBySource: [],
      leadsByCampaign: []
    }
  };
}
