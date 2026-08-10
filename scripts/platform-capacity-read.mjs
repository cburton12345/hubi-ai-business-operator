import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(`
    select
      (select count(*)::int from pg_stat_activity where datname = current_database()) as database_connections,
      current_setting('max_connections')::int as database_max_connections,
      (select count(*)::int from public.outbound_action_queue where status in ('approved','queued') and coalesce(scheduled_for, created_at) <= now()) as due_actions,
      (select count(*)::int from public.outbound_action_queue where status in ('failed','blocked') and updated_at >= now() - interval '1 hour') as failed_actions,
      (select count(*)::int from public.app_error_events where severity in ('error','critical') and created_at >= now() - interval '15 minutes') as recent_errors,
      (select count(*)::int from public.platform_capacity_alerts where status='active') as active_alerts
  `);
  const row = result.rows[0];
  const percent = Number(((row.database_connections / Math.max(1, row.database_max_connections)) * 100).toFixed(1));
  const status = percent >= 85 || row.due_actions >= 10_000 || row.failed_actions >= 200 || row.recent_errors >= 200
    ? "critical"
    : percent >= 70 || row.due_actions >= 2_000 || row.failed_actions >= 50 || row.recent_errors >= 50
      ? "high"
      : percent >= 50 || row.due_actions >= 500 || row.failed_actions >= 10 || row.recent_errors >= 10
        ? "watch"
        : "healthy";
  console.log(JSON.stringify({
    status,
    databaseConnections: row.database_connections,
    databaseMaxConnections: row.database_max_connections,
    databaseConnectionPercent: percent,
    dueActions: row.due_actions,
    failedActionsLastHour: row.failed_actions,
    recentErrorsLast15Minutes: row.recent_errors,
    activeAlerts: row.active_alerts
  }, null, 2));
  if (status === "critical") process.exitCode = 2;
} finally {
  await client.end();
}
