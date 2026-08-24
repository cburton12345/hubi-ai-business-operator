import { NextRequest, NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { syncCustomerLifecycleForTenant } from "@/lib/customer-lifecycle/sync-customer-lifecycle";
import { safelyEvaluateAndStoreCallManagementDecision } from "@/lib/office-manager/call-management";
import { findVoiceAgentProviderForWebhook, verifyRetellSignature } from "@/lib/providers/voice-adapters";
import { recordVoiceUsage } from "@/lib/usage/managed-voice";
import { voiceWebhookBodyFromEvent } from "@/lib/phone/voice-webhook-event";
import { canonicalizeVoiceDisposition, reconcileCallContact } from "@/lib/phone/call-contact-reconciliation";
import { orchestrateCompletedCall } from "@/lib/phone/post-call-orchestration";
import { createVoiceAppointment } from "@/lib/phone/voice-scheduling";
import { safelyEnqueueExternalCallLogHandoffs } from "@/lib/integrations/call-log/enqueue";
import { recordCapabilityDeliveryEvidence } from "@/lib/reliability/capability-runtime";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized voice webhook." }, { status: 401 });
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.slice(0, 500) : null;
}

function safeLongString(value: unknown, max = 100_000) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeUuid(value: unknown) {
  const candidate = safeString(value);
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function cleanStatus(value: unknown) {
  const status = safeString(value);
  if (
    status &&
    ["received", "ringing", "in_progress", "completed", "missed", "transferred", "failed", "spam", "blocked"].includes(status)
  ) {
    return status;
  }
  return "received";
}

function cleanDirection(value: unknown) {
  return safeString(value) === "outbound" ? "outbound" : "inbound";
}

function cleanOutcome(value: unknown) {
  return canonicalizeVoiceDisposition(value);
}

function cleanSentiment(value: unknown) {
  const sentiment = safeString(value);
  if (sentiment && ["positive", "neutral", "confused", "angry", "urgent", "unknown"].includes(sentiment)) return sentiment;
  return "unknown";
}

function cleanQualification(value: unknown): "hot" | "warm" | "cold" | "not_a_fit" | "spam" | "unknown" {
  const qualification = safeString(value);
  if (qualification === "hot" || qualification === "warm" || qualification === "cold"
    || qualification === "not_a_fit" || qualification === "spam" || qualification === "unknown") {
    return qualification;
  }
  return "unknown";
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 20) : [];
}

