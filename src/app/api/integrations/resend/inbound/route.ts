import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { recordInboundResponse } from "@/lib/messaging/record-inbound-response";
import { recordMessageDeliveryReceipt } from "@/lib/messaging/message-health";
import { resendEmailProvider } from "@/lib/messaging/providers/resend-email";

type RouteRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  default_lead_source: string;
};

type LeadRow = {
  id: string;
  brand_id: string;
};

type ThreadRow = {
  id: string;
};

type NormalizedInboundEmail = ReturnType<typeof normalizeInboundEmail>;

const FEROCITY_SUPPORT_ADDRESS = "support@ferocity.live";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return clean(object.email) || clean(object.address) || clean(object.value) || clean(object.text) || "";
  }
  return "";
}

function extractEmail(value: unknown) {
  const text = textFromUnknown(value);
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? "";
}

function extractName(value: unknown) {
  const text = textFromUnknown(value);
  const angleIndex = text.indexOf("<");
  if (angleIndex > 0) return text.slice(0, angleIndex).replaceAll('"', "").trim();
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectEmails(value: unknown) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(extractEmail).filter(Boolean);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function verifySvixSignature(request: Request, rawBody: string, secret: string) {
  const svixId = request.headers.get("svix-id")?.trim();
  const svixTimestamp = request.headers.get("svix-timestamp")?.trim();
  const svixSignature = request.headers.get("svix-signature")?.trim();
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 600) return false;

  const secretValue = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let signingKey: Buffer;
  try {
    signingKey = Buffer.from(secretValue, "base64");
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", signingKey).update(signedContent).digest("base64");
  const signatures = svixSignature
    .split(" ")
    .flatMap((part) => part.split(","))
    .filter((part) => part && part !== "v1");

  return signatures.some((signature) => (
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ));
}

function verifyInboundSecret(request: Request, rawBody: string) {
  if (!env.RESEND_INBOUND_WEBHOOK_SECRET) return { ok: false as const, reason: "missing_secret" };

  if (verifySvixSignature(request, rawBody, env.RESEND_INBOUND_WEBHOOK_SECRET)) {
    return { ok: true as const };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const token = request.headers.get("x-ferocity-webhook-token")?.trim() || bearer;
  if (token && token === env.RESEND_INBOUND_WEBHOOK_SECRET) return { ok: true as const };

  const signature = request.headers.get("x-resend-signature")?.trim();
  if (signature) {
    const expected = crypto.createHmac("sha256", env.RESEND_INBOUND_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const normalized = signature.replace(/^sha256=/i, "");
    if (
      normalized.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected))
    ) {
      return { ok: true as const };
    }
  }

  return { ok: false as const, reason: "bad_secret" };
}

function normalizeInboundEmail(payload: Record<string, unknown>) {
  const data = asRecord(payload.data) || {};
  const source = Object.keys(data).length > 0 ? data : payload;
  const fromRaw = source.from ?? source.sender ?? source.from_email;
  const toRaw = source.to ?? source.recipients ?? source.recipient ?? source.delivered_to;
  const ccRaw = source.cc;
  const replyToRaw = source.reply_to ?? source.replyTo;
  const textBody = clean(source.text) || clean(source.text_body) || clean(source.plain) || "";
  const htmlBody = clean(source.html) || clean(source.html_body) || "";
  const subject = clean(source.subject) || "(No subject)";
  const providerMessageId =
    clean(source.id) ||
    clean(source.message_id) ||
    clean(source.messageId) ||
    clean(source.email_id) ||
    clean(payload.id) ||
    crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 48);

  return {
    providerEventType: clean(payload.type) || clean(payload.event_type) || "email.received",
    providerMessageId,
    fromEmail: extractEmail(fromRaw),
    fromName: extractName(fromRaw),
    replyToEmail: extractEmail(replyToRaw),
    recipients: [...new Set([...collectEmails(toRaw), ...collectEmails(ccRaw)])],
    subject,
    body: textBody || stripHtml(htmlBody) || "(No message body)",
    htmlBody,
    raw: payload
  };
}

