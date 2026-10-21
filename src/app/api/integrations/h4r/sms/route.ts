import { NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { isAllowedH4rCallbackUrl } from "@/lib/integrations/h4r/callback";
import { normalizePhoneForSmsConsent } from "@/lib/sms/public-consent";
import { claimH4rBridgeNonce, verifyH4rSignedRequest } from "@/lib/integrations/h4r/request-auth";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  sms_outbox_id: z.string().uuid(),
  external_message_id: z.string().min(8).max(220),
  idempotency_key: z.string().min(8).max(260),
  to: z.string().min(7).max(80),
  body: z.string().min(1).max(1600),
  category: z.string().min(1).max(80).default("tenant_notice"),
  conversation_id: z.string().min(1).max(220).optional(),
  prospect_id: z.string().min(1).max(220).optional(),
  contact_controls: z.object({
    sms_stopped: z.boolean(),
    twilio_sms_stopped: z.boolean(),
    ferocity_connect_allowed: z.boolean()
  }).optional(),
  sms_stopped: z.boolean().optional(),
  twilio_sms_stopped: z.boolean().optional(),
  ferocity_connect_allowed: z.boolean().optional(),
  consent_evidence: z.object({
    status: z.literal("granted"),
    source: z.string().min(3).max(100),
    collected_at: z.string().datetime(),
    marketing_consent: z.boolean().default(false)
  })
});

function safePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const clone = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/token|secret|password|authorization|credential/i.test(key)) clone[key] = "[redacted]";
  }
  if (typeof clone.body === "string") clone.body = "[redacted]";
  return clone;
}

