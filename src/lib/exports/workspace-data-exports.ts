import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type WorkspaceDataExportRow = {
  id: string;
  status: string;
  exportScope: string;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  counts: Record<string, number>;
};

export type WorkspaceDataExportDetail = WorkspaceDataExportRow & {
  packageJson: Record<string, unknown>;
};

type ExportRecord = {
  id: string;
  status: string;
  export_scope: string;
  requested_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
  package_json: {
    counts?: Record<string, number>;
  } & Record<string, unknown>;
};

function toRow(row: ExportRecord): WorkspaceDataExportRow {
  return {
    id: row.id,
    status: row.status,
    exportScope: row.export_scope,
    requestedAt: row.requested_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    counts: row.package_json.counts ?? {}
  };
}

export async function getWorkspaceDataExportRows(): Promise<WorkspaceDataExportRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<ExportRecord>(
    `
    select id, status, export_scope, requested_at, completed_at, expires_at, package_json
    from public.workspace_data_exports
    where tenant_id = $1
    order by requested_at desc
    limit 25
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map(toRow);
}

export async function getWorkspaceDataExportDetail(exportId: string): Promise<WorkspaceDataExportDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<ExportRecord>(
    `
    select id, status, export_scope, requested_at, completed_at, expires_at, package_json
    from public.workspace_data_exports
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, exportId]
  );
  const row = result?.rows[0];
  if (!row) return null;

  return {
    ...toRow(row),
    packageJson: row.package_json
  };
}
