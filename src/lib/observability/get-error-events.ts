import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ErrorEventRow = {
  id: string;
  source: string;
  severity: string;
  message: string;
  createdAt: string;
};

export type ErrorEventGroup = {
  source: string;
  severity: string;
  message: string;
  category: string;
  retryable: boolean;
  status: "open" | "resolved";
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
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

export async function getErrorEventGroups(): Promise<ErrorEventGroup[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    source: string;
    severity: string;
    message: string;
    category: string | null;
    retryable: boolean | null;
    status: "open" | "resolved";
    occurrence_count: string;
    first_seen_at: Date;
    last_seen_at: Date;
  }>(
    `
    select
      source,
      severity,
      message,
      coalesce(metadata_json->>'category', 'application') as category,
      bool_or(coalesce((metadata_json->>'retryable')::boolean, false)) as retryable,
      case when bool_and(resolved_at is not null) then 'resolved' else 'open' end as status,
      count(*)::text as occurrence_count,
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at
    from public.app_error_events
    where tenant_id = $1 or tenant_id is null
    group by source, severity, message, coalesce(metadata_json->>'category', 'application')
    order by
      case when bool_and(resolved_at is not null) then 1 else 0 end,
      max(created_at) desc
    limit 100
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    source: row.source,
    severity: row.severity,
    message: row.message,
    category: row.category ?? "application",
    retryable: Boolean(row.retryable),
    status: row.status,
    occurrenceCount: Number(row.occurrence_count),
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString()
  }));
}
