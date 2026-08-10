import { queryPostgres } from "@/lib/db/postgres";
import { raisePlatformAdminAlert, resolvePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

export type CapacitySeverity = "healthy" | "watch" | "high" | "critical" | "unknown";

export type PlatformCapacityDashboard = {
  latest: {
    databaseConnections: number | null;
    databaseMaxConnections: number | null;
    databaseConnectionPercent: number | null;
    dueActionCount: number;
    failedActionCount: number;
    recentErrorCount: number;
    status: CapacitySeverity;
    createdAt: string;
  } | null;
  alerts: Array<{
    id: string;
    signalKey: string;
    severity: Exclude<CapacitySeverity, "healthy" | "unknown">;
    title: string;
    summary: string;
    metricValue: number | null;
    thresholdValue: number | null;
    lastSeenAt: string;
  }>;
};

export function capacitySeverity(percent: number | null): CapacitySeverity {
  if (percent === null || !Number.isFinite(percent) || percent < 0) return "unknown";
  if (percent >= 85) return "critical";
  if (percent >= 70) return "high";
  if (percent >= 50) return "watch";
  return "healthy";
}

export function countSeverity(
  value: number,
  thresholds: { watch: number; high: number; critical: number }
): CapacitySeverity {
  if (!Number.isFinite(value) || value < 0) return "unknown";
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.high) return "high";
  if (value >= thresholds.watch) return "watch";
  return "healthy";
}

const severityRank: Record<CapacitySeverity, number> = {
  unknown: -1,
  healthy: 0,
  watch: 1,
  high: 2,
  critical: 3
};

function worstSeverity(values: CapacitySeverity[]): CapacitySeverity {
  return values.reduce((worst, current) =>
    severityRank[current] > severityRank[worst] ? current : worst, "unknown");
}

type CapacityRow = {
  database_connections: string | number | null;
  database_max_connections: string | number | null;
  due_actions: string | number | null;
  failed_actions: string | number | null;
  recent_errors: string | number | null;
};

async function reconcileAlert(input: {
  signalKey: string;
  value: number | null;
  severity: CapacitySeverity;
  threshold: number | null;
  title: string;
  summary: string;
}) {
  if (input.value === null || input.severity === "healthy" || input.severity === "unknown") {
    await queryPostgres(
      `update public.platform_capacity_alerts
       set status='resolved', resolved_at=now(), updated_at=now()
       where signal_key=$1 and status='active'`,
      [input.signalKey]
    );
    await resolvePlatformAdminAlert(`capacity:${input.signalKey}`);
    return;
  }

  await queryPostgres(
    `
    insert into public.platform_capacity_alerts (
      signal_key, status, severity, title, summary, metric_value, threshold_value, metadata_json
    ) values (
      $1, 'active', $2, $3, $4, $5, $6, '{"source":"platform_capacity_monitor"}'::jsonb
    )
    on conflict (signal_key) do update
    set status='active', severity=excluded.severity, title=excluded.title,
        summary=excluded.summary, metric_value=excluded.metric_value,
        threshold_value=excluded.threshold_value, last_seen_at=now(),
        resolved_at=null, updated_at=now(), metadata_json=excluded.metadata_json
    `,
    [input.signalKey, input.severity, input.title, input.summary, input.value, input.threshold]
  );
  await raisePlatformAdminAlert({
    fingerprint: `capacity:${input.signalKey}`,
    family: "capacity",
    type: input.signalKey,
    severity: input.severity === "watch" ? "warning" : input.severity,
    title: input.title,
    body: input.summary,
    actionUrl: "/app/system-health",
    metadata: { metricValue: input.value, thresholdValue: input.threshold },
    notify: input.severity === "high" || input.severity === "critical"
  });
}

