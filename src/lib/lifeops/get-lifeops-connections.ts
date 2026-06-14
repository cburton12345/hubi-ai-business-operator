import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type LifeOpsConnection = {
  id: string;
  platformKey: string;
  platformName: string;
  platformType: string;
  connectionStatus: string;
  ownerLayer: string;
  eventScope: string[];
  actionHref: string | null;
  externalBaseUrl: string | null;
  notes: string | null;
  lastEventAt: string | null;
};

export type LifeOpsConnectionsDashboard = {
  tokenConfigured: boolean;
  endpoint: string;
  connections: LifeOpsConnection[];
  metrics: {
    connected: number;
    planned: number;
    needsAttention: number;
    personal: number;
  };
};

function mapRow(row: {
  id: string;
  platform_key: string;
  platform_name: string;
  platform_type: string;
  connection_status: string;
  owner_layer: string;
  event_scope: string[];
  action_href: string | null;
  external_base_url: string | null;
  notes: string | null;
  last_event_at: Date | null;
}): LifeOpsConnection {
  return {
    id: row.id,
    platformKey: row.platform_key,
    platformName: row.platform_name,
    platformType: row.platform_type,
    connectionStatus: row.connection_status,
    ownerLayer: row.owner_layer,
    eventScope: row.event_scope ?? [],
    actionHref: row.action_href,
    externalBaseUrl: row.external_base_url,
    notes: row.notes,
    lastEventAt: row.last_event_at?.toISOString() ?? null
  };
}

export async function getLifeOpsConnections(): Promise<LifeOpsConnectionsDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    platform_key: string;
    platform_name: string;
    platform_type: string;
    connection_status: string;
    owner_layer: string;
    event_scope: string[];
    action_href: string | null;
    external_base_url: string | null;
    notes: string | null;
    last_event_at: Date | null;
  }>(
    `
    select id, platform_key, platform_name, platform_type, connection_status, owner_layer,
      event_scope, action_href, external_base_url, notes, last_event_at
    from public.owner_platform_connections
    where tenant_id = $1 and connection_status <> 'archived'
    order by
      case connection_status when 'connected' then 0 when 'needs_attention' then 1 when 'planned' then 2 when 'paused' then 3 else 4 end,
      platform_name
    `,
    [workspaceId]
  );
  const connections = (result?.rows ?? []).map(mapRow);

  return {
    tokenConfigured: Boolean(env.OWNER_COMMAND_CENTER_TOKEN),
    endpoint: "/api/owner-command-center/events",
    connections,
    metrics: {
      connected: connections.filter((item) => item.connectionStatus === "connected").length,
      planned: connections.filter((item) => item.connectionStatus === "planned").length,
      needsAttention: connections.filter((item) => item.connectionStatus === "needs_attention").length,
      personal: connections.filter((item) => item.platformType === "personal" || item.ownerLayer === "both").length
    }
  };
}
