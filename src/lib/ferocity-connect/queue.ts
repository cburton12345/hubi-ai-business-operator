import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import type { MessagingSendInput, MessagingSendResult } from "@/lib/messaging/types";

export async function enqueueConnectSms(input: MessagingSendInput): Promise<MessagingSendResult> {
  if (input.attachments?.length) {
    return { ok: false, providerKey: "ferocity_connect", status: 400, error: "Ferocity Connect currently supports SMS text only.", retryable: false };
  }
  const idempotencyKey = input.idempotencyKey ?? input.queueId;
  if (!idempotencyKey) {
    return { ok: false, providerKey: "ferocity_connect", status: 400, error: "An idempotency key is required.", retryable: false };
  }
  const result = await queryPostgres<{ id: string }>(
    `insert into public.ferocity_connect_jobs (tenant_id,message_id,requested_device_id,sim_subscription_id,recipient,body,idempotency_key,metadata_json)
     select $1,m.id,
       (select d.id from public.ferocity_connect_devices d where d.tenant_id=$1
         and d.id=case when ($5::jsonb->>'deviceId') ~* '^[0-9a-f-]{36}$' then ($5::jsonb->>'deviceId')::uuid else null end limit 1),
       case when ($5::jsonb->>'simSubscriptionId') ~ '^[0-9]+$' then ($5::jsonb->>'simSubscriptionId')::int else null end,
       $2,$3,$4,$5::jsonb
     from public.messages m
     where m.tenant_id=$1 and m.idempotency_key=$4
     on conflict (tenant_id,idempotency_key) do update set updated_at=now()
     returning id`,
    [input.tenantId, input.to, input.body, idempotencyKey, JSON.stringify(input.metadata ?? {})]
  );
  const row = result?.rows[0];
  return row
    ? { ok: true, providerKey: "ferocity_connect", providerMessageId: row.id, status: "queued", metadata: { transport: "android_sim" } }
    : { ok: false, providerKey: "ferocity_connect", status: 503, error: "The device queue is unavailable.", retryable: true };
}

export async function claimNextConnectJob(identity: { tenantId: string; deviceId: string; sendingEnabled: boolean; deviceStatus: string }) {
  if (!identity.sendingEnabled || !["paired", "active"].includes(identity.deviceStatus)) return null;
  return withPostgresTransaction(async (client) => {
    const device = await client.query<{ max_per_minute: number; max_per_hour: number; max_per_day: number }>(
      `select max_per_minute,max_per_hour,max_per_day from public.ferocity_connect_devices
       where id=$1 and tenant_id=$2 and status in ('paired','active') for update`,
      [identity.deviceId, identity.tenantId]
    );
    const limits = device.rows[0];
    if (!limits) return null;
    await client.query(
      `update public.ferocity_connect_jobs set status='queued',claimed_by_device_id=null,lease_expires_at=null,
       available_at=now(),updated_at=now(),last_error_code='lease_expired',last_error_safe='The previous device lease expired before completion.'
       where tenant_id=$1 and status='claimed' and lease_expires_at<now()`,
      [identity.tenantId]
    );
    const usage = await client.query<{ minute_count: string; hour_count: string; day_count: string }>(
      `select count(*) filter (where sent_at>now()-interval '1 minute')::text minute_count,
        count(*) filter (where sent_at>now()-interval '1 hour')::text hour_count,
        count(*) filter (where sent_at>now()-interval '1 day')::text day_count
       from public.ferocity_connect_jobs where claimed_by_device_id=$1 and status in ('sent','delivered')`,
      [identity.deviceId]
    );
    const count = usage.rows[0];
    if (Number(count.minute_count) >= limits.max_per_minute || Number(count.hour_count) >= limits.max_per_hour || Number(count.day_count) >= limits.max_per_day) return null;

    const job = await client.query<{
      id: string; recipient: string; body: string; sim_subscription_id: number | null; attempt_count: number; idempotency_key: string;
    }>(
      `with candidate as (
         select j.id from public.ferocity_connect_jobs j
         where j.tenant_id=$1 and j.status in ('queued','failed_retryable') and j.available_at<=now()
           and (j.requested_device_id is null or j.requested_device_id=$2)
           and (j.attempt_count < j.max_attempts)
         order by j.created_at for update skip locked limit 1
       )
       update public.ferocity_connect_jobs j set status='claimed',claimed_by_device_id=$2,
         lease_expires_at=now()+interval '2 minutes',attempt_count=attempt_count+1,updated_at=now()
       from candidate where j.id=candidate.id
       returning j.id,j.recipient,j.body,j.sim_subscription_id,j.attempt_count,j.idempotency_key`,
      [identity.tenantId, identity.deviceId]
    );
    const row = job.rows[0];
    if (row) await client.query(
      `insert into public.ferocity_connect_events (tenant_id,device_id,job_id,event_type,safe_detail)
       values ($1,$2,$3,'claimed','Outbound SMS job claimed by device.')`,
      [identity.tenantId, identity.deviceId, row.id]
    );
    return row ?? null;
  });
}