async function recordBridgeEvent(input: {
  workspaceId: string;
  tenantId: string | null;
  smsOutboxId: string;
  eventType: string;
  externalEventId: string;
  status: "received" | "processed" | "duplicate" | "failed" | "ignored";
  safeErrorCode?: string | null;
  safeErrorMessage?: string | null;
  providerMessageRef?: string | null;
  payload: unknown;
}) {
  await queryPostgres(
    `insert into public.h4r_ferocity_bridge_events
      (h4r_workspace_id,ferocity_tenant_id,sms_outbox_id,event_type,external_event_id,
       provider_message_ref,status,safe_error_code,safe_error_message,payload_redacted_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     on conflict (h4r_workspace_id, external_event_id) where external_event_id is not null
     do nothing`,
    [
      input.workspaceId,
      input.tenantId,
      input.smsOutboxId,
      input.eventType,
      input.externalEventId,
      input.providerMessageRef ?? null,
      input.status,
      input.safeErrorCode ?? null,
      input.safeErrorMessage ?? null,
      JSON.stringify(safePayload(input.payload))
    ]
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyH4rSignedRequest(request, rawBody);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (!(await claimH4rBridgeNonce(verified.nonce))) {
    return NextResponse.json({ ok: false, error: "Duplicate bridge nonce." }, { status: 409 });
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid H4R SMS payload." }, { status: 400 });
  const input = parsed.data;
  const recipient = normalizePhoneForSmsConsent(input.to);
  if (!recipient) return NextResponse.json({ ok: false, error: "Recipient must be a valid SMS phone number." }, { status: 400 });
  const controls = {
    smsStopped: input.contact_controls?.sms_stopped ?? input.sms_stopped ?? false,
    twilioSmsStopped: input.contact_controls?.twilio_sms_stopped ?? input.twilio_sms_stopped ?? false,
    ferocityConnectAllowed: input.contact_controls?.ferocity_connect_allowed ?? input.ferocity_connect_allowed ?? true,
    legacyPayload: !input.contact_controls
      && input.sms_stopped === undefined
      && input.twilio_sms_stopped === undefined
      && input.ferocity_connect_allowed === undefined
  };

  const mappingResult = await queryPostgres<{
    ferocity_tenant_id: string;
    status: string;
    reply_mode: "record_only" | "review" | "guarded_automatic";
    callback_url: string | null;
    allowed_categories: unknown;
    metadata_json: Record<string, unknown> | null;
  }>(
    `select ferocity_tenant_id,status,reply_mode,callback_url,allowed_categories,metadata_json
     from public.h4r_ferocity_bridge_workspaces
     where h4r_workspace_id=$1 and status in ('review','active')
     limit 1`,
    [input.workspace_id]
  );
  const mapping = mappingResult?.rows[0];
  if (!mapping) {
    await recordBridgeEvent({
      workspaceId: input.workspace_id,
      tenantId: null,
      smsOutboxId: input.sms_outbox_id,
      eventType: "send_rejected",
      externalEventId: input.external_message_id,
      status: "ignored",
      safeErrorCode: "workspace_not_mapped",
      safeErrorMessage: "H4R workspace is not mapped to an active Ferocity tenant.",
      payload: input,
    });
    return NextResponse.json({ ok: false, error: "H4R workspace is not authorized for Ferocity Connect.", retryable: false }, { status: 403 });
  }

  if (controls.smsStopped || !controls.ferocityConnectAllowed) {
    await recordBridgeEvent({
      workspaceId: input.workspace_id,
      tenantId: mapping.ferocity_tenant_id,
      smsOutboxId: input.sms_outbox_id,
      eventType: "send_rejected",
      externalEventId: input.external_message_id,
      status: "ignored",
      safeErrorCode: controls.smsStopped ? "h4r_global_sms_stop" : "h4r_ferocity_connect_not_allowed",
      safeErrorMessage: controls.smsStopped
        ? "H4R reports a global SMS stop for this contact."
        : "H4R has disabled Ferocity Connect handoff for this contact.",
      payload: input,
    });
    return NextResponse.json({
      ok: false,
      error: controls.smsStopped
        ? "This contact has a global H4R SMS stop."
        : "Ferocity Connect is not allowed for this H4R contact.",
      retryable: false,
      blocked_by: controls.smsStopped ? "global_sms_stop" : "ferocity_connect_not_allowed",
    }, { status: 403 });
  }

  if (!mapping.callback_url || !isAllowedH4rCallbackUrl(mapping.callback_url)) {
    return NextResponse.json({
      ok: false,
      error: "The mapped H4R delivery callback is not configured safely.",
      retryable: false,
    }, { status: 503 });
  }

  const categories = Array.isArray(mapping.allowed_categories) ? mapping.allowed_categories : [];
  if (categories.length && !categories.includes(input.category)) {
    await recordBridgeEvent({
      workspaceId: input.workspace_id,
      tenantId: mapping.ferocity_tenant_id,
      smsOutboxId: input.sms_outbox_id,
      eventType: "send_rejected",
      externalEventId: input.external_message_id,
      status: "ignored",
      safeErrorCode: "category_not_allowed",
      safeErrorMessage: "This H4R SMS category is not allowed for the mapped Ferocity bridge.",
      payload: input,
    });
    return NextResponse.json({ ok: false, error: "Message category is not authorized for this bridge.", retryable: false }, { status: 403 });
  }

  await recordBridgeEvent({
    workspaceId: input.workspace_id,
    tenantId: mapping.ferocity_tenant_id,
    smsOutboxId: input.sms_outbox_id,
    eventType: "send_received",
    externalEventId: input.external_message_id,
    status: "received",
    payload: input,
  });

  await queryPostgres(
    `insert into public.messaging_consents
      (tenant_id,contact_channel,contact_value,status,source,proof_json,granted_at)
     values ($1,'sms',$2,'granted','h4r_signed_server_bridge',$3::jsonb,$4::timestamptz)
     on conflict (tenant_id,contact_channel,contact_value) do update set
       status=case when public.messaging_consents.status='revoked' then 'revoked' else 'granted' end,
       source=case when public.messaging_consents.status='revoked' then public.messaging_consents.source else excluded.source end,
       proof_json=case when public.messaging_consents.status='revoked' then public.messaging_consents.proof_json else excluded.proof_json end,
       granted_at=case when public.messaging_consents.status='revoked' then public.messaging_consents.granted_at else excluded.granted_at end,
       updated_at=now()`,
    [mapping.ferocity_tenant_id, recipient, JSON.stringify({
      source: input.consent_evidence.source,
      collectedAt: input.consent_evidence.collected_at,
      marketingConsent: input.consent_evidence.marketing_consent,
      h4rWorkspaceId: input.workspace_id,
      h4rSmsStopped: controls.smsStopped,
      h4rTwilioSmsStopped: controls.twilioSmsStopped,
      h4rFerocityConnectAllowed: controls.ferocityConnectAllowed,
      h4rLegacyControlPayload: controls.legacyPayload,
      providerScopeNote: controls.twilioSmsStopped
        ? "Twilio STOP is provider-specific and does not revoke Ferocity Connect consent."
        : null,
    }), input.consent_evidence.collected_at]
  );

  await queryPostgres(
    `insert into public.contact_consent_records (
       tenant_id,channel,contact_value,status,source,recorded_at,metadata_json
     ) values ($1,'sms',$2,'granted',$3,$4,$5::jsonb)
     on conflict (tenant_id,channel,contact_value) do update set
       status=case when public.contact_consent_records.status in ('revoked','blocked')
         then public.contact_consent_records.status else 'granted' end,
       source=case when public.contact_consent_records.status in ('revoked','blocked')
         then public.contact_consent_records.source else excluded.source end,
       recorded_at=case when public.contact_consent_records.status in ('revoked','blocked')
         then public.contact_consent_records.recorded_at else excluded.recorded_at end,
       metadata_json=case when public.contact_consent_records.status in ('revoked','blocked')
         then public.contact_consent_records.metadata_json else excluded.metadata_json end,
       updated_at=now()`,
    [mapping.ferocity_tenant_id, recipient, input.consent_evidence.source, input.consent_evidence.collected_at, JSON.stringify({
      ...input.consent_evidence,
      h4rWorkspaceId: input.workspace_id,
      h4rSmsStopped: controls.smsStopped,
      h4rTwilioSmsStopped: controls.twilioSmsStopped,
      h4rFerocityConnectAllowed: controls.ferocityConnectAllowed,
      h4rLegacyControlPayload: controls.legacyPayload,
    })]
  );

  const callbackUrl = mapping.callback_url;
  const idempotencyKey = `h4r:${input.workspace_id}:${input.sms_outbox_id}`;
  const policyResult = await queryPostgres<{
    id: string;
    status: string;
    requires_human_approval: boolean;
  }>(
    `select id,status,requires_human_approval
     from public.live_action_policies
     where tenant_id=$1 and action_key in ('h4r_sms_send','sms_send')
     order by case when action_key='h4r_sms_send' then 0 else 1 end,
       case when provider_key='ferocity_connect' then 0 else 1 end
     limit 1`,
    [mapping.ferocity_tenant_id]
  );
  const policy = policyResult?.rows[0] ?? null;
  const automatic = mapping.status === "active"
    && policy?.status === "live"
    && policy.requires_human_approval === false;
  const queueMetadata = {
    source: "h4r",
    h4rWorkspaceId: input.workspace_id,
    h4rSmsOutboxId: input.sms_outbox_id,
    h4rExternalMessageId: input.external_message_id,
    h4rConversationId: input.conversation_id ?? null,
    h4rProspectId: input.prospect_id ?? null,
    h4rRequestIdempotencyKey: input.idempotency_key,
    h4rCanonicalIdempotencyKey: idempotencyKey,
    h4rCallbackUrl: callbackUrl,
    h4rReplyMode: mapping.reply_mode === "guarded_automatic" ? "review" : mapping.reply_mode,
    h4rContactControls: controls,
    consentEvidence: input.consent_evidence,
    communicationMethod: "sms",
    messagePurpose: input.category,
    enforceQuietHours: true,
    aiGenerated: false,
  };
  const queued = await queryPostgres<{ id: string; status: string }>(
    `with existing as (
       select id,status from public.outbound_action_queue
       where tenant_id=$1 and metadata_json->>'h4rCanonicalIdempotencyKey'=$7
       order by created_at desc limit 1
     ), inserted as (
       insert into public.outbound_action_queue (
         tenant_id,action_type,provider_key,status,risk_level,target_type,subject,
         recipient_label,payload_json,policy_id,metadata_json
       )
       select $1,'sms_send','ferocity_connect',$2,'medium','h4r_sms_intent',
         'H4R prepared SMS intent',$3,jsonb_build_object('body',$4),$5,$6::jsonb
       where not exists (select 1 from existing)
       returning id,status
     )
     select id,status from inserted
     union all
     select id,status from existing
     limit 1`,
    [
      mapping.ferocity_tenant_id,
      automatic ? "queued" : "needs_review",
      recipient,
      input.body,
      policy?.id ?? null,
      JSON.stringify(queueMetadata),
      idempotencyKey,
    ]
  );
  const queue = queued?.rows[0] ?? null;

  await recordBridgeEvent({
    workspaceId: input.workspace_id,
    tenantId: mapping.ferocity_tenant_id,
    smsOutboxId: input.sms_outbox_id,
    eventType: queue ? "intent_queued" : "intent_failed",
    externalEventId: `${input.external_message_id}:${queue ? "intent" : "failed"}`,
    status: queue ? "processed" : "failed",
    providerMessageRef: queue?.id ?? null,
    safeErrorCode: queue ? null : "action_queue_unavailable",
    safeErrorMessage: queue ? null : "Ferocity could not persist the prepared H4R message intent.",
    payload: { queueId: queue?.id ?? null, status: queue?.status ?? null, automatic },
  });

  if (!queue) {
    return NextResponse.json({ ok: false, error: "Ferocity could not queue the prepared H4R message intent.", retryable: true }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    status: queue.status,
    provider: "ferocity_connect",
    provider_message_ref: null,
    ferocity_message_ref: queue.id,
    idempotency_key: idempotencyKey,
    review_required: queue.status === "needs_review",
    reply_mode: mapping.reply_mode === "guarded_automatic" ? "review" : mapping.reply_mode,
  }, { status: queue.status === "needs_review" ? 202 : 200 });
}
