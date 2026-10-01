import crypto from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { recordMessageDeliveryReceipt } from "@/lib/messaging/message-health";
import { vonageSmsProvider } from "@/lib/messaging/providers/vonage";
import { classifySmsKeyword } from "@/lib/messaging/sms-policy";

type JwtClaims = {
  api_key?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  jti?: string;
  payload_hash?: string;
};

function decodeJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyVonageSignedWebhook(input: {
  authorization: string | null;
  rawBody: string;
  signatureSecret: string;
  apiKey: string;
  nowSeconds?: number;
}) {
  try {
    const token = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return { ok: false as const, reason: "missing_token" };
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false as const, reason: "invalid_token" };
    const header = decodeJson(parts[0]);
    const claims = decodeJson(parts[1]) as JwtClaims;
    if (header.alg !== "HS256" || header.typ !== "JWT") return { ok: false as const, reason: "invalid_algorithm" };
    const expected = crypto.createHmac("sha256", input.signatureSecret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
    if (!secureEqual(expected, parts[2])) return { ok: false as const, reason: "invalid_signature" };
    if (claims.api_key !== input.apiKey || claims.iss !== "Vonage") return { ok: false as const, reason: "invalid_issuer" };
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof claims.exp === "number" && claims.exp < now) return { ok: false as const, reason: "expired" };
    if (typeof claims.iat !== "number" || claims.iat > now + 60 || now - claims.iat > 300) {
      return { ok: false as const, reason: "stale" };
    }
    const parsed = JSON.parse(input.rawBody || "{}") as unknown;
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
    if (!claims.payload_hash || !secureEqual(payloadHash, claims.payload_hash)) {
      return { ok: false as const, reason: "payload_mismatch" };
    }
    return { ok: true as const, claims };
  } catch {
    return { ok: false as const, reason: "invalid_token" };
  }
}

function value(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key] as string : null;
}

function normalizePhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits ? `+${digits}` : null;
}

function safePayload(payload: Record<string, unknown>) {
  const error = payload.error && typeof payload.error === "object"
    ? payload.error as Record<string, unknown>
    : null;
  return {
    message_uuid: value(payload, "message_uuid"),
    channel: value(payload, "channel"),
    message_type: value(payload, "message_type"),
    status: value(payload, "status"),
    from: value(payload, "from"),
    to: value(payload, "to"),
    timestamp: value(payload, "timestamp"),
    error: error ? {
      type: value(error, "type"),
      title: value(error, "title"),
      detail: value(error, "detail")
    } : null
  };
}