async function hydrateReceivedEmail(email: NormalizedInboundEmail) {
  if (!env.EMAIL_API_KEY || !email.providerMessageId) return email;

  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(email.providerMessageId)}`, {
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}` },
      cache: "no-store"
    });
    if (!response.ok) return email;

    const received = asRecord(await response.json().catch(() => null));
    const textBody = clean(received.text);
    const htmlBody = clean(received.html);
    return {
      ...email,
      fromEmail: extractEmail(received.from) || email.fromEmail,
      fromName: extractName(received.from) || email.fromName,
      replyToEmail: extractEmail(received.reply_to) || email.replyToEmail,
      recipients: [...new Set([
        ...email.recipients,
        ...collectEmails(received.to),
        ...collectEmails(received.cc)
      ])],
      subject: clean(received.subject) || email.subject,
      body: textBody || stripHtml(htmlBody) || email.body,
      htmlBody: htmlBody || email.htmlBody,
      raw: { ...email.raw, received }
    };
  } catch {
    return email;
  }
}

async function forwardFerocitySupportEmail(email: NormalizedInboundEmail) {
  const notifyEmail = env.FEROCITY_NOTIFY_EMAIL?.trim().toLowerCase();
  if (
    !env.EMAIL_API_KEY ||
    !env.EMAIL_FROM_ADDRESS ||
    !notifyEmail ||
    !email.recipients.includes(FEROCITY_SUPPORT_ADDRESS)
  ) {
    return { attempted: false, forwarded: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `support-${crypto.createHash("sha256").update(email.providerMessageId).digest("hex").slice(0, 32)}`
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_ADDRESS,
        to: [notifyEmail],
        reply_to: email.replyToEmail || email.fromEmail,
        subject: `Fwd: ${email.subject}`,
        text: [
          `Forwarded from ${email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}`,
          `Originally sent to ${FEROCITY_SUPPORT_ADDRESS}`,
          "",
          email.body
        ].join("\n")
      })
    });

    if (!response.ok) {
      await logAppError({
        source: "api.integrations.resend.inbound",
        severity: "warning",
        message: "Ferocity support email could not be forwarded.",
        category: "provider_routing",
        retryable: response.status >= 500 || response.status === 429,
        metadata: { status: response.status, providerMessageId: email.providerMessageId }
      });
      return { attempted: true, forwarded: false };
    }

    return { attempted: true, forwarded: true };
  } catch (error) {
    await logAppError({
      source: "api.integrations.resend.inbound",
      severity: "warning",
      message: "Ferocity support email forwarding failed.",
      category: "provider_routing",
      retryable: true,
      metadata: {
        providerMessageId: email.providerMessageId,
        reason: error instanceof Error ? error.message : "unknown"
      }
    });
    return { attempted: true, forwarded: false };
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifyInboundSecret(request, rawBody);
  if (!verification.ok) {
    const status = verification.reason === "missing_secret" ? 503 : 401;
    return json(status, {
      ok: false,
      error: verification.reason === "missing_secret"
        ? "Resend inbound webhook secret is not configured."
        : "Invalid inbound email webhook signature."
    });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return json(400, { ok: false, error: "Invalid JSON payload." });
  }

  const eventType = clean(payload.type).toLowerCase();
  if (eventType.startsWith("email.") && eventType !== "email.received") {
    const data = asRecord(payload.data);
    const providerMessageId = clean(data.email_id) || clean(data.id) || clean(payload.id);
    if (!providerMessageId) return json(400, { ok: false, error: "Delivery event is missing its email ID." });
    const messageResult = await queryPostgres<{ tenant_id: string; source: string }>(
      `select tenant_id, source from (
         select tenant_id, 'message'::text as source, created_at
           from public.messages
          where provider_key='resend_email' and provider_message_ref=$1
         union all
         select tenant_id, 'estimate'::text as source, created_at
           from public.estimate_share_links
          where provider_message_id=$1
         union all
         select tenant_id, 'invoice'::text as source, created_at
           from public.service_invoice_payment_links
          where metadata_json->>'providerMessageId'=$1
       ) delivery_target
       order by created_at desc limit 1`,
      [providerMessageId]
    );
    const deliveryTarget = messageResult?.rows[0];
    const tenantId = deliveryTarget?.tenant_id;
    if (!tenantId) return json(202, { ok: true, recorded: false, reason: "message_not_found" });
    const bounce = asRecord(data.bounce);
    const error = asRecord(data.error);
    const safeReason = (
      clean(bounce.message)
      || clean(data.message)
      || clean(error.message)
      || textFromUnknown(data.error)
      || ""
    ).slice(0, 1000) || null;
    const normalized = resendEmailProvider.normalizeDeliveryReceipt?.({
      status: eventType,
      errorCode: clean(data.error_code) || clean(error.code) || null,
      errorMessage: safeReason
    });
    if (!normalized) return json(503, { ok: false, error: "Delivery normalization is unavailable." });
    const eventDate = new Date(clean(payload.created_at));
    const receiptAt = Number.isFinite(eventDate.getTime()) ? eventDate : new Date();
    const documentStatus = normalized.normalizedStatus;
    await Promise.all([
      queryPostgres(
        `update public.estimate_share_links
            set metadata_json=metadata_json || $3::jsonb, updated_at=now()
          where tenant_id=$1 and provider_message_id=$2`,
        [tenantId, providerMessageId, JSON.stringify({
          emailStatus: documentStatus,
          emailError: normalized.safeReason,
          emailDeliveryUpdatedAt: receiptAt.toISOString()
        })]
      ),
      queryPostgres(
        `update public.service_invoice_payment_links
            set metadata_json=metadata_json || $3::jsonb, updated_at=now()
          where tenant_id=$1 and metadata_json->>'providerMessageId'=$2`,
        [tenantId, providerMessageId, JSON.stringify({
          emailStatus: documentStatus,
          emailError: normalized.safeReason,
          emailDeliveryUpdatedAt: receiptAt.toISOString()
        })]
      )
    ]);
    if (deliveryTarget?.source !== "message") {
      return json(200, { ok: true, recorded: true, documentDelivery: deliveryTarget?.source });
    }
    const recorded = await recordMessageDeliveryReceipt({
      tenantId,
      providerKey: "resend_email",
      providerMessageId,
      providerEventId: request.headers.get("svix-id") || `${providerMessageId}:${eventType}:${receiptAt.toISOString()}`,
      receiptAt,
      ...normalized,
      metadata: { source: "resend_webhook" }
    });
    return json(200, { ok: true, recorded: recorded.recorded, duplicate: recorded.duplicate });
  }

  const email = await hydrateReceivedEmail(normalizeInboundEmail(payload));
  if (!email.fromEmail || email.recipients.length === 0) {
    return json(400, { ok: false, error: "Inbound email payload is missing sender or recipient." });
  }

  const supportForward = await forwardFerocitySupportEmail(email);

  const routeResult = await queryPostgres<RouteRow>(
    `
    select id, tenant_id, brand_id, default_lead_source
    from public.email_inbound_routes
    where lower(address) = any($1::text[]) and status = 'active'
    order by updated_at desc
    limit 1
    `,
    [email.recipients]
  );
  const route = routeResult?.rows[0];

  if (!route?.brand_id) {
    if (supportForward.forwarded) {
      return json(200, { ok: true, routed: false, forwarded: true, reason: "support_forwarded" });
    }
    const correlationId = await logAppError({
      source: "api.integrations.resend.inbound",
      severity: "warning",
      message: "Inbound email received but no active route matched the recipient.",
      category: "provider_routing",
      retryable: false,
      metadata: {
        providerEventType: email.providerEventType,
        recipientCount: email.recipients.length,
        subjectPresent: Boolean(email.subject)
      }
    });
    return json(202, { ok: true, routed: false, reason: "no_active_route", correlationId });
  }

  await queryPostgres(
    `
    insert into public.webhook_events (tenant_id, endpoint_id, event_type, payload_json, status)
    values ($1, null, $2, $3::jsonb, 'queued')
    `,
    [route.tenant_id, email.providerEventType, JSON.stringify({ provider: "resend", inboundEmail: email.raw })]
  );

  const leadResult = await queryPostgres<LeadRow>(
    `
    select id, brand_id
    from public.leads
    where tenant_id = $1
      and brand_id = $2
      and lower(email) = $3
      and status <> 'spam'
    order by created_at desc
    limit 1
    `,
    [route.tenant_id, route.brand_id, email.fromEmail]
  );
  let lead = leadResult?.rows[0];

  if (!lead) {
    const createdLead = await queryPostgres<LeadRow>(
      `
      insert into public.leads (
        tenant_id, brand_id, source, source_detail, name, email, message,
        lead_type, status, priority, consent_to_contact, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'general', 'new', 'normal', false, $8::jsonb)
      returning id, brand_id
      `,
      [
        route.tenant_id,
        route.brand_id,
        route.default_lead_source,
        email.recipients[0],
        email.fromName || null,
        email.fromEmail,
        email.body.slice(0, 5000),
        JSON.stringify({
          provider: "resend",
          providerMessageId: email.providerMessageId,
          subject: email.subject,
          recipients: email.recipients,
          createdByInboundEmail: true
        })
      ]
    );
    lead = createdLead?.rows[0];
  }

  if (!lead) {
    await logAppError({
      source: "api.integrations.resend.inbound",
      severity: "error",
      message: "Inbound email route matched, but Ferocity could not create or find a lead.",
      tenantId: route.tenant_id,
      metadata: { fromEmail: email.fromEmail, recipients: email.recipients, subject: email.subject }
    });
    return json(500, { ok: false, error: "Could not create lead for inbound email." });
  }

  const threadResult = await queryPostgres<ThreadRow>(
    `
    select id
    from public.communication_threads
    where tenant_id = $1
      and lead_id = $2
      and channel = 'email'
      and status <> 'archived'
    order by last_message_at desc nulls last, created_at desc
    limit 1
    `,
    [route.tenant_id, lead.id]
  );
  let thread = threadResult?.rows[0];

  if (!thread) {
    const createdThread = await queryPostgres<ThreadRow>(
      `
      insert into public.communication_threads (
        tenant_id, brand_id, lead_id, subject, channel, status, unanswered_since, provider_thread_id, metadata_json, last_message_at
      )
      values ($1, $2, $3, $4, 'email', 'waiting_on_team', now(), $5, $6::jsonb, now())
      returning id
      `,
      [
        route.tenant_id,
        route.brand_id,
        lead.id,
        email.subject,
        `resend:${email.fromEmail}`,
        JSON.stringify({ provider: "resend", recipients: email.recipients })
      ]
    );
    thread = createdThread?.rows[0];
  }

  if (!thread) {
    return json(500, { ok: false, error: "Could not create conversation thread." });
  }

  const messageResult = await queryPostgres<{ id: string }>(
    `
    insert into public.communication_messages (
      tenant_id, brand_id, thread_id, direction, channel, visibility,
      sender_label, recipient_label, body, status, provider_message_id, received_at, metadata_json
    )
    values ($1, $2, $3, 'inbound', 'email', 'customer_visible', $4, $5, $6, 'received', $7, now(), $8::jsonb)
    on conflict do nothing
    returning id
    `,
    [
      route.tenant_id,
      route.brand_id,
      thread.id,
      email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail,
      email.recipients.join(", "),
      email.body.slice(0, 10000),
      email.providerMessageId,
      JSON.stringify({
        provider: "resend",
        providerEventType: email.providerEventType,
        subject: email.subject,
        htmlCaptured: Boolean(email.htmlBody),
        replyToEmail: email.replyToEmail || null
      })
    ]
  );

  await recordInboundResponse({
    tenantId: route.tenant_id,
    brandId: route.brand_id,
    leadId: lead.id,
    sourceThreadId: thread.id,
    sourceMessageId: messageResult?.rows[0]?.id ?? null,
    channel: "email",
    providerKey: "resend_email",
    providerMessageId: email.providerMessageId,
    from: email.fromEmail,
    to: email.recipients.join(", "),
    subject: email.subject,
    body: email.body.slice(0, 10000)
  });

  await queryPostgres(
    `
    update public.communication_threads
    set status = 'waiting_on_team',
      unanswered_since = coalesce(unanswered_since, now()),
      last_message_at = now(),
      updated_at = now()
    where id = $1
    `,
    [thread.id]
  );

  await queryPostgres(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'email', $4, $5::jsonb)
    `,
    [
      route.tenant_id,
      route.brand_id,
      lead.id,
      `Inbound email: ${email.subject}`,
      JSON.stringify({
        provider: "resend",
        messageId: messageResult?.rows[0]?.id ?? null,
        providerMessageId: email.providerMessageId,
        fromEmail: email.fromEmail,
        recipients: email.recipients
      })
    ]
  );

  await queryPostgres(
    "update public.email_inbound_routes set last_received_at = now(), updated_at = now() where id = $1",
    [route.id]
  );

  return json(200, {
    ok: true,
    routed: true,
    forwarded: supportForward.forwarded,
    leadId: lead.id,
    threadId: thread.id,
    messageCreated: Boolean(messageResult?.rows[0]?.id)
  });
}
