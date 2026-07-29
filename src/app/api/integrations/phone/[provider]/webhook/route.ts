import { NextRequest, NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { safelyEvaluateAndStoreCallManagementDecision } from "@/lib/office-manager/call-management";
import { getPhoneProvider } from "@/lib/phone/provider-registry";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function uuid(value: unknown) {
  const candidate = text(value);
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerKey } = await params;
  const provider = getPhoneProvider(providerKey);
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unsupported phone connection." }, { status: 404 });
  }

  const rawBody = await request.text();
  const normalized = await provider.receiveWebhook(request.headers, rawBody);
  if (!normalized.ok) {
    const status = normalized.errorCategory.includes("not_configured") ? 503 : 401;
    return NextResponse.json({ ok: false, error: normalized.safeMessage }, { status });
  }

  const event = normalized.data;
  const metadata = event.metadata ?? {};
  let tenantId = uuid(metadata.tenantId);
  if (!tenantId && event.calledNumber) {
    const owner = await queryPostgres<{ tenant_id: string }>(
      `
      select tenant_id
      from public.telephony_numbers
      where provider_key = $1 and phone_number = $2 and status in ('active', 'forwarding_pending')
      limit 1
      `,
      [providerKey, event.calledNumber]
    );
    tenantId = owner?.rows[0]?.tenant_id ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Phone connection could not be matched to a business." }, { status: 400 });
  }

  const idempotencyKey = `${tenantId}:${providerKey}:${event.providerEventId}`;
  const call = await queryPostgres<{ id: string }>(
    `
    with webhook as (
      insert into public.provider_webhook_events (
        tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
        signature_status, processing_status, idempotency_key, payload_redacted_json, metadata_json
      )
      values (
        $1,$2,$3,'phone.call_event','receptionist_call',$4,
        'verified','processed',$5,$6::jsonb,$7::jsonb
      )
      on conflict (idempotency_key) do update
      set processing_status = 'processed', processed_at = now()
      returning id
    )
    insert into public.receptionist_calls (
      tenant_id, provider_key, provider_call_id, direction, caller_number, called_number,
      status, duration_seconds, summary, follow_up_status, usage_units, idempotency_key, metadata_json
    )
    select
      $1,$2,$4,$8,$9,$10,$11,$12,$13,'none',
      case when $12 > 0 then ceil($12::numeric / 60) else 0 end,
      $14,$15::jsonb
    from webhook
    on conflict (provider_key, provider_call_id) do update
    set status = excluded.status,
        duration_seconds = greatest(public.receptionist_calls.duration_seconds, excluded.duration_seconds),
        summary = coalesce(excluded.summary, public.receptionist_calls.summary),
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      providerKey,
      event.providerEventId,
      event.providerCallId,
      idempotencyKey,
      JSON.stringify({
        callerNumberPresent: Boolean(event.callerNumber),
        calledNumberPresent: Boolean(event.calledNumber),
        recordingPresent: Boolean(event.recordingUrl),
        transcriptPresent: Boolean(event.transcriptText)
      }),
      JSON.stringify({ normalizedBy: "ferocity_phone_provider_v1" }),
      text(metadata.direction) === "outbound" ? "outbound" : "inbound",
      event.callerNumber,
      event.calledNumber,
      event.status,
      Math.max(0, Math.round(event.durationSeconds ?? 0)),
      text(metadata.summary) ?? "Phone call received.",
      `${tenantId}:${providerKey}:${event.providerCallId}`,
      JSON.stringify({
        source: "phone_provider_webhook",
        providerEventId: event.providerEventId,
        recordingUrlPresent: Boolean(event.recordingUrl),
        transcriptPresent: Boolean(event.transcriptText)
      })
    ]
  );

  const callId = call?.rows[0]?.id ?? null;
  const callDecision = callId
    ? await safelyEvaluateAndStoreCallManagementDecision({
        tenantId,
        callId,
        additionalSignals: {
          ownerRequested: metadata.ownerRequested === true,
          requestedEmployee: text(metadata.requestedEmployee),
          estimatedValueCents: Number(metadata.estimatedValueCents ?? 0),
          warrantyCall: metadata.warrantyCall === true,
          supplierCall: metadata.supplierCall === true,
          employeeCall: metadata.employeeCall === true,
          vipCustomer: metadata.vipCustomer === true
        }
      })
    : null;

  return NextResponse.json({
    ok: true,
    stored: true,
    callId,
    callDecision: callDecision
      ? {
          priorityClass: callDecision.priorityClass,
          action: callDecision.decision,
          shouldInterruptOwner: callDecision.shouldInterruptOwner,
          callerContext: callDecision.callerContext,
          screeningSummary: callDecision.screeningSummary,
          responseOptions: ["accept", "decline", "voicemail", "return_to_ai", "transfer_employee", "schedule_callback"],
          modeKey: callDecision.modeKey
        }
      : null
  });
}