export async function handleVonageMessagingWebhook(request: Request) {
  if (!env.VONAGE_API_KEY || !env.VONAGE_SIGNATURE_SECRET) {
    return Response.json({ ok: false, error: "Vonage webhook verification is not configured." }, { status: 503 });
  }
  const rawBody = await request.text();
  const verification = verifyVonageSignedWebhook({
    authorization: request.headers.get("authorization"),
    rawBody,
    signatureSecret: env.VONAGE_SIGNATURE_SECRET,
    apiKey: env.VONAGE_API_KEY
  });
  if (!verification.ok) {
    return Response.json({ ok: false, error: "Webhook authentication failed." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }
  const providerMessageId = value(payload, "message_uuid");
  const status = value(payload, "status");
  const from = normalizePhone(value(payload, "from"));
  const to = normalizePhone(value(payload, "to"));
  const text = value(payload, "text");
  const inbound = text !== null && status === null;
  const workspaceNumber = inbound ? to : from;
  if (!providerMessageId || !workspaceNumber) {
    return Response.json({ ok: false, error: "Missing message identity." }, { status: 400 });
  }

  const tenantResult = await queryPostgres<{ tenant_id: string }>(
    `select tenant_id from public.tenant_phone_numbers
     where regexp_replace(phone_number,'[^0-9]','','g')=regexp_replace($1,'[^0-9]','','g')
       and provider_key in ('vonage','vonage_sms','vonage_phone') and status='active'
     order by updated_at desc limit 1`,
    [workspaceNumber]
  );
  const tenantId = tenantResult?.rows[0]?.tenant_id;
  if (!tenantId) return Response.json({ ok: false, error: "Unknown destination." }, { status: 404 });

  const webhookType = inbound ? "inbound_message" : "delivery_status";
  const eventKey = `vonage:${webhookType}:${providerMessageId}:${status ?? "received"}`;
  const event = await queryPostgres<{ id: string }>(
    `insert into public.message_webhook_events
      (tenant_id,provider_key,webhook_type,provider_event_ref,idempotency_key,processed_status,payload_redacted_json)
     values ($1,'vonage_sms',$2,$3,$4,'received',$5::jsonb)
     on conflict (tenant_id,provider_key,idempotency_key) do nothing returning id`,
    [tenantId, webhookType, providerMessageId, eventKey, JSON.stringify(safePayload(payload))]
  );
  if (!event?.rows[0]) return Response.json({ ok: true, duplicate: true });

  if (!inbound) {
    const error = payload.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    const normalized = vonageSmsProvider.normalizeDeliveryReceipt?.({
      status,
      errorCode: error ? value(error, "type") : null,
      errorMessage: error ? value(error, "detail") || value(error, "title") : null
    });
    if (!normalized) return Response.json({ ok: false, error: "Receipt normalization unavailable." }, { status: 503 });
    await recordMessageDeliveryReceipt({
      tenantId,
      providerKey: "vonage_sms",
      providerMessageId,
      providerEventId: verification.claims.jti ?? eventKey,
      receiptAt: value(payload, "timestamp") ? new Date(value(payload, "timestamp") as string) : new Date(),
      ...normalized,
      metadata: { source: "vonage_status_callback" }
    });
  } else {
    const conversationRef = `sms:${from ?? "unknown"}:${to ?? "unknown"}`;
    const message = await queryPostgres<{ id: string }>(
      `with conversation as (
         insert into public.messaging_conversations
          (tenant_id,channel,provider_key,external_conversation_ref,subject,status,last_message_at,metadata_json)
         values ($1,'sms','vonage_sms',$2,'SMS conversation','waiting_on_team',now(),'{"source":"vonage_inbound"}'::jsonb)
         on conflict (tenant_id,provider_key,external_conversation_ref) do update
           set status='waiting_on_team',last_message_at=now(),updated_at=now()
         returning id
       )
       insert into public.messages
        (tenant_id,conversation_id,direction,channel,provider_key,provider_message_ref,from_value,to_value,body,status,idempotency_key,received_at,metadata_json)
       select $1,conversation.id,'inbound','sms','vonage_sms',$3,$4,$5,$6,'received',$7,now(),'{"source":"vonage_inbound"}'::jsonb
       from conversation on conflict (tenant_id,idempotency_key) do nothing returning id`,
      [tenantId, conversationRef, providerMessageId, from, to, text ?? "", `vonage:inbound:${providerMessageId}`]
    );
    if (message?.rows[0]?.id) {
      await queryPostgres(
        `insert into public.messaging_usage
          (tenant_id,provider_key,channel,direction,unit_type,unit_count,provider_cost_cents,customer_charge_cents,message_id,billing_status,metadata_json)
         values ($1,'vonage_sms','sms','inbound','message',1,0,0,$2,'included','{"source":"vonage_webhook"}'::jsonb)`,
        [tenantId, message.rows[0].id]
      );
    }
    const keyword = classifySmsKeyword(text ?? "");
    if (from && keyword === "stop") {
      await queryPostgres(
        `insert into public.messaging_opt_outs
          (tenant_id,contact_channel,contact_value,opt_out_keyword,source_provider_key,active,metadata_json)
         values ($1,'sms',$2,$3,'vonage_sms',true,'{"source":"vonage_inbound"}'::jsonb)
         on conflict (tenant_id,contact_channel,contact_value) do update set
           opt_out_keyword=excluded.opt_out_keyword,source_provider_key=excluded.source_provider_key,
           active=true,updated_at=now()`,
        [tenantId, from.toLowerCase(), (text ?? "").trim().toUpperCase()]
      );
    }
  }

  await queryPostgres(
    `update public.message_webhook_events set processed_status='processed'
     where tenant_id=$1 and provider_key='vonage_sms' and id=$2`,
    [tenantId, event.rows[0].id]
  );
  return Response.json({ ok: true });
}
