import "server-only";
import { queryPostgres, queryPostgresRequired } from "@/lib/db/postgres";

export type WorkspaceAbuseSurface = "public_lead_intake" | "public_chat_ai" | "public_support_intake";

type ReservationRow = {
  allowed: boolean;
  reason: string;
  hourly_count: number;
  hourly_limit: number;
  daily_count: number;
  daily_limit: number;
  tripped_until: Date | string | null;
};

export type WorkspaceAbuseControlSnapshot = {
  surfaceKey: string;
  status: "active" | "paused";
  hourlyCount: number;
  hourlyLimit: number;
  dailyCount: number;
  dailyLimit: number;
  trippedUntil: string | null;
  tripReason: string | null;
  blockedLast24Hours: number;
};

export async function reserveWorkspaceAbuseCapacity(input: {
  tenantId: string;
  surface: WorkspaceAbuseSurface;
  units?: number;
}) {
  const units = input.units ?? 1;
  if (!input.tenantId || !Number.isInteger(units) || units < 1 || units > 1000) {
    return { allowed: false as const, reason: "Invalid workspace safety-budget reservation.", unavailable: false };
  }

  const result = await queryPostgres<ReservationRow>(
    `select * from public.reserve_workspace_abuse_capacity($1::uuid, $2::text, $3::integer)`,
    [input.tenantId, input.surface, units]
  );
  const row = result?.rows[0];
  if (!row) {
    return {
      allowed: false as const,
      reason: "Workspace safety controls are unavailable; this request was blocked safely.",
      unavailable: true
    };
  }
  return {
    allowed: row.allowed,
    reason: row.reason,
    unavailable: false,
    hourlyCount: Number(row.hourly_count),
    hourlyLimit: Number(row.hourly_limit),
    dailyCount: Number(row.daily_count),
    dailyLimit: Number(row.daily_limit),
    trippedUntil: row.tripped_until ? new Date(row.tripped_until).toISOString() : null
  };
}

export async function getWorkspaceAbuseControlSnapshot(tenantId: string): Promise<WorkspaceAbuseControlSnapshot[]> {
  const result = await queryPostgresRequired<{
    surface_key: string;
    status: "active" | "paused";
    hourly_count: number;
    hourly_limit: number;
    daily_count: number;
    daily_limit: number;
    tripped_until: Date | string | null;
    trip_reason: string | null;
    blocked_last_24_hours: number;
  }>(
    `
    select c.surface_key, c.status, c.hourly_count, c.hourly_limit,
      c.daily_count, c.daily_limit, c.tripped_until, c.trip_reason,
      coalesce((
        select sum(r.event_count)
        from public.workspace_abuse_event_rollups r
        where r.tenant_id = c.tenant_id
          and r.surface_key = c.surface_key
          and r.event_type in ('rate_limited', 'temporarily_tripped', 'manually_paused', 'unavailable')
          and r.window_started_at >= now() - interval '24 hours'
      ), 0)::integer as blocked_last_24_hours
    from public.workspace_abuse_controls c
    where c.tenant_id = $1
    order by c.surface_key
    `,
    [tenantId],
    "workspace-abuse-control-snapshot"
  );
  return result.rows.map((row) => ({
    surfaceKey: row.surface_key,
    status: row.status,
    hourlyCount: Number(row.hourly_count),
    hourlyLimit: Number(row.hourly_limit),
    dailyCount: Number(row.daily_count),
    dailyLimit: Number(row.daily_limit),
    trippedUntil: row.tripped_until ? new Date(row.tripped_until).toISOString() : null,
    tripReason: row.trip_reason,
    blockedLast24Hours: Number(row.blocked_last_24_hours)
  }));
}