function safeTranscriptTurns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const content = safeLongString(item.content, 10_000);
    if (!content) return [];
    const role = safeString(item.role);
    return [{
      speakerType: role === "agent" ? "assistant" : role === "customer" ? "customer" : "system",
      content
    }];
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let incomingBody: Record<string, unknown>;
  try {
    incomingBody = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid voice webhook JSON." }, { status: 400 });
  }
  let body: Record<string, unknown> = incomingBody;
  const adapter = findVoiceAgentProviderForWebhook(incomingBody);

  if (adapter) {
    const normalized = await adapter.normalizeWebhook(request.headers, rawBody);
    if (!normalized?.ok) {
      const managedRetellKey = env.RETELL_WEBHOOK_SECRET ?? env.RETELL_API_KEY;
      const isAuthenticatedUnmappedRetellEvent =
        adapter.providerKey === "retell_voice"
        && normalized?.errorCategory === "untrusted_tenant"
        && managedRetellKey !== undefined
        && verifyRetellSignature(rawBody, managedRetellKey, request.headers.get("x-retell-signature"));
      if (isAuthenticatedUnmappedRetellEvent) {
        return new NextResponse(null, { status: 204 });
      }
      return unauthorized();
    }
    body = voiceWebhookBodyFromEvent(normalized.data);
  } else {
    if (!env.VOICE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Voice webhook is not configured. Add VOICE_WEBHOOK_SECRET before live provider callbacks." },
        { status: 503 }
      );
    }
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : request.headers.get("x-ferocity-voice-token");
    if (token !== env.VOICE_WEBHOOK_SECRET) return unauthorized();
  }

  const tenantId = safeString(body?.tenantId ?? body?.workspaceId);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "tenantId is required." }, { status: 400 });
  }

  const eventType = safeString(body?.eventType) ?? "voice.provider_event";
  const provider = safeString(body?.provider) ?? "voice_ai";
  const providerEventId = safeString(body?.providerEventId ?? body?.eventId) ?? `${provider}:${eventType}:${Date.now()}`;
  const providerCallId = safeString(body?.providerCallId ?? body?.callId ?? body?.externalSessionId) ?? providerEventId;
  const status = cleanStatus(body?.status);
  const direction = cleanDirection(body?.direction);
  const durationSeconds = Math.round(safeNumber(body?.durationSeconds ?? body?.duration_seconds));
  const providerCostCents = Math.round(safeNumber(body?.providerCostCents ?? body?.provider_cost_cents));
  const title = safeString(body?.title) ?? "Voice provider event received";
  const summary = safeString(body?.summary) ?? "A voice provider sent an event to Ferocity.";
  const idempotencyKey = `${tenantId}:${provider}:${providerEventId}`;
  const brandResult = await queryPostgres<{ id: string }>(
    `
    select id from public.brands
    where tenant_id = $1 and status = 'active'
      and ($2::text is null or id = $2::uuid)
    order by case when id = $2::uuid then 0 else 1 end, created_at
    limit 1
    `,
    [tenantId, safeUuid(body?.brandId)]
  );
  const brandId = brandResult?.rows[0]?.id ?? null;
  const outcome = cleanOutcome(body?.outcome);
  const callerNumber = safeString(body?.callerNumber ?? body?.from);
  const finalEvent = ["completed", "missed", "transferred", "failed", "spam", "blocked"].includes(status)
    || eventType === "call_analyzed";
  const contact = await reconcileCallContact({
    tenantId,
    brandId,
    customerId: safeUuid(body?.customerId),
    leadId: safeUuid(body?.leadId),
    callerNumber,
    callerName: body?.callerName,
    callerEmail: body?.callerEmail,
    summary,
    outcome,
    qualification: cleanQualification(body?.leadQualification),
    consentToContact: body?.consentToContact === true,
    provider,
    providerCallId,
    finalEvent
  });
  const customerId = contact.customerId;
  const leadId = contact.leadId;
  const session = await queryPostgres<{ id: string }>(
    `
    insert into public.office_manager_conversation_sessions (
      tenant_id, brand_id, lead_id, channel_key, provider_key, external_session_id,
      status, customer_sentiment, intent_key, summary, last_message_at, metadata_json
    )
    values ($1,$2,$3,'phone',$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
    on conflict (tenant_id, provider_key, external_session_id) do update
    set brand_id = coalesce(public.office_manager_conversation_sessions.brand_id, excluded.brand_id),
        lead_id = coalesce(public.office_manager_conversation_sessions.lead_id, excluded.lead_id),
        status = excluded.status, customer_sentiment = excluded.customer_sentiment,
        intent_key = excluded.intent_key, summary = excluded.summary, last_message_at = now(),
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      brandId,
      leadId,
      provider,
      providerCallId,
      status === "completed" ? "ai_handled" : status === "failed" ? "failed" : "open",
      cleanSentiment(body?.sentiment),
      outcome ?? eventType,
      summary,
      JSON.stringify({ source: "voice_ai_webhook", providerEventId })
    ]
  );
  const officeManagerSessionId = session?.rows[0]?.id ?? null;

  await queryPostgres(
    `
    insert into public.provider_webhook_events (
      tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
      signature_status, processing_status, idempotency_key, payload_redacted_json, metadata_json
    )
    values ($1, $2, $3, $4, 'receptionist_call', $5, 'verified', 'processed', $6, $7::jsonb, $8::jsonb)
    on conflict (idempotency_key) do update
    set processing_status = 'processed',
        processed_at = now(),
        metadata_json = public.provider_webhook_events.metadata_json || excluded.metadata_json
    `,
    [
      tenantId,
      provider,
      providerEventId,
      eventType,
      providerCallId,
      idempotencyKey,
      JSON.stringify({
        eventType,
        status,
        providerCallId,
        callerNumberPresent: Boolean(safeString(body?.callerNumber ?? body?.from)),
        calledNumberPresent: Boolean(safeString(body?.calledNumber ?? body?.to)),
        transcriptPresent: Boolean(safeString(body?.transcriptText ?? body?.transcript)),
        recordingPresent: Boolean(safeString(body?.recordingUrl))
      }),
      JSON.stringify({ source: "voice_ai_webhook" })
    ]
  );

  const call = await queryPostgres<{ id: string; metadata_json: Record<string, unknown> }>(
    `
    insert into public.receptionist_calls (
      tenant_id, brand_id, office_manager_session_id, customer_id, lead_id,
      provider_key, provider_call_id, direction, caller_number, called_number,
      status, outcome, sentiment, lead_qualification, duration_seconds, transfer_result,
      summary, action_items_json, follow_up_status, usage_units, idempotency_key, metadata_json
    )
    values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18::jsonb, $19, $20, $21, $22::jsonb
    )
    on conflict (provider_key, provider_call_id) do update
    set brand_id = coalesce(public.receptionist_calls.brand_id, excluded.brand_id),
        office_manager_session_id = coalesce(public.receptionist_calls.office_manager_session_id, excluded.office_manager_session_id),
        customer_id = coalesce(public.receptionist_calls.customer_id, excluded.customer_id),
        lead_id = coalesce(public.receptionist_calls.lead_id, excluded.lead_id),
        status = excluded.status,
        outcome = coalesce(excluded.outcome, public.receptionist_calls.outcome),
        sentiment = excluded.sentiment,
        lead_qualification = excluded.lead_qualification,
        duration_seconds = greatest(public.receptionist_calls.duration_seconds, excluded.duration_seconds),
        transfer_result = coalesce(excluded.transfer_result, public.receptionist_calls.transfer_result),
        summary = coalesce(excluded.summary, public.receptionist_calls.summary),
        action_items_json = case
          when jsonb_array_length(excluded.action_items_json) > 0 then excluded.action_items_json
          else public.receptionist_calls.action_items_json
        end,
        follow_up_status = case
          when public.receptionist_calls.follow_up_status in ('created', 'completed')
            then public.receptionist_calls.follow_up_status
          else excluded.follow_up_status
        end,
        usage_units = greatest(public.receptionist_calls.usage_units, excluded.usage_units),
        updated_at = now()
    returning id, metadata_json
    `,
    [
      tenantId,
      brandId,
      officeManagerSessionId,
      customerId,
      leadId,
      provider,
      providerCallId,
      direction,
      callerNumber,
      safeString(body?.calledNumber ?? body?.to),
      status,
      outcome,
      cleanSentiment(body?.sentiment),
      cleanQualification(body?.leadQualification),
      durationSeconds,
      safeString(body?.transferResult),
      summary,
      JSON.stringify(safeArray(body?.actionItems)),
      safeArray(body?.actionItems).length > 0 ? "needed" : "none",
      durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0,
      `${tenantId}:${provider}:call:${providerCallId}`,
      JSON.stringify({ source: "voice_ai_webhook", eventType, providerEventId })
    ]
  );

  const callId = call?.rows[0]?.id ?? null;
  const isCertifiedTestCall = call?.rows[0]?.metadata_json?.source === "receptionist_setup_test";
  let callDecision: Awaited<ReturnType<typeof safelyEvaluateAndStoreCallManagementDecision>> = null;

  if (callId) {
    await queryPostgres(
      `
      update public.receptionist_calls c
      set follow_up_status = 'created', updated_at = now()
      where c.id = $1
        and exists (
          select 1
          from public.operator_schedule_events e
          where e.tenant_id = c.tenant_id
            and e.event_type = 'callback'
            and e.status = 'scheduled'
            and e.metadata_json->>'source' = 'retell_sales_callback_tool'
            and e.metadata_json->>'providerCallId' = c.provider_call_id
        )
      `,
      [callId]
    );

    await queryPostgres(
      `
      insert into public.receptionist_call_events (
        tenant_id, call_id, provider_key, provider_event_id, event_type, event_status, metadata_json
      )
      values ($1, $2, $3, $4, $5, 'recorded', $6::jsonb)
      on conflict (tenant_id, provider_key, provider_event_id) do nothing
      `,
      [tenantId, callId, provider, providerEventId, eventType, JSON.stringify({ source: "voice_ai_webhook", status })]
    );

    const transcriptText = safeLongString(body?.transcriptText ?? body?.transcript);
    if (transcriptText) {
      if (officeManagerSessionId) {
        const turns = safeTranscriptTurns(body?.transcriptTurns);
        const storedTurns = turns.length > 0
          ? turns
          : [{ speakerType: "customer", content: transcriptText }];
        for (const [turnIndex, turn] of storedTurns.entries()) {
          await queryPostgres(
            `insert into public.office_manager_conversation_turns (
               tenant_id,brand_id,session_id,speaker_type,channel_key,transcript,
               redacted_transcript,confidence_score,sentiment,metadata_json
             )
             select $1,$2,$3,$4,'phone',$5,$5,$6,$7,$8::jsonb
             where not exists (
               select 1 from public.office_manager_conversation_turns
                where tenant_id=$1 and session_id=$3
                  and metadata_json->>'providerTurnKey'=$9
             )`,
            [
              tenantId,
              brandId,
              officeManagerSessionId,
              turn.speakerType,
              turn.content,
              Math.min(100, Math.round(safeNumber(body?.confidenceScore))),
              cleanSentiment(body?.sentiment),
              JSON.stringify({ source: "voice_ai_webhook", providerEventId, turnIndex, providerTurnKey: `${providerEventId}:${turnIndex}` }),
              `${providerEventId}:${turnIndex}`
            ]
          );
        }
      }
      await queryPostgres(
        `
        insert into public.receptionist_call_transcripts (
          tenant_id, call_id, provider_key, status, transcript_text, redacted_transcript_text,
          language, consent_status, confidence_score, metadata_json
        )
        values ($1, $2, $3, 'available', $4, $5, $6, $7, $8, '{"source":"voice_ai_webhook"}'::jsonb)
        on conflict (tenant_id, call_id) do update
        set transcript_text = excluded.transcript_text,
            redacted_transcript_text = excluded.redacted_transcript_text,
            status = excluded.status,
            updated_at = now()
        `,
        [
          tenantId,
          callId,
          provider,
          transcriptText,
          safeLongString(body?.redactedTranscriptText) ?? transcriptText,
          safeString(body?.language),
          safeString(body?.consentStatus) === "granted" ? "granted" : "unknown",
          Math.min(100, Math.round(safeNumber(body?.confidenceScore)))
        ]
      );
    }

    const recordingUrl = safeLongString(body?.recordingUrl, 2_000);
    if (recordingUrl) {
      const consentStatus = safeString(body?.consentStatus);
      const recordingAllowed = body?.recordingConsentGranted === true
        || consentStatus === "granted"
        || consentStatus === "not_required";
      await queryPostgres(
        `insert into public.receptionist_call_recordings (
           tenant_id,call_id,provider_key,status,storage_provider,storage_key,
           provider_recording_id,duration_seconds,consent_status,metadata_json
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         on conflict (tenant_id,call_id,provider_recording_id) do update
         set status=excluded.status,
             storage_provider=excluded.storage_provider,
             storage_key=excluded.storage_key,
             duration_seconds=greatest(public.receptionist_call_recordings.duration_seconds,excluded.duration_seconds),
             consent_status=excluded.consent_status,
             metadata_json=public.receptionist_call_recordings.metadata_json || excluded.metadata_json,
             updated_at=now()`,
        [
          tenantId,
          callId,
          provider,
          recordingAllowed ? "available" : "withheld",
          recordingAllowed ? "provider_signed_url" : null,
          recordingAllowed ? recordingUrl : null,
          safeString(body?.providerRecordingId) ?? providerCallId,
          durationSeconds,
          recordingAllowed ? (consentStatus === "not_required" ? "not_required" : "granted") : "withheld",
          JSON.stringify({ source: "voice_ai_webhook", providerEventId, retainedByProvider: true })
        ]
      );
    }

    const requestedStart = safeString(body?.appointmentStart ?? body?.scheduledStart);
    const appointmentStart = requestedStart ? new Date(requestedStart) : null;
    if ((leadId || customerId) && appointmentStart && Number.isFinite(appointmentStart.getTime()) && appointmentStart.getTime() > Date.now()) {
      await createVoiceAppointment({
        tenantId,
        brandId,
        leadId,
        customerId,
        providerCallId,
        startsAt: appointmentStart.toISOString(),
        durationMinutes: safeNumber(body?.appointmentDurationMinutes) || 60,
        // Provider analysis alone is not authority to reserve a real slot. A signed
        // Ferocity scheduling tool may set this independently when it executes.
        confirmedBySignedTool: body?.appointmentConfirmedBySignedTool === true,
        service: safeString(body?.serviceRequested)
      });
    }

    if (["completed", "transferred", "missed", "failed"].includes(status) && durationSeconds > 0) {
      await recordVoiceUsage({
        tenantId,
        providerKey: provider,
        providerCallId,
        callId,
        durationSeconds,
        providerCostCents
      });
    }

    callDecision = await safelyEvaluateAndStoreCallManagementDecision({
      tenantId,
      callId,
      additionalSignals: {
        ownerRequested: body?.ownerRequested === true,
        requestedEmployee: safeString(body?.requestedEmployee),
        estimatedValueCents: Math.round(safeNumber(body?.estimatedValueCents)),
        warrantyCall: body?.warrantyCall === true,
        supplierCall: body?.supplierCall === true,
        employeeCall: body?.employeeCall === true,
        vipCustomer: body?.vipCustomer === true
      }
    });
    if (finalEvent) {
      const capabilityEvidence = {
        status,
        outcome,
        durationSeconds,
        callId,
        transcriptPresent: Boolean(transcriptText),
        providerEventId
      };
      if (["completed", "transferred"].includes(status)) {
        await recordCapabilityDeliveryEvidence({
          tenantId,
          providerKey: provider,
          providerReference: providerCallId,
          state: "confirmed",
          evidence: capabilityEvidence
        });
        await recordCapabilityDeliveryEvidence({
          tenantId,
          providerKey: provider,
          providerReference: providerCallId,
          state: "completed",
          evidence: capabilityEvidence
        });
      } else if (["failed", "missed", "spam", "blocked"].includes(status)) {
        await recordCapabilityDeliveryEvidence({
          tenantId,
          providerKey: provider,
          providerReference: providerCallId,
          state: "failed",
          evidence: capabilityEvidence,
          error: `Voice call ended with status ${status}.`
        });
      }
      await orchestrateCompletedCall({
        tenantId,
        callId,
        providerCallId,
        callerNumber,
        summary,
        status,
        outcome,
        qualification: cleanQualification(body?.leadQualification),
        actionItems: safeArray(body?.actionItems),
        shouldInterruptOwner: callDecision?.shouldInterruptOwner ?? false,
        estimatedValueCents: Math.round(safeNumber(body?.estimatedValueCents))
      });
      await safelyEnqueueExternalCallLogHandoffs({
        tenantId,
        callId,
        providerCallId,
        direction,
        status,
        outcome,
        summary,
        durationSeconds,
        callerNumber,
        qualification: cleanQualification(body?.leadQualification),
        actionItems: safeArray(body?.actionItems),
        customerId,
        leadId
      });
      if (isCertifiedTestCall) {
        const testPassed = ["completed", "transferred"].includes(status) && durationSeconds > 0 && Boolean(transcriptText);
        await queryPostgres(
          `update public.receptionist_setup_checklists
           set test_status=$2,activation_status='not_started',updated_at=now()
           where tenant_id=$1`,
          [tenantId, testPassed ? "complete" : "needs_attention"]
        );
        await queryPostgres(
          `update public.provider_accounts set metadata_json=metadata_json || $3::jsonb,updated_at=now()
           where tenant_id=$1 and provider_key=$2`,
          [tenantId, provider, JSON.stringify(testPassed
            ? { lastSuccessfulTestCallAt: new Date().toISOString(), lastSuccessfulTestCallId: callId }
            : { lastTestCallFailedAt: new Date().toISOString(), lastTestCallId: callId })]
        );
      }
    }
  }

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, metadata_json
    )
    values ($1, 'ai', $2, $3, $4, $5::jsonb)
    `,
    [
      tenantId,
      eventType,
      title,
      summary,
      JSON.stringify({
        source: "voice_ai_webhook",
        provider,
        providerCallId,
        callId,
        callDecision: callDecision
          ? {
              priorityClass: callDecision.priorityClass,
              decision: callDecision.decision,
              shouldInterruptOwner: callDecision.shouldInterruptOwner,
              modeKey: callDecision.modeKey
            }
          : null,
        externalSessionId: safeString(body?.externalSessionId),
        routingDecisionRequiresConnectedProvider: true
      })
    ]
  );

  if (status === "missed" || status === "failed" || ["followup_needed", "unresolved", "failed"].includes(cleanOutcome(body?.outcome) ?? "")) {
    await syncCustomerLifecycleForTenant(tenantId);
  }

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(env.VOICE_WEBHOOK_SECRET),
    message: "Voice AI webhook stub is available. Live voice requires provider keys, consent, budget, and approval gates."
  });
}
