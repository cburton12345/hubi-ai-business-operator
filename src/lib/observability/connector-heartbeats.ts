import { queryPostgres } from "@/lib/db/postgres";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";

export async function evaluateConnectorHeartbeatAlerts() {
  const staleSms = await queryPostgres<{ tenant_id: string; id: string }>(`
    update public.ferocity_connect_devices d
       set status='offline',updated_at=now()
      from public.tenants t
     where t.id=d.tenant_id and t.status in ('active','trial')
       and d.status in ('active','paired')
       and coalesce(d.last_heartbeat_at,d.created_at) < now()-interval '10 minutes'
    returning d.tenant_id,d.id
  `);
  for (const row of staleSms?.rows ?? []) {
    const alert = await queryPostgres<{ metadata_json: Record<string, unknown> | null }>(`
      insert into public.operator_alerts
        (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
      values ($1,$2,'integration','high','active','Ferocity Connect phone is offline',
        'The Android SMS gateway has not checked in for more than ten minutes. New texts may wait until it reconnects.',
        '/app/integrations/ferocity-connect',$3::jsonb)
      on conflict (tenant_id,alert_key) do update set status='active',summary=excluded.summary,
        last_seen_at=now(),resolved_at=null,updated_at=now()
      returning metadata_json
    `, [row.tenant_id, `ferocity-connect:${row.id}:offline`, JSON.stringify({ deviceId: row.id, detectedBy: "connector_heartbeat_watchdog" })]);
    const metadata = alert?.rows[0]?.metadata_json ?? {};
    const previousPushAt = typeof metadata.lastPushAt === "string" ? new Date(metadata.lastPushAt).getTime() : Number.NaN;
    const notificationDue = !Number.isFinite(previousPushAt) || Date.now() - previousPushAt >= 6 * 60 * 60 * 1000;
    if (notificationDue) {
      const preferences = await getPushNotificationPreferences(row.tenant_id);
      if (pushPreferencesAllowEvent({
        preferences,
        severity: "high",
        status: "needs_owner",
        ownerAttention: true,
        moneyCents: 0,
        riskType: "automation",
      })) {
        const pushed = await sendWorkspacePushNotifications({
          tenantId: row.tenant_id,
          eventType: "integration.ferocity_connect.offline",
          title: "Ferocity Connect phone is offline",
          body: "The Android SMS gateway has not checked in for more than ten minutes. New texts are waiting for recovery.",
          url: "/app/integrations/ferocity-connect",
          tag: `ferocity-connect-${row.id}-offline`,
          metadata: { deviceId: row.id, severity: "high", riskType: "automation" },
        });
        await queryPostgres(
          `update public.operator_alerts
           set metadata_json=metadata_json || $3::jsonb,updated_at=now()
           where tenant_id=$1 and alert_key=$2`,
          [row.tenant_id, `ferocity-connect:${row.id}:offline`, JSON.stringify({
            lastPushAt: new Date().toISOString(),
            lastPushResult: pushed,
          })],
        );
      }
    }
  }
  await queryPostgres(`
    update public.operator_alerts a set status='resolved',resolved_at=now(),updated_at=now()
    where a.alert_key like 'ferocity-connect:%:offline' and a.status='active'
      and exists (
        select 1 from public.ferocity_connect_devices d
        where d.tenant_id=a.tenant_id and a.alert_key=concat('ferocity-connect:',d.id::text,':offline')
          and d.last_heartbeat_at >= now()-interval '5 minutes'
      )
  `);

  const staleFacebook = await queryPostgres<{ tenant_id: string; identity_id: string }>(`
    select s.tenant_id,s.identity_id from public.growth_connector_sessions s
    join public.tenants t on t.id=s.tenant_id and t.status in ('active','trial')
    where s.status='active' and s.expires_at>now()
    group by s.tenant_id,s.identity_id
    having max(coalesce(s.last_seen_at,s.paired_at,s.issued_at)) < now()-interval '15 minutes'
    limit 500
  `);
  for (const row of staleFacebook?.rows ?? []) {
    await queryPostgres(`
      insert into public.operator_alerts
        (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
      values ($1,$2,'integration','medium','active','Facebook connector is offline',
        'No connector heartbeat has arrived for more than fifteen minutes. Facebook observation and approved replies may be delayed.',
        '/app/growth',$3::jsonb)
      on conflict (tenant_id,alert_key) do update set status='active',summary=excluded.summary,
        last_seen_at=now(),resolved_at=null,updated_at=now()
    `, [row.tenant_id, `facebook-connector:${row.identity_id}:offline`, JSON.stringify({ identityId: row.identity_id, detectedBy: "connector_heartbeat_watchdog" })]);
  }
  await queryPostgres(`
    update public.operator_alerts a set status='resolved',resolved_at=now(),updated_at=now()
    where a.alert_key like 'facebook-connector:%:offline' and a.status='active'
      and exists (
        select 1 from public.growth_connector_sessions s
        where s.tenant_id=a.tenant_id and a.alert_key=concat('facebook-connector:',s.identity_id::text,':offline')
          and s.status='active' and s.expires_at>now() and s.last_seen_at>=now()-interval '10 minutes'
      )
  `);
  return { staleSmsDevices: staleSms?.rows.length ?? 0, staleFacebookIdentities: staleFacebook?.rows.length ?? 0 };
}
