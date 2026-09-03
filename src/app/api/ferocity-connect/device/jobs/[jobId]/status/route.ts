import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { recordMessageDeliveryReceipt, type NormalizedDeliveryStatus } from "@/lib/messaging/message-health";
import { postH4rCallback } from "@/lib/integrations/h4r/callback";

const schema = z.object({
  eventId: z.string().min(8).max(160), status: z.enum(["sending","sent","delivered","failed_retryable","failed_terminal"]),
  errorCode: z.string().max(80).nullable().optional(), safeError: z.string().max(300).nullable().optional(),
  occurredAt: z.string().datetime().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const [{ jobId }, parsed] = await Promise.all([params, request.json().catch(() => null).then((body) => schema.safeParse(body))]);
  if (!z.string().uuid().safeParse(jobId).success || !parsed.success) return NextResponse.json({ ok: false, error: "Invalid status event." }, { status: 400 });
  const existing = await queryPostgres<{ id: string }>(
    `select id from public.ferocity_connect_events where device_id=$1 and device_event_id=$2 limit 1`,
    [auth.identity.deviceId, parsed.data.eventId]
  );
  if (existing?.rows[0]) return NextResponse.json({ ok: true, duplicate: true });
  const terminalFailure = parsed.data.status === "failed_terminal";
  const retryableFailure = parsed.data.status === "failed_retryable";
  const job = await queryPostgres<{ id: string; attempt_count: number; max_attempts: number; metadata_json: Record<string, unknown> | null }>(
    `update public.ferocity_connect_jobs set
       status=case when $4='failed_retryable' and attempt_count>=max_attempts then 'dead_letter' else $4 end,
       available_at=case when $4='failed_retryable' then now()+(least(300,power(2,attempt_count)::int*5)::text || ' seconds')::interval else available_at end,
       lease_expires_at=null,last_error_code=$5,last_error_safe=$6,
       sent_at=case when $4 in ('sent','delivered') then coalesce(sent_at,now()) else sent_at end,
       delivered_at=case when $4='delivered' then now() else delivered_at end,updated_at=now()
     where id=$1 and tenant_id=$2 and claimed_by_device_id=$3 and status not in ('delivered','canceled','dead_letter')
     returning id,attempt_count,max_attempts,metadata_json`,
    [jobId, auth.identity.tenantId, auth.identity.deviceId, parsed.data.status, parsed.data.errorCode ?? null, parsed.data.safeError ?? null]
  );
  if (!job?.rows[0]) return NextResponse.json({ ok: false, error: "Job not found or status is final." }, { status: 404 });
  await queryPostgres(
    `insert into public.ferocity_connect_events (tenant_id,device_id,job_id,event_type,device_event_id,safe_detail,metadata_json)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (device_id,device_event_id) do nothing`,
    [auth.identity.tenantId, auth.identity.deviceId, jobId, retryableFailure || terminalFailure ? "failed" : parsed.data.status,
      parsed.data.eventId, parsed.data.safeError ?? null, JSON.stringify({ errorCode: parsed.data.errorCode ?? null })]
  );
  const normalized: NormalizedDeliveryStatus = parsed.data.status === "failed_retryable" || parsed.data.status === "failed_terminal"
    ? "failed" : parsed.data.status;
  await recordMessageDeliveryReceipt({
    tenantId: auth.identity.tenantId, providerKey: "ferocity_connect", providerMessageId: jobId,
    providerEventId: parsed.data.eventId, normalizedStatus: normalized, rawStatus: parsed.data.status,
    errorCode: parsed.data.errorCode, safeReason: parsed.data.safeError,
    receiptAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
    isFinal: normalized === "delivered" || terminalFailure,
    metadata: { deviceId: auth.identity.deviceId }
  });
  const metadata = job.rows[0].metadata_json ?? {};
  if (metadata.source === "h4r") {
    await postH4rCallback({ tenantId: auth.identity.tenantId,
      callbackUrl: typeof metadata.h4rCallbackUrl === "string" ? metadata.h4rCallbackUrl : null, payload: {
      event_type: "delivery_status",
      event_id: parsed.data.eventId,
      workspace_id: metadata.h4rWorkspaceId ?? null,
      sms_outbox_id: metadata.h4rSmsOutboxId ?? null,
      provider_message_ref: jobId,
      ferocity_message_ref: jobId,
      status: parsed.data.status,
      occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
      error_code: parsed.data.errorCode ?? null,
      safe_error: parsed.data.safeError ?? null
    }});
  }
  if (normalized === "delivered") await queryPostgres(`update public.ferocity_connect_devices set consecutive_failures=0,last_success_at=now(),updated_at=now() where id=$1`, [auth.identity.deviceId]);
  if (retryableFailure || terminalFailure) {
    const health = await queryPostgres<{ consecutive_failures: number }>(
      `update public.ferocity_connect_devices set consecutive_failures=consecutive_failures+1,
       status=case when consecutive_failures+1>=5 then 'needs_attention' else status end,updated_at=now()
       where id=$1 returning consecutive_failures`, [auth.identity.deviceId]
    );
    if ((health?.rows[0]?.consecutive_failures ?? 0) >= 5) {
      await queryPostgres(
        `insert into public.operator_alerts (tenant_id,alert_key,category,severity,status,title,summary,action_href,metadata_json)
         values ($1,$2,'integration','high','active','Android SMS gateway needs attention',
           'Ferocity paused new claims after repeated device or carrier failures.','/app/integrations/ferocity-connect',$3::jsonb)
         on conflict (tenant_id,alert_key) do update set status='active',last_seen_at=now(),resolved_at=null,updated_at=now()`,
        [auth.identity.tenantId, `ferocity-connect:${auth.identity.deviceId}:health`, JSON.stringify({ deviceId: auth.identity.deviceId })]
      );
    }
  }
  return NextResponse.json({ ok: true });
}
