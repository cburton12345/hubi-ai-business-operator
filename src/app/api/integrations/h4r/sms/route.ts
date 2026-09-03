import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { isAllowedH4rCallbackUrl } from "@/lib/integrations/h4r/callback";
import { normalizePhoneForSmsConsent } from "@/lib/sms/public-consent";

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
  consent_evidence: z.object({
    status: z.literal("granted"),
    source: z.string().min(3).max(100),
    collected_at: z.string().datetime(),
    marketing_consent: z.boolean().default(false)
  })
});

function timingSafeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function safePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const clone = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/token|secret|password|authorization|credential/i.test(key)) clone[key] = "[redacted]";
  }
  if (typeof clone.body === "string") clone.body = "[redacted]";
  return clone;
}

function verifyRequest(request: Request, rawBody: string) {
  const secret = env.H4R_SMS_BRIDGE_SECRET;
  if (!secret) return { ok: false as const, status: 503, error: "H4R SMS bridge secret is not configured." };

  const timestamp = request.headers.get("x-h4r-timestamp")?.trim() || "";
  const nonce = request.headers.get("x-h4r-nonce")?.trim() || "";
  const signature = (request.headers.get("x-h4r-signature") || "").replace(/^sha256=/i, "").trim();
  if (!timestamp || !nonce || !signature) return { ok: false as const, status: 401, error: "Missing bridge signature." };

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false as const, status: 401, error: "Stale bridge signature." };
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
  if (!timingSafeHexEqual(expected, signature)) return { ok: false as const, status: 401, error: "Invalid bridge signature." };
  return { ok: true as const, nonce };
}

async function claimNonce(nonce: string) {
  await queryPostgres(`delete from public.h4r_ferocity_bridge_nonces where expires_at < now()`);
  const result = await queryPostgres<{ nonce: string }>(
    `insert into public.h4r_ferocity_bridge_nonces (nonce,expires_at)
     values ($1,now()+interval '10 minutes')
     on conflict (nonce) do nothing
     returning nonce`,
    [nonce]
  );
  return Boolean(result?.rows[0]);
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
  const verified = verifyRequest(request, rawBody);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  if (!(await claimNonce(verified.nonce))) {
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

  if (mapping.status !== "active") {
    await recordBridgeEvent({
      workspaceId: input.workspace_id,
      tenantId: mapping.ferocity_tenant_id,
      smsOutboxId: input.sms_outbox_id,
      eventType: "send_rejected",
      externalEventId: input.external_message_id,
      status: "ignored",
      safeErrorCode: "bridge_review_required",
      safeErrorMessage: "The H4R bridge is mapped for review but is not authorized for live sending.",
      payload: input,
    });
    return NextResponse.json({
      ok: false,
      error: "This H4R bridge is still in review mode and cannot send live messages.",
      retryable: false,
      review_required: true,
    }, { status: 409 });
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
    }), input.consent_evidence.collected_at]
  );

  const callbackUrl = mapping.callback_url;
  const idempotencyKey = `h4r:${input.workspace_id}:${input.sms_outbox_id}`;
  const result = await sendMessage({
    tenantId: mapping.ferocity_tenant_id,
    providerKey: "ferocity_connect",
    channel: "sms",
    to: recipient,
    body: input.body,
    queueId: input.sms_outbox_id,
    idempotencyKey,
    authorization: {
      source: "h4r_signed_server_bridge",
      policyAllowsAuto: true,
      humanApproved: false,
      consentBasis: "stored_contact_consent"
    },
    metadata: {
      source: "h4r",
      h4rWorkspaceId: input.workspace_id,
      h4rSmsOutboxId: input.sms_outbox_id,
      h4rExternalMessageId: input.external_message_id,
      h4rConversationId: input.conversation_id ?? null,
      h4rProspectId: input.prospect_id ?? null,
      h4rRequestIdempotencyKey: input.idempotency_key,
      h4rCanonicalIdempotencyKey: idempotencyKey,
      messagePurpose: input.category,
      enforceQuietHours: true,
      h4rCallbackUrl: callbackUrl,
      h4rReplyMode: mapping.reply_mode === "guarded_automatic" ? "review" : mapping.reply_mode,
      consentEvidence: input.consent_evidence ?? null,
    }
  });

  await recordBridgeEvent({
    workspaceId: input.workspace_id,
    tenantId: mapping.ferocity_tenant_id,
    smsOutboxId: input.sms_outbox_id,
    eventType: result.ok ? "send_queued" : "send_failed",
    externalEventId: `${input.external_message_id}:${result.ok ? "queued" : "failed"}`,
    status: result.ok ? "processed" : "failed",
    providerMessageRef: result.ok ? result.providerMessageId : null,
    safeErrorCode: result.ok ? null : String(result.status),
    safeErrorMessage: result.ok ? null : result.error,
    payload: { result },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, retryable: result.retryable !== false }, { status: result.status || 503 });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    provider: result.providerKey,
    provider_message_ref: result.providerMessageId,
    ferocity_message_ref: result.providerMessageId,
    idempotency_key: idempotencyKey,
    reply_mode: mapping.reply_mode === "guarded_automatic" ? "review" : mapping.reply_mode,
  });
}
