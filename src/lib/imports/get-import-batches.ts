import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ImportBatchRow = {
  id: string;
  source: string;
  entityType: string;
  status: string;
  total: number;
  valid: number;
  invalid: number;
  applied: number;
  createdAt: string;
};

export async function getImportBatches(): Promise<ImportBatchRow[]> {
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string; source_system: string; entity_type: string; status: string;
    total_rows: number; valid_rows: number; invalid_rows: number; applied_rows: number; created_at: Date;
  }>(
    `
    select id, source_system, entity_type, status, total_rows, valid_rows, invalid_rows, applied_rows, created_at
    from public.data_import_batches
    where tenant_id = $1
    order by created_at desc
    limit 30
    `,
    [tenantId]
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    source: row.source_system,
    entityType: row.entity_type,
    status: row.status,
    total: row.total_rows,
    valid: row.valid_rows,
    invalid: row.invalid_rows,
    applied: row.applied_rows,
    createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(row.created_at)
  }));
}
