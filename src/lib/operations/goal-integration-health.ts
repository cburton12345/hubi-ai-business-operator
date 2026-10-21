import { queryPostgres } from "@/lib/db/postgres";

export type GoalIntegrationHealth = {
  status: "waiting" | "satisfied" | "blocked";
  reason: string;
};

export function mapGoalIntegrationHealth(input: {
  referenceTable: string;
  connectionStatus: string;
  credentialsStatus?: string | null;
  liveActionsEnabled?: boolean | null;
}): GoalIntegrationHealth {
  const status = input.connectionStatus.toLowerCase();
  const credentials = input.credentialsStatus?.toLowerCase() ?? null;
  if (["expired", "revoked", "invalid"].includes(credentials ?? "")) {
    return { status: "blocked", reason: "Connected-account credentials need renewal." };
  }
  if (["paused", "blocked", "error", "needs_attention", "disconnected", "archived", "revoked"].includes(status)) {
    return { status: "blocked", reason: "The connected system is unavailable or needs attention." };
  }
  if (input.referenceTable === "ferocity_connect_devices") {
    if (status === "active") return { status: "satisfied", reason: "The Ferocity Connect device is active." };
    return { status: "waiting", reason: "The Ferocity Connect device is paired but has not established active health." };
  }
  if (["connected", "available", "active", "configured", "syncing"].includes(status)) {
    return { status: "satisfied", reason: "The connected system is available." };
  }
  return { status: "waiting", reason: "The connected system is not ready yet." };
}

type HealthRow = {
  dependency_id: string;
  goal_id: string;
  reference_table: string;
  connection_status: string;
  credentials_status: string | null;
  live_actions_enabled: boolean | null;
};

async function dependencyHealthRows(tenantId: string) {
  const result = await queryPostgres<HealthRow>(
    `select dependency.id as dependency_id,dependency.goal_id,dependency.reference_table,
       case dependency.reference_table
         when 'owner_platform_connections' then owner_connection.connection_status
         when 'integration_connections' then integration_connection.status
         when 'provider_accounts' then provider_account.status
         when 'provider_connection_lanes' then provider_lane.connection_status
         when 'mailbox_connections' then mailbox.status
         when 'ferocity_connect_devices' then connect_device.status
         else 'unknown'
       end as connection_status,
       case dependency.reference_table
         when 'integration_connections' then integration_connection.credentials_status
         when 'provider_accounts' then provider_account.credentials_status
         when 'provider_connection_lanes' then provider_lane.credentials_status
         else null
       end as credentials_status,
       case dependency.reference_table
         when 'provider_accounts' then provider_account.live_actions_enabled
         when 'provider_connection_lanes' then provider_lane.live_actions_enabled
         else null
       end as live_actions_enabled
     from public.operating_goal_dependencies dependency
     join public.operating_goals goal
       on goal.tenant_id=dependency.tenant_id and goal.id=dependency.goal_id
     left join public.owner_platform_connections owner_connection
       on dependency.reference_table='owner_platform_connections'
      and owner_connection.tenant_id=dependency.tenant_id
      and (owner_connection.id=dependency.reference_id or owner_connection.platform_key=dependency.external_reference)
     left join public.integration_connections integration_connection
       on dependency.reference_table='integration_connections'
      and integration_connection.tenant_id=dependency.tenant_id
      and (integration_connection.id=dependency.reference_id or integration_connection.provider=dependency.external_reference)
     left join public.provider_accounts provider_account
       on dependency.reference_table='provider_accounts'
      and provider_account.tenant_id=dependency.tenant_id
      and (provider_account.id=dependency.reference_id or provider_account.provider_key=dependency.external_reference)
     left join public.provider_connection_lanes provider_lane
       on dependency.reference_table='provider_connection_lanes'
      and provider_lane.tenant_id=dependency.tenant_id and provider_lane.id=dependency.reference_id
     left join public.mailbox_connections mailbox
       on dependency.reference_table='mailbox_connections'
      and mailbox.tenant_id=dependency.tenant_id
      and (mailbox.id=dependency.reference_id or mailbox.provider_key=dependency.external_reference)
     left join public.ferocity_connect_devices connect_device
       on dependency.reference_table='ferocity_connect_devices'
      and connect_device.tenant_id=dependency.tenant_id and connect_device.id=dependency.reference_id
     where dependency.tenant_id=$1 and dependency.dependency_type='integration'
       and dependency.reference_table=any($2::text[])
       and goal.status in ('active','progressing','waiting','blocked','needs_owner')`,
    [tenantId, [
      "owner_platform_connections",
      "integration_connections",
      "provider_accounts",
      "provider_connection_lanes",
      "mailbox_connections",
      "ferocity_connect_devices",
    ]],
  );
  return result?.rows ?? [];
}

export async function syncOperatingGoalIntegrationHealthForTenant(tenantId: string) {
  const rows = await dependencyHealthRows(tenantId);
  let changed = 0;
  for (const row of rows) {
    const health = mapGoalIntegrationHealth({
      referenceTable: row.reference_table,
      connectionStatus: row.connection_status || "unknown",
      credentialsStatus: row.credentials_status,
      liveActionsEnabled: row.live_actions_enabled,
    });
    const result = await queryPostgres<{ id: string }>(
      `with changed as (
         update public.operating_goal_dependencies set status=$4,
           satisfied_at=case when $4='satisfied' then coalesce(satisfied_at,now()) else null end,
           evidence_json=evidence_json || jsonb_build_object(
             'connectionStatus',$5::text,'credentialsStatus',$6::text,'healthReason',$7::text,'checkedAt',now()
           ),updated_at=now()
         where tenant_id=$1 and id=$2 and goal_id=$3 and status is distinct from $4
         returning id
       ), woken as (
         update public.operating_goals set next_evaluation_at=least(next_evaluation_at,now()),updated_at=now()
         where tenant_id=$1 and id=$3 and exists(select 1 from changed) returning id
       ) select id from changed`,
      [tenantId, row.dependency_id, row.goal_id, health.status, row.connection_status, row.credentials_status, health.reason],
    );
    if (result?.rows[0]) changed += 1;
  }
  return { checked: rows.length, changed };
}
