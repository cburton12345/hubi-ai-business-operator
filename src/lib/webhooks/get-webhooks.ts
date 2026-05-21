import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  direction: string;
  status: string;
  eventTypes: string[];
  lastReceivedAt: string | null;
};

export async function getWebhookEndpointRows(): Promise<WebhookEndpointRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    name: string;
    url: string;
    direction: string;
    status: string;
    event_types_json: string[] | null;
    last_received_at: Date | null;
  }>(
    "select id, name, url, direction, status, event_types_json, last_received_at from public.webhook_endpoints where tenant_id = $1 order by created_at desc",
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    direction: row.direction,
    status: row.status,
    eventTypes: row.event_types_json ?? [],
    lastReceivedAt: row.last_received_at?.toISOString() ?? null
  }));
}
