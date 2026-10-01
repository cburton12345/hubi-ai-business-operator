import { queryPostgres } from "@/lib/db/postgres";
import { localPresenceEventKey, recommendedLocalDestinations } from "./engine";

export async function recordLocalPresenceEvent(input: {
  tenantId: string;
  brandId: string;
  eventType: "job_completed" | "photo_added" | "promotion_created" | "service_changed" | "hours_changed" | "location_changed" | "review_received" | "profile_stale" | "manual";
  sourceTable?: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  const idempotencyKey = localPresenceEventKey(input.tenantId, input.eventType, input.sourceTable ?? null, input.sourceId ?? null);
  const result = await queryPostgres<{ id: string }>(
    `insert into public.local_presence_events
      (tenant_id,brand_id,event_type,source_table,source_id,status,event_payload_json,recommended_destinations,idempotency_key,occurred_at)
     values ($1,$2,$3,$4,$5::uuid,'new',$6::jsonb,$7::text[],$8,$9)
     on conflict (tenant_id,idempotency_key) do update set event_payload_json=public.local_presence_events.event_payload_json || excluded.event_payload_json,updated_at=now()
     returning id`,
    [input.tenantId, input.brandId, input.eventType, input.sourceTable ?? null, input.sourceId ?? null,
      JSON.stringify(input.payload ?? {}), recommendedLocalDestinations(input.eventType), idempotencyKey, input.occurredAt ?? new Date()]
  );
  return result?.rows[0]?.id ?? null;
}

/** Discovers real completed work; it does not manufacture a public post. */
export async function syncCompletedJobLocalPresenceEvents(tenantId: string) {
  const result = await queryPostgres<{ id: string }>(
    `insert into public.local_presence_events
      (tenant_id,brand_id,event_type,source_table,source_id,status,event_payload_json,recommended_destinations,idempotency_key,occurred_at)
     select j.tenant_id,j.brand_id,'job_completed','service_jobs',j.id,'new',
       jsonb_build_object('jobTitle',j.title,'customerId',j.customer_id,'proofRequired',true,'publicContentPrepared',false),
       array['google_business_profile','apple_business_connect','bing_places']::text[],
       'local-presence:' || md5(concat_ws(':',j.tenant_id::text,'job_completed','service_jobs',j.id::text)),
       coalesce(j.updated_at,j.created_at)
     from public.service_jobs j
     where j.tenant_id=$1 and j.status='completed'
       and not exists (select 1 from public.local_presence_events e where e.tenant_id=j.tenant_id and e.source_table='service_jobs' and e.source_id=j.id and e.event_type='job_completed')
     order by j.updated_at desc limit 100
     on conflict (tenant_id,idempotency_key) do nothing returning id`,
    [tenantId]
  );
  return result?.rowCount ?? 0;
}
