import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ProviderReportingResourceRow = {
  id: string;
  providerKey: "search_console" | "analytics";
  externalId: string;
  displayName: string;
  selected: boolean;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export async function getProviderReportingResources(): Promise<ProviderReportingResourceRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string; provider_key: "search_console" | "analytics"; external_id: string; display_name: string;
    selected: boolean; status: string; last_synced_at: string | null; last_error: string | null;
  }>(
    `select id, provider_key, external_id, display_name, selected, status, last_synced_at, last_error
     from public.provider_reporting_resources where tenant_id=$1 and status <> 'disconnected'
     order by provider_key, selected desc, display_name`,
    [workspaceId]
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id, providerKey: row.provider_key, externalId: row.external_id, displayName: row.display_name,
    selected: row.selected, status: row.status, lastSyncedAt: row.last_synced_at, lastError: row.last_error
  }));
}
