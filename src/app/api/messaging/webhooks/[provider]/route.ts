import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { verifyMessagingWebhook } from "@/lib/messaging/verify-messaging-webhook";
import { handleTwilioMessagingWebhook } from "@/lib/messaging/twilio-webhook";

function safePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const clone = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/token|secret|password|authorization|auth/i.test(key)) {
      clone[key] = "[redacted]";
    }
  }
  return clone;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(provider)) {
    return NextResponse.json({ ok: false, error: "Invalid provider." }, { status: 400 });
  }
  if (provider === "twilio" || provider === "twilio_sms") {
    return handleTwilioMessagingWebhook(request);
  }

  const tenantId = request.headers.get("x-ferocity-tenant-id");
  const providerEventRef = request.headers.get("x-provider-event-id") ?? crypto.randomUUID();
  const idempotencyKey = request.headers.get("idempotency-key") ?? `${provider}:${providerEventRef}`;
  const rawBody = await request.text();
  const verification = verifyMessagingWebhook({
    rawBody,
    secret: env.FEROCITY_MESSAGING_WEBHOOK_SECRET,
    timestampHeader: request.headers.get("x-ferocity-timestamp"),
    signatureHeader: request.headers.get("x-ferocity-signature")
  });

  if (!verification.ok) {
    const status = verification.reason === "missing_secret" ? 503 : 401;
    return NextResponse.json({ ok: false, error: "Webhook authentication failed." }, { status });
  }

  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ ok: false, error: "Missing x-ferocity-tenant-id." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody || "{}") as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  await queryPostgres(
    `
    insert into public.message_webhook_events (
      tenant_id, provider_key, webhook_type, provider_event_ref, idempotency_key, processed_status, payload_redacted_json
    )
    values ($1, $2, 'unknown', $3, $4, 'received', $5::jsonb)
    on conflict (tenant_id, provider_key, idempotency_key) do update set
      processed_status = 'duplicate'
    `,
    [tenantId, provider, providerEventRef, idempotencyKey, JSON.stringify(safePayload(payload))]
  );

  return NextResponse.json({ ok: true, provider, status: "received" });
}
