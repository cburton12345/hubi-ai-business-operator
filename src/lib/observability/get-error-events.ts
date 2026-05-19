import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ErrorEventRow = {
  id: string;
  source: string;
  severity: string;
  message: string;
  createdAt: string;
};

export async function getErrorEventRows(): Promise<ErrorEventRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ id: string; source: string; severity: string; message: string; created_at: Date }>(
    `
    select id, source, severity, message, created_at
    from public.app_error_events
    where tenant_id = $1 or tenant_id is null
    order by created_at desc
    limit 50
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    severity: row.severity,
    message: row.message,
    createdAt: row.created_at.toISOString()
  }));
}
