import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ReviewFirstExportQueueRow = {
  id: string;
  brandName: string;
  exportType: string;
  providerKey: string;
  targetLabel: string;
  title: string;
  status: string;
  riskLevel: string;
  createdAt: string;
};

export async function getReviewFirstExportQueueRows() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string | null;
    export_type: string;
    provider_key: string | null;
    target_label: string | null;
    title: string;
    status: string;
    risk_level: string;
    created_at: string;
  }>(
    `
    select q.id, b.name as brand_name, q.export_type, q.provider_key, q.target_label, q.title, q.status, q.risk_level, q.created_at
    from public.review_first_export_queue q
    left join public.brands b on b.id = q.brand_id
    where q.tenant_id = $1
      and q.status in ('draft', 'needs_review', 'approved', 'blocked')
    order by q.created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name ?? "Workspace",
    exportType: row.export_type,
    providerKey: row.provider_key ?? "manual_export",
    targetLabel: row.target_label ?? "manual",
    title: row.title,
    status: row.status,
    riskLevel: row.risk_level,
    createdAt: row.created_at
  }));
}
