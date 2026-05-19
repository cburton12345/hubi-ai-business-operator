import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  status: string;
  eventTypes: string[];
};

export async function getWebhookEndpointRows(): Promise<WebhookEndpointRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ id: string; name: string; url: string; status: string; event_types_json: string[] | null }>(
    "select id, name, url, status, event_types_json from public.webhook_endpoints where tenant_id = $1 order by created_at desc",
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    eventTypes: row.event_types_json ?? []
  }));
}
