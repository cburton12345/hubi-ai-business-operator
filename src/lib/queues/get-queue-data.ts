import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      type: string;
      title: string;
      status: string;
      priority: number;
      created_at: string;
    }>(
      `
      select t.id, b.name as brand_name, t.type, t.title, t.status, t.priority, t.created_at
      from public.ai_tasks t
      join public.brands b on b.id = t.brand_id
      where t.tenant_id = $1
      order by t.created_at desc
      limit 100
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((task) => ({
        id: task.id,
        brandName: task.brand_name,
        type: task.type,
        title: task.title,
        status: task.status,
        priority: task.priority,
        createdAt: task.created_at
      }));
    }

    return fallback;
  }

  const { data, error } = await supabase
    .from("ai_tasks")
    .select("id, type, title, status, priority, created_at, brands:brand_id(name)")
    .eq("tenant_id", workspaceId)
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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      content_type: string;
      title: string | null;
      status: string;
      risk_level: string;
      created_at: string;
    }>(
      `
      select d.id, b.name as brand_name, d.content_type, d.title, d.status, d.risk_level, d.created_at
      from public.ai_drafts d
      join public.brands b on b.id = d.brand_id
      where d.tenant_id = $1
      order by d.created_at desc
      limit 100
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((draft) => ({
        id: draft.id,
        brandName: draft.brand_name,
        contentType: draft.content_type,
        title: draft.title ?? "Untitled draft",
        status: draft.status,
        riskLevel: draft.risk_level,
        createdAt: draft.created_at
      }));
    }

    return fallback;
  }

  const { data, error } = await supabase
    .from("ai_drafts")
    .select("id, content_type, title, status, risk_level, created_at, brands:brand_id(name)")
    .eq("tenant_id", workspaceId)
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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      category: string;
      title: string;
      summary: string | null;
      status: string;
      risk_level: string;
      impact_estimate: string | null;
      effort_estimate: string | null;
      created_at: string;
    }>(
      `
      select r.id, b.name as brand_name, r.category, r.title, r.summary, r.status, r.risk_level, r.impact_estimate, r.effort_estimate, r.created_at
      from public.recommendations r
      join public.brands b on b.id = r.brand_id
      where r.tenant_id = $1
      order by r.created_at desc
      limit 100
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((recommendation) => ({
        id: recommendation.id,
        brandName: recommendation.brand_name,
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

    return fallback;
  }

  const { data, error } = await supabase
    .from("recommendations")
    .select(
      "id, category, title, summary, status, risk_level, impact_estimate, effort_estimate, created_at, brands:brand_id(name)"
    )
    .eq("tenant_id", workspaceId)
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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      target_type: string;
      status: string;
      risk_level: string;
      notes: string | null;
      created_at: string;
    }>(
      `
      select a.id, b.name as brand_name, a.target_type, a.status, a.risk_level, a.notes, a.created_at
      from public.approvals a
      join public.brands b on b.id = a.brand_id
      where a.tenant_id = $1
      order by a.created_at desc
      limit 100
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((approval) => ({
        id: approval.id,
        brandName: approval.brand_name,
        targetType: approval.target_type,
        status: approval.status,
        riskLevel: approval.risk_level,
        notes: approval.notes ?? "",
        createdAt: approval.created_at
      }));
    }

    return fallback;
  }

  const { data, error } = await supabase
    .from("approvals")
    .select("id, target_type, status, risk_level, notes, created_at, brands:brand_id(name)")
    .eq("tenant_id", workspaceId)
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
