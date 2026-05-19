import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type MarketingPlanRow = {
  id: string;
  brandName: string;
  periodKey: string;
  status: string;
  summary: string;
  createdAt: string;
};

export type MarketingCalendarRow = {
  id: string;
  brandName: string;
  title: string;
  itemType: string;
  status: string;
  riskLevel: string;
  scheduledFor: string | null;
  notes: string;
};

export type ReviewDraftRow = {
  id: string;
  brandName: string;
  contentType: string;
  title: string;
  body: string;
  status: string;
  riskLevel: string;
  createdAt: string;
};

export async function getMarketingPlanRows() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    period_key: string;
    status: string;
    summary: string | null;
    created_at: string;
  }>(
    `
    select p.id, b.name as brand_name, p.period_key, p.status, p.summary, p.created_at
    from public.marketing_plans p
    join public.brands b on b.id = p.brand_id
    where p.tenant_id = $1
    order by p.created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    periodKey: row.period_key,
    status: row.status,
    summary: row.summary ?? "",
    createdAt: row.created_at
  }));
}

export async function getMarketingCalendarRows() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    title: string;
    item_type: string;
    status: string;
    risk_level: string;
    scheduled_for: string | null;
    notes: string | null;
  }>(
    `
    select c.id, b.name as brand_name, c.title, c.item_type, c.status, c.risk_level, c.scheduled_for, c.notes
    from public.marketing_calendar_items c
    join public.brands b on b.id = c.brand_id
    where c.tenant_id = $1
    order by coalesce(c.scheduled_for, c.created_at) asc
    limit 150
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    title: row.title,
    itemType: row.item_type,
    status: row.status,
    riskLevel: row.risk_level,
    scheduledFor: row.scheduled_for,
    notes: row.notes ?? ""
  }));
}

export async function getReviewDraftRows() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    content_type: string;
    title: string | null;
    body: string;
    status: string;
    risk_level: string;
    created_at: string;
  }>(
    `
    select d.id, b.name as brand_name, d.content_type, d.title, d.body, d.status, d.risk_level, d.created_at
    from public.ai_drafts d
    join public.brands b on b.id = d.brand_id
    where d.tenant_id = $1
    order by d.created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    contentType: row.content_type,
    title: row.title ?? "Untitled draft",
    body: row.body,
    status: row.status,
    riskLevel: row.risk_level,
    createdAt: row.created_at
  }));
}