function envThresholds(prefix: string, defaults: { watch: number; high: number; critical: number }) {
  const read = (suffix: string, fallback: number) => {
    const value = Number(process.env[`${prefix}_${suffix}`] ?? fallback);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const thresholds = {
    watch: read("WATCH", defaults.watch),
    high: read("HIGH", defaults.high),
    critical: read("CRITICAL", defaults.critical)
  };
  if (thresholds.watch > thresholds.high || thresholds.high > thresholds.critical) return defaults;
  return thresholds;
}

function activeThreshold(severity: CapacitySeverity, thresholds: { watch: number; high: number; critical: number }) {
  if (severity === "critical") return thresholds.critical;
  if (severity === "high") return thresholds.high;
  if (severity === "watch") return thresholds.watch;
  return null;
}

export async function evaluatePlatformCapacity() {
  const result = await queryPostgres<CapacityRow>(
    `
    select
      (select count(*) from pg_stat_activity where datname = current_database()) as database_connections,
      current_setting('max_connections')::int as database_max_connections,
      (select count(*) from public.outbound_action_queue
        where status in ('approved','queued') and coalesce(scheduled_for, created_at) <= now()) as due_actions,
      (select count(*) from public.outbound_action_queue
        where status in ('failed','blocked') and updated_at >= now() - interval '1 hour') as failed_actions,
      (select count(*) from public.app_error_events
        where severity in ('error','critical') and created_at >= now() - interval '15 minutes') as recent_errors
    `
  );

  const row = result?.rows[0];
  const connections = row?.database_connections === null || row?.database_connections === undefined
    ? null
    : Number(row.database_connections);
  const maxConnections = row?.database_max_connections === null || row?.database_max_connections === undefined
    ? null
    : Number(row.database_max_connections);
  const percent = connections !== null && maxConnections && maxConnections > 0
    ? Number(((connections / maxConnections) * 100).toFixed(3))
    : null;
  const status = capacitySeverity(percent);
  const dueActions = Number(row?.due_actions ?? 0);
  const failedActions = Number(row?.failed_actions ?? 0);
  const recentErrors = Number(row?.recent_errors ?? 0);
  const dueThresholds = envThresholds("CAPACITY_DUE_ACTIONS", { watch: 500, high: 2_000, critical: 10_000 });
  const failedThresholds = envThresholds("CAPACITY_FAILED_ACTIONS", { watch: 10, high: 50, critical: 200 });
  const errorThresholds = envThresholds("CAPACITY_RECENT_ERRORS", { watch: 10, high: 50, critical: 200 });
  const dueStatus = countSeverity(dueActions, dueThresholds);
  const failedStatus = countSeverity(failedActions, failedThresholds);
  const errorStatus = countSeverity(recentErrors, errorThresholds);
  const overallStatus = worstSeverity([status, dueStatus, failedStatus, errorStatus]);

  await queryPostgres(
    `
    insert into public.platform_capacity_snapshots (
      database_connections, database_max_connections, database_connection_percent,
      due_action_count, failed_action_count, recent_error_count, status, metadata_json
    ) values ($1,$2,$3,$4,$5,$6,$7,'{"source":"business_automation_loop"}'::jsonb)
    `,
    [connections, maxConnections, percent, dueActions, failedActions, recentErrors, overallStatus]
  );
  await Promise.all([
    reconcileAlert({
      signalKey: "database_connections",
      value: percent,
      severity: status,
      threshold: status === "critical" ? 85 : status === "high" ? 70 : status === "watch" ? 50 : null,
      title: "Database capacity needs attention",
      summary: percent === null ? "Database connection use is unavailable." : `Database connections are at ${percent.toFixed(1)}% of the configured maximum.`
    }),
    reconcileAlert({
      signalKey: "due_outbound_actions",
      value: dueActions,
      severity: dueStatus,
      threshold: activeThreshold(dueStatus, dueThresholds),
      title: "Outbound work is backing up",
      summary: `${dueActions} outbound actions are currently due.`
    }),
    reconcileAlert({
      signalKey: "failed_outbound_actions",
      value: failedActions,
      severity: failedStatus,
      threshold: activeThreshold(failedStatus, failedThresholds),
      title: "Outbound actions need attention",
      summary: `${failedActions} outbound actions failed or were blocked in the last hour.`
    }),
    reconcileAlert({
      signalKey: "recent_application_errors",
      value: recentErrors,
      severity: errorStatus,
      threshold: activeThreshold(errorStatus, errorThresholds),
      title: "Application errors need attention",
      summary: `${recentErrors} error or critical events were recorded in the last 15 minutes.`
    })
  ]);

  return {
    connections,
    maxConnections,
    percent,
    dueActions,
    failedActions,
    recentErrors,
    status: overallStatus,
    signals: { database: status, dueActions: dueStatus, failedActions: failedStatus, recentErrors: errorStatus }
  };
}

export async function getPlatformCapacityDashboard(): Promise<PlatformCapacityDashboard> {
  const [snapshotResult, alertResult] = await Promise.all([
    queryPostgres<{
      database_connections: number | null;
      database_max_connections: number | null;
      database_connection_percent: number | null;
      due_action_count: number;
      failed_action_count: number;
      recent_error_count: number;
      status: CapacitySeverity;
      created_at: Date;
    }>(
      `select database_connections, database_max_connections, database_connection_percent,
              due_action_count, failed_action_count, recent_error_count, status, created_at
       from public.platform_capacity_snapshots
       order by created_at desc
       limit 1`
    ),
    queryPostgres<{
      id: string;
      signal_key: string;
      severity: "watch" | "high" | "critical";
      title: string;
      summary: string;
      metric_value: number | null;
      threshold_value: number | null;
      last_seen_at: Date;
    }>(
      `select id, signal_key, severity, title, summary, metric_value, threshold_value, last_seen_at
       from public.platform_capacity_alerts
       where status = 'active'
       order by case severity when 'critical' then 1 when 'high' then 2 else 3 end, last_seen_at desc`
    )
  ]);

  const row = snapshotResult?.rows[0];
  return {
    latest: row
      ? {
          databaseConnections: row.database_connections === null ? null : Number(row.database_connections),
          databaseMaxConnections: row.database_max_connections === null ? null : Number(row.database_max_connections),
          databaseConnectionPercent: row.database_connection_percent === null ? null : Number(row.database_connection_percent),
          dueActionCount: Number(row.due_action_count),
          failedActionCount: Number(row.failed_action_count),
          recentErrorCount: Number(row.recent_error_count),
          status: row.status,
          createdAt: row.created_at.toISOString()
        }
      : null,
    alerts: (alertResult?.rows ?? []).map((alert) => ({
      id: alert.id,
      signalKey: alert.signal_key,
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      metricValue: alert.metric_value === null ? null : Number(alert.metric_value),
      thresholdValue: alert.threshold_value === null ? null : Number(alert.threshold_value),
      lastSeenAt: alert.last_seen_at.toISOString()
    }))
  };
}
