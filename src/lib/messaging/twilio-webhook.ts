import crypto from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { resolveTwilioSmsConfiguration } from "@/lib/messaging/twilio-tenant-config";

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function calculateTwilioSignature(url: string, params: URLSearchParams, authToken: string) {
  const sorted = [...params.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  );
  const payload = `${url}${sorted.map(([key, value]) => `${key}${value}`).join("")}`;
  return crypto.createHmac("sha1", authToken).update(payload).digest("base64");
}

export function verifyTwilioWebhookSignature(
  url: string,
  params: URLSearchParams,
  authToken: string,
  receivedSignature: string | null
) {
  return Boolean(
    receivedSignature
    && constantTimeEqual(calculateTwilioSignature(url, params, authToken), receivedSignature)
  );
}

export function classifyTwilioMessagingWebhook(params: URLSearchParams) {
  return params.has("Body") ? "inbound_message" : "delivery_status";
}

function publicRequestUrl(request: Request) {
  const incoming = new URL(request.url);
  const configured = env.FEROCITY_APP_URL?.replace(/\/+$/, "");
  return configured ? `${configured}${incoming.pathname}${incoming.search}` : request.url;
}

function xmlResponse(status = 200) {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function deliveryStatus(value: string | null) {
  if (value === "delivered") return "delivered";
  if (value === "failed" || value === "undelivered") return "failed";
  if (value === "sent" || value === "sending") return "sent";
  return "queued";
}

export async function handleTwilioMessagingWebhook(request: Request) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const to = params.get("To");
  const from = params.get("From");
  const providerMessageId = params.get("MessageSid") ?? params.get("SmsSid");
  const messageStatus = params.get("MessageStatus") ?? params.get("SmsStatus");
  // Twilio includes SmsStatus=received on normal inbound message webhooks, so
  // status presence alone cannot distinguish an inbound message from a
  // delivery callback. Delivery callbacks do not include the message body.
  const isInboundMessage = classifyTwilioMessagingWebhook(params) === "inbound_message";
  const workspaceNumber = isInboundMessage ? to : from;
  if (!workspaceNumber || !providerMessageId) return xmlResponse(400);

  const tenantResult = await queryPostgres<{ tenant_id: string }>(
    `
    select tenant_id
    from public.tenant_phone_numbers
    where phone_number = $1
      and provider_key in ('twilio', 'twilio_sms')
      and status = 'active'
    order by updated_at desc
    limit 1
    `,
    [workspaceNumber]
  );
  const tenantId = tenantResult?.rows[0]?.tenant_id;
  if (!tenantId) return xmlResponse(404);

  const configuration = await resolveTwilioSmsConfiguration(tenantId, false);
  if (
    !configuration
    || !verifyTwilioWebhookSignature(
      publicRequestUrl(request),
      params,
      configuration.webhookAuthToken,
      request.headers.get("x-twilio-signature")
    )
  ) {
    return xmlResponse(401);
  }

  const webhookType = isInboundMessage ? "inbound_message" : "delivery_status";
  const insertedEvent = await queryPostgres<{ id: string }>(
    `
    insert into public.message_webhook_events (
      tenant_id, provider_key, webhook_type, provider_event_ref, idempotency_key,
      processed_status, payload_redacted_json
    )
    values ($1, 'twilio_sms', $2, $3, $4, 'received', $5::jsonb)
    on conflict (tenant_id, provider_key, idempotency_key) do nothing
    returning id
    `,
    [
      tenantId,
      webhookType,
      providerMessageId,
      `twilio:${webhookType}:${providerMessageId}:${isInboundMessage ? "received" : messageStatus ?? "unknown"}`,
      JSON.stringify({
        MessageSid: providerMessageId,
        From: from,
        To: to,
        MessageStatus: messageStatus,
        NumMedia: params.get("NumMedia")
      })
    ]
  );
  if (!insertedEvent?.rows[0]) return xmlResponse();

  if (!isInboundMessage) {
    const updated = await queryPostgres<{ id: string }>(
      `
      update public.messages
      set status = $3,
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and provider_message_ref = $2
      returning id
      `,
      [
        tenantId,
        providerMessageId,
        deliveryStatus(messageStatus),
        JSON.stringify({ twilioStatus: messageStatus, twilioErrorCode: params.get("ErrorCode") })
      ]
    );
    await queryPostgres(
      `
      insert into public.message_delivery_events (
        tenant_id, message_id, provider_key, event_type, provider_event_ref,
        status, safe_error_message, metadata_json
      )
      values ($1, $2, 'twilio_sms', $3, $4, 'logged', $5, $6::jsonb)
      `,
      [
        tenantId,
        updated?.rows[0]?.id ?? null,
        messageStatus,
        providerMessageId,
        params.get("ErrorMessage"),
        JSON.stringify({ errorCode: params.get("ErrorCode") })
      ]
    );
  } else {
    const messageBody = params.get("Body") ?? "";
    const conversationRef = `sms:${from ?? "unknown"}:${to ?? "unknown"}`;
    const messageResult = await queryPostgres<{ id: string }>(
      `
      with conversation as (
        insert into public.messaging_conversations (
          tenant_id, channel, provider_key, external_conversation_ref, subject,
          status, last_message_at, metadata_json
        )
        values ($1, 'sms', 'twilio_sms', $2, 'SMS conversation', 'waiting_on_team', now(), $3::jsonb)
        on conflict (tenant_id, provider_key, external_conversation_ref) do update
        set status = 'waiting_on_team', last_message_at = now(), updated_at = now()
        returning id
      )
      insert into public.messages (
        tenant_id, conversation_id, direction, channel, provider_key, provider_message_ref,
        from_value, to_value, body, status, idempotency_key, received_at, metadata_json
      )
      select $1, conversation.id, 'inbound', 'sms', 'twilio_sms', $4,
        $5, $6, $7, 'received', $8, now(), $9::jsonb
      from conversation
      on conflict (tenant_id, idempotency_key) do nothing
      returning id
      `,
      [
        tenantId,
        conversationRef,
        JSON.stringify({ source: "twilio_inbound" }),
        providerMessageId,
        from,
        to,
        messageBody,
        `twilio:inbound:${providerMessageId}`,
        JSON.stringify({ numMedia: Number(params.get("NumMedia") ?? 0) })
      ]
    );
    const messageId = messageResult?.rows[0]?.id;
    if (messageId) {
      await queryPostgres(
        `
        insert into public.messaging_usage (
          tenant_id, provider_key, channel, direction, unit_type, unit_count,
          provider_cost_cents, customer_charge_cents, message_id, billing_status, metadata_json
        )
        values ($1, 'twilio_sms', 'sms', 'inbound', 'message', 1, 0, 0, $2, 'included', '{"source":"twilio_webhook"}'::jsonb)
        `,
        [tenantId, messageId]
      );
    }

    const keyword = messageBody.trim().toUpperCase();
    if (from && ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) {
      await queryPostgres(
        `
        insert into public.messaging_opt_outs (
          tenant_id, contact_channel, contact_value, opt_out_keyword,
          source_provider_key, active, metadata_json
        )
        values ($1, 'sms', $2, $3, 'twilio_sms', true, '{"source":"twilio_inbound"}'::jsonb)
        on conflict (tenant_id, contact_channel, contact_value) do update
        set opt_out_keyword = excluded.opt_out_keyword, source_provider_key = excluded.source_provider_key,
            active = true, updated_at = now()
        `,
        [tenantId, from.toLowerCase(), keyword]
      );
    }
  }

  await queryPostgres(
    `
    update public.message_webhook_events
    set processed_status = 'processed'
    where tenant_id = $1 and provider_key = 'twilio_sms'
      and provider_event_ref = $2 and webhook_type = $3
    `,
    [tenantId, providerMessageId, webhookType]
  );
  return xmlResponse();
}
