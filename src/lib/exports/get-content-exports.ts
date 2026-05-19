import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ContentExportRow = {
  id: string;
  title: string;
  exportType: string;
  status: string;
  brandName: string;
  createdAt: string;
  body: string;
};

export async function getContentExportRows(): Promise<ContentExportRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    title: string;
    export_type: string;
    status: string;
    brand_name: string | null;
    created_at: Date;
    body: string;
  }>(
    `
    select
      e.id,
      e.title,
      e.export_type,
      e.status,
      b.name as brand_name,
      e.created_at,
      e.body
    from public.content_exports e
    left join public.brands b on b.id = e.brand_id
    where e.tenant_id = $1
    order by e.created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    exportType: row.export_type,
    status: row.status,
    brandName: row.brand_name ?? "Workspace",
    createdAt: row.created_at.toISOString(),
    body: row.body
  }));
}
