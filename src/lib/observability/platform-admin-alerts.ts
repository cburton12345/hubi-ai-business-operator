import { queryPostgres } from "@/lib/db/postgres";
import { sendFerocityNotificationEmail } from "@/lib/email/transactional";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";

export type PlatformAdminAlertSeverity = "info" | "warning" | "high" | "critical";

export async function raisePlatformAdminAlert(input: {
  fingerprint: string;
  family: string;
  type: string;
  severity: PlatformAdminAlertSeverity;
  title: string;
  body: string;
  tenantId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  notify?: boolean;
}) {
  const existing = await queryPostgres<{ severity: PlatformAdminAlertSeverity; last_notified_at: string | null }>(
    `select severity, last_notified_at from public.platform_admin_alerts where fingerprint=$1 limit 1`,
    [input.fingerprint]
  );
  const previous = existing?.rows[0];
  const severityRank = { info: 0, warning: 1, high: 2, critical: 3 };
  const lastNotified = previous?.last_notified_at ? new Date(previous.last_notified_at).getTime() : 0;
  const shouldNotify = input.notify !== false && (
    !previous || severityRank[input.severity] > severityRank[previous.severity] || Date.now() - lastNotified > 6 * 60 * 60_000
  );

  await queryPostgres(
    `insert into public.platform_admin_alerts
     (tenant_id, fingerprint, alert_family, alert_type, severity, title, body, action_url, metadata_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     on conflict (fingerprint) do update set
       tenant_id=coalesce(excluded.tenant_id, public.platform_admin_alerts.tenant_id),
       severity=excluded.severity, status='active', title=excluded.title, body=excluded.body,
       action_url=coalesce(excluded.action_url, public.platform_admin_alerts.action_url),
       occurrence_count=public.platform_admin_alerts.occurrence_count+1, last_seen_at=now(), resolved_at=null,
       metadata_json=public.platform_admin_alerts.metadata_json || excluded.metadata_json, updated_at=now()`,
    [input.tenantId ?? null, input.fingerprint, input.family, input.type, input.severity, input.title, input.body, input.actionUrl ?? null, JSON.stringify(input.metadata ?? {})]
  );

  if (shouldNotify) {
    const admins = await queryPostgres<{ id: string }>(
      `select id from public.users where platform_role = 'super_admin' limit 10`
    );
    const [emailResult, ...pushResults] = await Promise.all([
      sendFerocityNotificationEmail({
        subject: `[${input.severity.toUpperCase()}] ${input.title}`,
        text: [input.body, input.tenantId ? `Workspace: ${input.tenantId}` : null, input.actionUrl ? `Open: ${input.actionUrl}` : null].filter(Boolean).join("\n\n"),
        eventKey: `platform-alert:${input.fingerprint}:${input.severity}`,
        tenantId: input.tenantId,
        metadata: input.metadata
      }),
      ...(admins?.rows ?? []).map((admin) => sendWorkspacePushNotifications({
        tenantId: input.tenantId ?? "11111111-1111-4111-8111-111111111111",
        recipientUserId: admin.id,
        eventType: `platform.${input.type}`,
        title: input.title,
        body: input.body,
        url: input.actionUrl ?? "/app/system-health",
        tag: `platform-${input.fingerprint}`,
        metadata: { severity: input.severity, ...(input.metadata ?? {}) }
      }))
    ]);
    if (emailResult.ok || pushResults.some((result) => result.sent > 0)) {
      await queryPostgres(`update public.platform_admin_alerts set last_notified_at=now(), updated_at=now() where fingerprint=$1`, [input.fingerprint]);
    }
  }
}

export async function resolvePlatformAdminAlert(fingerprint: string) {
  await queryPostgres(
    `update public.platform_admin_alerts set status='resolved', resolved_at=now(), updated_at=now() where fingerprint=$1 and status <> 'resolved'`,
    [fingerprint]
  );
}

export async function getActivePlatformAdminAlerts() {
  const result = await queryPostgres<{
    id: string; fingerprint: string; severity: PlatformAdminAlertSeverity; title: string; body: string;
    action_url: string | null; occurrence_count: number; last_seen_at: Date;
  }>(
    `select id, fingerprint, severity, title, body, action_url, occurrence_count, last_seen_at
     from public.platform_admin_alerts where status='active'
     order by case severity when 'critical' then 1 when 'high' then 2 when 'warning' then 3 else 4 end, last_seen_at desc
     limit 100`
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id, fingerprint: row.fingerprint, severity: row.severity, title: row.title, body: row.body,
    actionUrl: row.action_url, occurrenceCount: row.occurrence_count, lastSeenAt: row.last_seen_at.toISOString()
  }));
}
