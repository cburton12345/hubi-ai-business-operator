import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { internalBrands, starterRecommendations, starterTasks } from "@/lib/dashboard/demo-data";

export async function getDashboardSnapshot() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
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

  const [{ count: brandCount }, { count: leadCount }, { count: draftCount }, { count: approvalCount }] =
    await Promise.all([
      supabase.from("brands").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("ai_drafts").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
      supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending")
    ]);

  return {
    tenantName: "AI Business Operator",
    brands: internalBrands,
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
