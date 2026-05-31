import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
};

export const dynamic = "force-dynamic";

function parseStripeSignature(header: string | null) {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  return parts.t && parts.v1 ? { timestamp: parts.t, signature: parts.v1 } : null;
}

function timingSafeHexEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyStripeWebhook(rawBody: string, signatureHeader: string | null) {
  if (!env.STRIPE_WEBHOOK_SECRET) return { ok: false as const, reason: "missing_secret" };
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) return { ok: false as const, reason: "missing_signature" };

  const timestampMs = Number(parsed.timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false as const, reason: "stale_signature" };
  }

  const expected = crypto
    .createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
    .update(`${parsed.timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return timingSafeHexEqual(expected, parsed.signature) ? { ok: true as const } : { ok: false as const, reason: "bad_signature" };
}

function textValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadata(record: Record<string, unknown>) {
  const value = record.metadata;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function handleCheckoutCompleted(event: StripeEvent, object: Record<string, unknown>) {
  const meta = metadata(object);
  if (textValue(meta, "ferocity_kind") === "service_invoice_payment") {
    await handleServiceInvoicePayment(event, object, meta);
    return;
  }

  const email =
    textValue(object, "customer_email") ??
    (object.customer_details && typeof object.customer_details === "object"
      ? textValue(object.customer_details as Record<string, unknown>, "email")
      : null);
  const planKey = textValue(meta, "plan_key") ?? "not_sure";

  if (email) {
    await queryPostgres(
      `
      insert into public.access_requests (
        request_type,
        status,
        priority,
        email,
        requested_plan,
        source,
        source_detail,
        metadata_json
      )
      values ('paid_checkout', 'reviewing', 'high', lower($1), $2, 'stripe_checkout', $3, $4::jsonb)
      `,
      [
        email,
        planKey,
        event.id,
        JSON.stringify({
          stripeEventId: event.id,
          checkoutSessionId: textValue(object, "id"),
          customerId: textValue(object, "customer"),
          subscriptionId: textValue(object, "subscription")
        })
      ]
    );
  }
}

async function handleServiceInvoicePayment(event: StripeEvent, object: Record<string, unknown>, meta: Record<string, unknown>) {
  const tenantId = textValue(meta, "tenant_id");
  const invoiceId = textValue(meta, "invoice_id");
  const customerId = textValue(meta, "customer_id");
  const paymentLinkId = textValue(meta, "payment_link_id");
  const amountCents = numberValue(object, "amount_total") ?? Number(textValue(meta, "amount_cents") ?? 0);
  const currency = textValue(object, "currency") ?? textValue(meta, "currency") ?? "usd";
  const checkoutSessionId = textValue(object, "id");
  const paymentIntentId = textValue(object, "payment_intent");

  if (!tenantId || !invoiceId || !customerId || !Number.isFinite(amountCents) || amountCents <= 0) {
    await logAppError({
      source: "api.integrations.stripe.webhook",
      message: "Stripe invoice payment event missing Ferocity invoice metadata.",
      severity: "warning",
      metadata: { eventId: event.id, checkoutSessionId, invoiceId, tenantId }
    });
    return;
  }

  await queryPostgres(
    `
    with invoice as (
      select id, tenant_id, brand_id, customer_id, total_cents, amount_paid_cents
      from public.service_invoices
      where tenant_id = $1 and id = $2 and customer_id = $3
      limit 1
    ),
    payment as (
      insert into public.service_invoice_payments (
        tenant_id, brand_id, customer_id, invoice_id, payment_link_id, provider, provider_payment_id,
        status, amount_cents, net_cents, currency, paid_at, metadata_json
      )
      select tenant_id, brand_id, customer_id, id, nullif($4::text, '')::uuid, 'stripe', $5,
        'succeeded', $6, $6, $7, now(),
        jsonb_build_object('stripeEventId', $8::text, 'checkoutSessionId', $9::text)
      from invoice
      on conflict (provider, provider_payment_id) where provider_payment_id is not null do update
      set metadata_json = public.service_invoice_payments.metadata_json || excluded.metadata_json
      returning id, tenant_id, brand_id, customer_id, invoice_id, amount_cents
    ),
    ledger as (
      insert into public.service_ledger_entries (
        tenant_id, brand_id, customer_id, invoice_id, payment_id, entry_type, direction,
        amount_cents, currency, description, provider, provider_event_id, metadata_json
      )
      select tenant_id, brand_id, customer_id, invoice_id, id, 'payment_received', 'credit',
        amount_cents, $7, 'Stripe invoice payment received.', 'stripe', $8,
        jsonb_build_object('checkoutSessionId', $9::text)
      from payment
      where not exists (
        select 1 from public.service_ledger_entries
        where tenant_id = payment.tenant_id and provider_event_id = $8 and entry_type = 'payment_received'
      )
    ),
    updated_invoice as (
      update public.service_invoices i
      set amount_paid_cents = least(i.total_cents, i.amount_paid_cents + p.amount_cents),
          status = case
            when least(i.total_cents, i.amount_paid_cents + p.amount_cents) >= i.total_cents then 'paid'
            else 'partially_paid'
          end,
          updated_at = now()
      from payment p
      where i.tenant_id = p.tenant_id and i.id = p.invoice_id
    )
    update public.service_invoice_payment_links
    set status = 'paid',
        provider_checkout_session_id = coalesce(provider_checkout_session_id, $9),
        provider_payment_intent_id = coalesce(provider_payment_intent_id, $5),
        updated_at = now()
    where tenant_id = $1 and id = nullif($4::text, '')::uuid
    `,
    [
      tenantId,
      invoiceId,
      customerId,
      paymentLinkId ?? "",
      paymentIntentId ?? checkoutSessionId ?? event.id,
      Math.round(amountCents),
      currency,
      event.id,
      checkoutSessionId ?? ""
    ]
  );
}

async function handleSubscriptionLifecycle(event: StripeEvent, object: Record<string, unknown>) {
  const meta = metadata(object);
  const tenantId = textValue(meta, "tenant_id");
  const planKey = textValue(meta, "plan_key");
  const customerId = textValue(object, "customer");
  const subscriptionId = textValue(object, "id");
  const status = textValue(object, "status") ?? "active";
  const mappedStatus = status === "canceled" || event.type === "customer.subscription.deleted" ? "cancelled" : status;

  if (tenantId && planKey && subscriptionId) {
    await queryPostgres(
      `
      insert into public.billing_subscriptions (
        tenant_id,
        plan_key,
        status,
        external_customer_ref,
        external_subscription_ref,
        metadata_json,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (tenant_id) do update
      set plan_key = excluded.plan_key,
          status = excluded.status,
          external_customer_ref = excluded.external_customer_ref,
          external_subscription_ref = excluded.external_subscription_ref,
          metadata_json = public.billing_subscriptions.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        tenantId,
        planKey,
        mappedStatus,
        customerId,
        subscriptionId,
        JSON.stringify({ stripeEventId: event.id, stripeStatus: status })
      ]
    );
    return;
  }

  if (customerId && subscriptionId) {
    await queryPostgres(
      `
      update public.billing_subscriptions
      set status = $2,
          external_subscription_ref = $3,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where external_customer_ref = $1
      `,
      [customerId, mappedStatus, subscriptionId, JSON.stringify({ stripeEventId: event.id, stripeStatus: status })]
    );
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));

  if (!verification.ok) {
    await logAppError({
      source: "api.integrations.stripe.webhook",
      message:
        verification.reason === "missing_secret"
          ? "Stripe webhook called before STRIPE_WEBHOOK_SECRET was configured."
          : "Stripe webhook signature verification failed.",
      severity: verification.reason === "missing_secret" ? "info" : "warning",
      metadata: { reason: verification.reason }
    });

    return NextResponse.json(
      {
        ok: false,
        provider: "stripe",
        status: verification.reason
      },
      { status: verification.reason === "missing_secret" ? 501 : 400 }
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false, status: "invalid_json" }, { status: 400 });
  }

  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(event, object);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await handleSubscriptionLifecycle(event, object);
  }

  await logAppError({
    source: "api.integrations.stripe.webhook",
    message: "Stripe webhook processed.",
    severity: "info",
    metadata: { eventId: event.id, type: event.type }
  });

  return NextResponse.json({ ok: true, received: true });
}
