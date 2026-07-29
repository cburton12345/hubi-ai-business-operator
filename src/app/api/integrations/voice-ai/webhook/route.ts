import { NextRequest, NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { syncCustomerLifecycleForTenant } from "@/lib/customer-lifecycle/sync-customer-lifecycle";
import { safelyEvaluateAndStoreCallManagementDecision } from "@/lib/office-manager/call-management";
import { findVoiceAgentProviderForWebhook, verifyRetellSignature } from "@/lib/providers/voice-adapters";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized voice webhook." }, { status: 401 });
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.slice(0, 500) : null;
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
  const outcome = safeString(value);
  if (
    outcome &&
    ["new_lead", "existing_customer", "scheduled", "message_taken", "transferred", "followup_needed", "spam", "unresolved", "failed"].includes(outcome)
  ) {
    return outcome;
  }
  return null;
}

function cleanSentiment(value: unknown) {
  const sentiment = safeString(value);
  if (sentiment && ["positive", "neutral", "confused", "angry", "urgent", "unknown"].includes(sentiment)) return sentiment;
  return "unknown";
}

function cleanQualification(value: unknown) {
  const qualification = safeString(value);
  if (qualification && ["hot", "warm", "cold", "not_a_fit", "spam", "unknown"].includes(qualification)) return qualification;
  return "unknown";
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 20) : [];
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
    const event = normalized.data;
    const metadata = event.metadata ?? {};
    const structuredData =
      metadata.structuredData && typeof metadata.structuredData === "object"
        ? metadata.structuredData as Record<string, unknown>
        : {};
    body = {
      tenantId: metadata.tenantId,
      brandId: metadata.brandId,
      provider: event.providerKey,
      providerEventId: event.providerEventId,
      providerCallId: event.providerCallId,
      eventType: metadata.eventType,
      callerNumber: event.callerNumber,
      calledNumber: event.calledNumber,
      status: event.status,
      durationSeconds: event.durationSeconds,
      recordingUrl: event.recordingUrl,
      transcriptText: event.transcriptText,
      summary: metadata.summary,
      providerCostCents: metadata.providerCostCents,
      direction: metadata.direction,
      outcome: structuredData.outcome,
      sentiment: structuredData.sentiment,
      leadQualification: structuredData.leadQualification,
      callerName: structuredData.callerName,
      callerEmail: structuredData.callerEmail,
      consentToContact: structuredData.consentToContact === true,
      actionItems: Array.isArray(structuredData.actionItems) ? structuredData.actionItems : []
    };
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
  let leadId = safeUuid(body?.leadId);
  if (leadId) {
    const existingLead = await queryPostgres<{ id: string }>(
      `select id from public.leads where tenant_id = $1 and id = $2 limit 1`,
      [tenantId, leadId]
    );
    if (!existingLead?.rows[0]) leadId = null;
  }
  const outcome = cleanOutcome(body?.outcome);
  const callerNumber = safeString(body?.callerNumber ?? body?.from);
  if (!leadId && brandId && callerNumber && outcome === "new_lead") {
    const createdLead = await queryPostgres<{ id: string }>(
      `
      with inserted as (
        insert into public.leads (
          tenant_id, brand_id, source, source_detail, name, email, phone, message,
          lead_type, status, qualification_status, priority, consent_to_contact, metadata_json
        )
        select $1,$2,'ai_phone_receptionist',$3,$4,$5,$6,$7,'appointment','new',$8,$9,$10,$11::jsonb
        where not exists (
          select 1 from public.leads
          where tenant_id = $1 and metadata_json->>'providerCallId' = $3
        )
        returning id
      )
      select id from inserted
      union all
      select id from public.leads where tenant_id = $1 and metadata_json->>'providerCallId' = $3
      limit 1
      `,
      [
        tenantId,
        brandId,
        providerCallId,
        safeString(body?.callerName),
        safeString(body?.callerEmail),
        callerNumber,
        summary,
        cleanQualification(body?.leadQualification) === "hot" ? "qualified" : "needs_review",
        ["hot", "warm"].includes(cleanQualification(body?.leadQualification)) ? "high" : "normal",
        body?.consentToContact === true,
        JSON.stringify({ provider, providerCallId, source: "voice_ai_webhook", eventType })
      ]
    );
    leadId = createdLead?.rows[0]?.id ?? null;
  }
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

  const call = await queryPostgres<{ id: string }>(
    `
    insert into public.receptionist_calls (
      tenant_id, brand_id, office_manager_session_id, lead_id,
      provider_key, provider_call_id, direction, caller_number, called_number,
      status, outcome, sentiment, lead_qualification, duration_seconds, transfer_result,
      summary, action_items_json, follow_up_status, usage_units, idempotency_key, metadata_json
    )
    values (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15,
      $16, $17::jsonb, $18, $19, $20, $21::jsonb
    )
    on conflict (provider_key, provider_call_id) do update
    set brand_id = coalesce(public.receptionist_calls.brand_id, excluded.brand_id),
        office_manager_session_id = coalesce(public.receptionist_calls.office_manager_session_id, excluded.office_manager_session_id),
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
        follow_up_status = excluded.follow_up_status,
        usage_units = greatest(public.receptionist_calls.usage_units, excluded.usage_units),
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      brandId,
      officeManagerSessionId,
      leadId,
      provider,
      providerCallId,
      cleanDirection(body?.direction),
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
  let callDecision: Awaited<ReturnType<typeof safelyEvaluateAndStoreCallManagementDecision>> = null;

  if (callId) {
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

    const transcriptText = safeString(body?.transcriptText ?? body?.transcript);
    if (transcriptText) {
      if (officeManagerSessionId) {
        await queryPostgres(
          `
          insert into public.office_manager_conversation_turns (
            tenant_id, brand_id, session_id, speaker_type, channel_key, transcript,
            redacted_transcript, confidence_score, sentiment, metadata_json
          )
          select $1,$2,$3,'customer','phone',$4,$5,$6,$7,$8::jsonb
          where not exists (
            select 1 from public.office_manager_conversation_turns
            where tenant_id = $1 and session_id = $3 and metadata_json->>'providerEventId' = $9
          )
          `,
          [
            tenantId,
            brandId,
            officeManagerSessionId,
            transcriptText,
            safeString(body?.redactedTranscriptText) ?? transcriptText,
            Math.min(100, Math.round(safeNumber(body?.confidenceScore))),
            cleanSentiment(body?.sentiment),
            JSON.stringify({ source: "voice_ai_webhook", providerEventId }),
            providerEventId
          ]
        );
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
          safeString(body?.redactedTranscriptText) ?? transcriptText,
          safeString(body?.language),
          safeString(body?.consentStatus) === "granted" ? "granted" : "unknown",
          Math.min(100, Math.round(safeNumber(body?.confidenceScore)))
        ]
      );
    }

    const requestedStart = safeString(body?.appointmentStart ?? body?.scheduledStart);
    const appointmentStart = requestedStart ? new Date(requestedStart) : null;
    if (leadId && appointmentStart && Number.isFinite(appointmentStart.getTime()) && appointmentStart.getTime() > Date.now()) {
      await queryPostgres(
        `
        insert into public.revenue_appointments (
          tenant_id, brand_id, lead_id, appointment_type, status, scheduled_start,
          scheduled_end, booking_source, show_sequence_key, metadata_json
        )
        select $1,$2,$3,'estimate',$4,$5,$6,'ai_phone_receptionist',
          'qualified_appointment_show_rate',$7::jsonb
        where not exists (
          select 1 from public.revenue_appointments
          where tenant_id = $1 and metadata_json->>'providerCallId' = $8
        )
        `,
        [
          tenantId,
          brandId,
          leadId,
          body?.appointmentConfirmed === true ? "booked" : "requested",
          appointmentStart.toISOString(),
          new Date(appointmentStart.getTime() + 60 * 60 * 1000).toISOString(),
          JSON.stringify({ providerCallId, requiresAvailabilityConfirmation: body?.appointmentConfirmed !== true }),
          providerCallId
        ]
      );
    }

    if (status === "completed" && durationSeconds > 0) {
      const minutes = Math.ceil(durationSeconds / 60);
      await queryPostgres(
        `
        insert into public.usage_meter_events (
          tenant_id, feature_key, provider_key, provider_resource_id, provider_event_id,
          source_table, source_id, unit_type, quantity, provider_cost_cents, customer_charge_cents,
          status, source, idempotency_key, metadata_json
        )
        values ($1, 'ai_receptionist', $2, $3, $4, 'receptionist_calls', $5, 'minute', $6, $9, 0, 'included', 'provider_webhook', $7, $8::jsonb)
        on conflict (tenant_id, idempotency_key) do nothing
        `,
        [
          tenantId,
          provider,
          providerCallId,
          providerEventId,
          callId,
          minutes,
          `${tenantId}:${provider}:${providerEventId}:minute:${callId}`,
          JSON.stringify({ source: "voice_ai_webhook", pricingNotEnabled: true, durationSeconds }),
          providerCostCents
        ]
      );
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
