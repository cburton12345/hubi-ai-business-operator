import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

export type TaskQueueRow = {
  id: string;
  brandName: string;
  type: string;
  title: string;
  status: string;
  priority: number;
  createdAt: string;
};

export type DraftQueueRow = {
  id: string;
  brandName: string;
  contentType: string;
  title: string;
  status: string;
  riskLevel: string;
  createdAt: string;
};

export type RecommendationQueueRow = {
  id: string;
  brandName: string;
  category: string;
  title: string;
  summary: string;
  status: string;
  riskLevel: string;
  impactEstimate: string;
  effortEstimate: string;
  createdAt: string;
};

export type ApprovalQueueRow = {
  id: string;
  brandName: string;
  targetType: string;
  status: string;
  riskLevel: string;
  notes: string;
  createdAt: string;
};

type BrandRelation = { name: string } | { name: string }[] | null;

type TaskRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: number;
  created_at: string;
  brands: BrandRelation;
};

type DraftRow = {
  id: string;
  content_type: string;
  title: string | null;
  status: string;
  risk_level: string;
  created_at: string;
  brands: BrandRelation;
};

type RecommendationRow = {
  id: string;
  category: string;
  title: string;
  summary: string | null;
  status: string;
  risk_level: string;
  impact_estimate: string | null;
  effort_estimate: string | null;
  created_at: string;
  brands: BrandRelation;
};

type ApprovalRow = {
  id: string;
  target_type: string;
  status: string;
  risk_level: string;
  notes: string | null;
  created_at: string;
  brands: BrandRelation;
};

function brandName(relation: BrandRelation) {
  const brand = Array.isArray(relation) ? relation[0] : relation;
  return brand?.name ?? "Unknown brand";
}

export async function getTaskQueueRows(fallback: TaskQueueRow[]) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return fallback;
  }

  const { data, error } = await supabase
    .from("ai_tasks")
    .select("id, type, title, status, priority, created_at, brands:brand_id(name)")
    .eq("tenant_id", internalTenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (data as TaskRow[]).map((task) => ({
    id: task.id,
    brandName: brandName(task.brands),
    type: task.type,
    title: task.title,
    status: task.status,
    priority: task.priority,
    createdAt: task.created_at
  }));
}

export async function getDraftQueueRows(fallback: DraftQueueRow[]) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return fallback;
  }

  const { data, error } = await supabase
    .from("ai_drafts")
    .select("id, content_type, title, status, risk_level, created_at, brands:brand_id(name)")
    .eq("tenant_id", internalTenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (data as DraftRow[]).map((draft) => ({
    id: draft.id,
    brandName: brandName(draft.brands),
    contentType: draft.content_type,
    title: draft.title ?? "Untitled draft",
    status: draft.status,
    riskLevel: draft.risk_level,
    createdAt: draft.created_at
  }));
}

export async function getRecommendationQueueRows(fallback: RecommendationQueueRow[]) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return fallback;
  }

  const { data, error } = await supabase
    .from("recommendations")
    .select(
      "id, category, title, summary, status, risk_level, impact_estimate, effort_estimate, created_at, brands:brand_id(name)"
    )
    .eq("tenant_id", internalTenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (data as RecommendationRow[]).map((recommendation) => ({
    id: recommendation.id,
    brandName: brandName(recommendation.brands),
    category: recommendation.category,
    title: recommendation.title,
    summary: recommendation.summary ?? "",
    status: recommendation.status,
    riskLevel: recommendation.risk_level,
    impactEstimate: recommendation.impact_estimate ?? "unknown",
    effortEstimate: recommendation.effort_estimate ?? "unknown",
    createdAt: recommendation.created_at
  }));
}

export async function getApprovalQueueRows(fallback: ApprovalQueueRow[]) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return fallback;
  }

  const { data, error } = await supabase
    .from("approvals")
    .select("id, target_type, status, risk_level, notes, created_at, brands:brand_id(name)")
    .eq("tenant_id", internalTenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (data as ApprovalRow[]).map((approval) => ({
    id: approval.id,
    brandName: brandName(approval.brands),
    targetType: approval.target_type,
    status: approval.status,
    riskLevel: approval.risk_level,
    notes: approval.notes ?? "",
    createdAt: approval.created_at
  }));
}
