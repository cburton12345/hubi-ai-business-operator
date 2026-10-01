import { queryPostgres } from "@/lib/db/postgres";
import { scheduledTimeIsAllowed } from "@/lib/messaging/scheduled-message";

const OPEN_STATUSES = ["needs_review", "approved", "queued", "failed", "blocked"] as const;

export class ConnectScheduledTextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function listConnectScheduledTexts(tenantId: string) {
  const result = await queryPostgres<{
    id: string;
    recipient_label: string;
    body: string;
    status: string;
    scheduled_for: Date;
  }>(
    `select id,recipient_label,coalesce(payload_json->>'body','') as body,status,scheduled_for
     from public.outbound_action_queue
     where tenant_id=$1 and action_type='sms_send' and provider_key='ferocity_connect'
       and target_type='scheduled_message' and status = any($2::text[])
     order by scheduled_for asc limit 50`,
    [tenantId, [...OPEN_STATUSES]]
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    recipient: row.recipient_label,
    body: row.body,
    status: row.status,
    scheduledFor: row.scheduled_for.toISOString()
  }));
}

export async function createConnectScheduledText(input: {
  tenantId: string;
  deviceId: string;
  recipient: string;
  body: string;
  scheduledFor: Date;
  deviceTimeZone: string;
}) {
  const now = new Date();
  if (!scheduledTimeIsAllowed(input.scheduledFor, now)) {
    throw new ConnectScheduledTextError(400, "Choose a future time within the next year.");
  }
  const [provider, permission] = await Promise.all([
    queryPostgres<{ id: string }>(
      `select a.id from public.tenant_messaging_accounts a
       join public.messaging_providers p on p.tenant_id=a.tenant_id and p.provider_key=a.provider_key
       where a.tenant_id=$1 and a.provider_key='ferocity_connect' and p.supports_sms=true
         and a.connection_status in ('active','configured') and a.credentials_status='configured'
         and a.live_sending_enabled=true and a.outbound_enabled=true and a.emergency_paused=false
       limit 1`,
      [input.tenantId]
    ),
    queryPostgres<{ granted: boolean; suppressed: boolean }>(
      `select
        exists(select 1 from public.contact_consent_records where tenant_id=$1 and channel='sms'
          and lower(contact_value)=lower($2) and status='granted') as granted,
        exists(select 1 from public.contact_suppression_list where tenant_id=$1 and channel='sms'
          and lower(contact_value)=lower($2) and active=true) as suppressed`,
      [input.tenantId, input.recipient]
    )
  ]);
  if (!provider?.rows[0]) {
    throw new ConnectScheduledTextError(409, "Ferocity Connect live sending is not enabled for this workspace.");
  }
  if (permission?.rows[0]?.suppressed) {
    throw new ConnectScheduledTextError(409, "This recipient opted out or is suppressed.");
  }
  if (!permission?.rows[0]?.granted) {
    throw new ConnectScheduledTextError(409, "SMS consent must be recorded before this message can be scheduled.");
  }

  const inserted = await queryPostgres<{ id: string }>(
    `insert into public.outbound_action_queue (
      tenant_id,action_type,provider_key,status,risk_level,target_type,subject,recipient_label,
      scheduled_for,payload_json,policy_id,approved_at,metadata_json
    ) values (
      $1,'sms_send','ferocity_connect','approved','medium','scheduled_message','Scheduled text',$2,
      $3,$4::jsonb,(select id from public.live_action_policies where tenant_id=$1 and action_key='sms_send' limit 1),
      now(),$5::jsonb
    ) returning id`,
    [
      input.tenantId,
      input.recipient,
      input.scheduledFor.toISOString(),
      JSON.stringify({ body: input.body }),
      JSON.stringify({
        source: "ferocity_connect_android",
        userScheduled: true,
        approvedFromPairedDevice: true,
        deviceId: input.deviceId,
        deviceTimeZone: input.deviceTimeZone,
        aiGenerated: false,
        messagePurpose: "transactional"
      })
    ]
  );
  const id = inserted?.rows[0]?.id;
  if (!id) throw new ConnectScheduledTextError(500, "Ferocity could not save this scheduled message.");
  return { id, scheduledFor: input.scheduledFor.toISOString(), status: "approved" };
}

export async function cancelConnectScheduledText(input: { tenantId: string; deviceId: string; id: string }) {
  const result = await queryPostgres<{ id: string }>(
    `update public.outbound_action_queue set status='canceled',processed_at=now(),
       metadata_json=metadata_json || $4::jsonb,updated_at=now()
     where tenant_id=$1 and id=$2 and provider_key='ferocity_connect' and target_type='scheduled_message'
       and status = any($3::text[])
     returning id`,
    [input.tenantId, input.id, [...OPEN_STATUSES], JSON.stringify({
      canceledAt: new Date().toISOString(), canceledFrom: "ferocity_connect_android", deviceId: input.deviceId
    })]
  );
  if (!result?.rows[0]) throw new ConnectScheduledTextError(404, "This scheduled message is no longer available to cancel.");
}
