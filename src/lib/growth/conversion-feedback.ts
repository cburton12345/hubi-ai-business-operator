import { createHash } from "node:crypto";
import { decryptSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";

type QueueRow = {
  id: string; tenant_id: string; brand_id: string | null; event_type: string; idempotency_key: string;
  payload_json: Record<string, unknown>; consent_checked: boolean;
};

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function metaEventName(eventType: string) {
  return ({ conversation_started: "Contact", reply_received: "Lead", qualified_lead: "Lead", appointment_booked: "Schedule",
    estimate_sent: "InitiateCheckout", estimate_accepted: "SubmitApplication", sale_closed: "Purchase", job_completed: "CompleteRegistration",
    payment_collected: "Purchase", review_created: "Other" } as Record<string, string>)[eventType] ?? "Other";
}

async function credential(tenantId: string, providerKey: string, label: string) {
  const result = await queryPostgres<{ encrypted_secret: string; encryption_iv: string; encryption_tag: string }>(
    `select encrypted_secret,encryption_iv,encryption_tag from public.tenant_provider_credentials
     where tenant_id=$1 and provider_key=$2 and credential_label=$3 and status='configured' limit 1`,
    [tenantId, providerKey, label]
  );
  const row = result?.rows[0];
  return row ? decryptSecret({ encryptedSecret: row.encrypted_secret, encryptionIv: row.encryption_iv, encryptionTag: row.encryption_tag }) : null;
}

export async function dispatchConversionFeedbackBatch(options: { limit?: number; fetchImpl?: typeof fetch } = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const fetchImpl = options.fetchImpl ?? fetch;
  const queue = await queryPostgres<QueueRow>(
    `select id,tenant_id,brand_id,event_type,idempotency_key,payload_json,consent_checked
     from public.revenue_conversion_event_queue
     where status in ('approved','queued') and (next_attempt_at is null or next_attempt_at<=now())
     order by created_at limit $1`, [limit]
  );
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const event of queue?.rows ?? []) {
    let eventSent = 0;
    let eventFailed = 0;
    const destinations = await queryPostgres<{ id: string; provider_key: string; config_json: Record<string, unknown>; requires_manual_approval: boolean }>(
      `select id,provider_key,config_json,requires_manual_approval from public.conversion_feedback_destinations
       where tenant_id=$1 and (brand_id=$2 or brand_id is null) and status='active' and $3=any(supported_event_types)`,
      [event.tenant_id, event.brand_id, event.event_type]
    );
    if (!(destinations?.rows.length ?? 0)) { skipped += 1; continue; }
    for (const destination of destinations?.rows ?? []) {
      const eventId = `${destination.provider_key}:${event.idempotency_key}`;
      if (destination.requires_manual_approval && !["approved","queued"].includes((await queryPostgres<{ status: string }>(`select status from public.revenue_conversion_event_queue where tenant_id=$1 and id=$2`, [event.tenant_id,event.id]))?.rows[0]?.status ?? "")) {
        skipped += 1; continue;
      }
      if (destination.provider_key !== "meta") { skipped += 1; continue; }
      const pixelId = String(destination.config_json.pixelId ?? "");
      const apiVersion = String(destination.config_json.apiVersion ?? "");
      const accessToken = await credential(event.tenant_id, "facebook", "capi_access_token");
      if (!pixelId || !apiVersion || !accessToken) {
        await queryPostgres(
          `update public.conversion_feedback_destinations
           set status='error',last_error='Meta conversion feedback needs a pixel ID, API version, and capi_access_token credential.',updated_at=now()
           where tenant_id=$1 and id=$2`,
          [event.tenant_id, destination.id]
        );
        eventFailed += 1;
        failed += 1;
        continue;
      }
      const payload = event.payload_json;
      const userData = {
        ...(typeof payload.email === "string" && event.consent_checked ? { em: [sha256(payload.email)] } : {}),
        ...(typeof payload.phone === "string" && event.consent_checked ? { ph: [sha256(payload.phone.replace(/\D/g, ""))] } : {}),
        ...(typeof payload.fbc === "string" ? { fbc: payload.fbc } : {}),
        ...(typeof payload.fbp === "string" ? { fbp: payload.fbp } : {}),
        ...(typeof payload.externalId === "string" ? { external_id: [sha256(payload.externalId)] } : {})
      };
      const requestBody = { data: [{ event_name: metaEventName(event.event_type), event_time: Math.floor(Date.now()/1000), event_id: eventId,
        action_source: "business_messaging", user_data: userData,
        custom_data: { currency: String(payload.currency ?? "USD"), ...(Number.isFinite(Number(payload.value)) ? { value: Number(payload.value) } : {}) } }] };
      const delivery = await queryPostgres<{ id: string }>(
        `insert into public.conversion_feedback_deliveries
          (tenant_id,queue_event_id,destination_id,provider_key,event_id,status,request_json,attempts)
         values ($1,$2,$3,'meta',$4,'sending',$5::jsonb,1)
         on conflict (tenant_id,destination_id,event_id) do update set status='sending',attempts=public.conversion_feedback_deliveries.attempts+1,
           request_json=excluded.request_json,updated_at=now() returning id`,
        [event.tenant_id,event.id,destination.id,eventId,JSON.stringify({ ...requestBody, accessTokenRedacted: true })]
      );
      try {
        const response = await fetchImpl(`https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody), cache: "no-store"
        });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) throw new Error(`Meta conversion feedback failed (${response.status}).`);
        await queryPostgres(`update public.conversion_feedback_deliveries set status='sent',response_json=$3::jsonb,sent_at=now(),error_message=null,updated_at=now() where tenant_id=$1 and id=$2`, [event.tenant_id,delivery?.rows[0]?.id,JSON.stringify(body)]);
        eventSent += 1;
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conversion feedback failed.";
        await queryPostgres(`update public.conversion_feedback_deliveries set status=case when attempts>=5 then 'failed' else 'retry' end,error_message=$3,next_attempt_at=now()+make_interval(mins=>least(1440,power(2,least(attempts,10))::int)),updated_at=now() where tenant_id=$1 and id=$2`, [event.tenant_id,delivery?.rows[0]?.id,message]);
        eventFailed += 1;
        failed += 1;
      }
    }
    if (eventFailed > 0) {
      await queryPostgres(
        `update public.revenue_conversion_event_queue
         set status=case when attempts>=4 then 'failed' else 'queued' end,
           attempts=attempts+1,next_attempt_at=now()+make_interval(mins=>least(1440,power(2,least(attempts+1,10))::int)),
           error_message='One or more conversion destinations failed.',updated_at=now()
         where tenant_id=$1 and id=$2`,
        [event.tenant_id, event.id]
      );
    } else if (eventSent > 0) {
      await queryPostgres(
        `update public.revenue_conversion_event_queue
         set status='sent',sent_at=now(),next_attempt_at=null,error_message=null,updated_at=now()
         where tenant_id=$1 and id=$2`,
        [event.tenant_id, event.id]
      );
    }
  }
  return { examined: queue?.rows.length ?? 0, sent, skipped, failed };
}
