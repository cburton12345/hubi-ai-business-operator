import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ProviderIntegrationRequestRow = {
  id: string;
  providerName: string;
  category: string;
  status: string;
  currentlyUsing: boolean;
  requestCount: number;
};

export async function getProviderIntegrationRequests(): Promise<ProviderIntegrationRequestRow[]> {
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    provider_name: string;
    capability_category: string;
    status: string;
    currently_using: boolean;
    request_count: number;
  }>(
    `
    select id, provider_name, capability_category, status, currently_using, request_count
    from public.provider_integration_requests
    where tenant_id = $1
    order by currently_using desc, request_count desc, updated_at desc
    limit 12
    `,
    [tenantId]
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    providerName: row.provider_name,
    category: row.capability_category,
    status: row.status,
    currentlyUsing: row.currently_using,
    requestCount: row.request_count
  }));
}
