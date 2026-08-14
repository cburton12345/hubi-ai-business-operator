import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isSelfServePlanKey } from "@/lib/billing/public-plans";
import { provisionPaidWorkspace } from "@/lib/billing/provision-paid-workspace";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe-webhook-signature";
import { ensureInvoiceReviewEnrollment } from "@/lib/reviews/invoice-review-enrollment";
import { applyPlanEntitlements } from "@/lib/billing/apply-plan-entitlements";

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  data?: { object?: Record<string, unknown> };
};

export const dynamic = "force-dynamic";

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

function mapStripeSubscriptionStatus(status: string, eventType: string) {
  if (status === "canceled" || eventType === "customer.subscription.deleted") return "cancelled";
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "trialing";
}

async function handleCheckoutCompleted(event: StripeEvent, object: Record<string, unknown>) {
  const meta = metadata(object);
  if (textValue(meta, "ferocity_kind") === "managed_ad_wallet_credit") {
    const paymentStatus = textValue(object, "payment_status");
    if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") return;

    const tenantId = textValue(meta, "tenant_id");
    const providerKey = textValue(meta, "provider_key");
    const amountCents = numberValue(object, "amount_total") ?? Number(textValue(meta, "amount_cents") ?? 0);
    const checkoutSessionId = textValue(object, "id");
    if (!tenantId || !providerKey || !checkoutSessionId || !Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Managed-ad wallet payment is missing tenant, provider, or amount metadata.");
    }
    const walletIdempotencyKey = `stripe:checkout:${checkoutSessionId}:managed-ad-wallet`;

    const credited = await queryPostgres<{ id: string }>(
      `
      with control as (
        select id
        from public.managed_ad_budget_controls
        where tenant_id = $1::uuid
          and provider_key = $2
          and lane_key = 'ferocity_managed'
        for update
      ), credit as (
        insert into public.managed_ad_spend_events (
          tenant_id, budget_control_id, provider_key, event_type, amount_cents,
          idempotency_key, description, metadata_json
        )
        select $1::uuid, control.id, $2, 'prepaid_credit', $3::integer,
               $4, 'Customer prepaid managed advertising funds through Stripe.', $5::jsonb
        from control
        on conflict (tenant_id, idempotency_key) do nothing
        returning budget_control_id, amount_cents
      )
      update public.managed_ad_budget_controls c
      set prepaid_balance_cents = c.prepaid_balance_cents + credit.amount_cents,
          status = case when c.status = 'needs_payment' then 'ready' else c.status end,
          updated_at = now()
      from credit
      where c.id = credit.budget_control_id
      returning c.id
      `,
      [
        tenantId,
        providerKey,
        Math.round(amountCents),
        walletIdempotencyKey,
        JSON.stringify({
          stripeEventId: event.id,
          checkoutSessionId,
          paymentIntentId: textValue(object, "payment_intent")
        })
      ]
    );
    if (!credited?.rows[0]) {
      const existingCredit = await queryPostgres<{ id: string }>(
        `select id from public.managed_ad_spend_events where tenant_id = $1 and idempotency_key = $2 limit 1`,
        [tenantId, walletIdempotencyKey]
      );
      if (!existingCredit?.rows[0]) throw new Error("Managed-ad wallet credit could not be verified.");
    }
    return;
  }

  if (textValue(meta, "ferocity_kind") === "service_invoice_payment") {
    const paymentStatus = textValue(object, "payment_status");
    if (event.type === "checkout.session.completed" && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
      const paymentLinkId = textValue(meta, "payment_link_id");
      const tenantId = textValue(meta, "tenant_id");
      if (paymentLinkId && tenantId) {
        await queryPostgres(
          `
          update public.service_invoice_payment_links
          set status = 'sent',
              metadata_json = metadata_json || jsonb_build_object('stripePaymentStatus', $3::text),
              updated_at = now()
          where tenant_id = $1 and id = $2::uuid and status in ('ready', 'sent')
          `,
          [tenantId, paymentLinkId, paymentStatus ?? "processing"]
        );
      }
      return;
    }
    await handleServiceInvoicePayment(event, object, meta);
    return;
  }

  const email =
    textValue(object, "customer_email") ??
    (object.customer_details && typeof object.customer_details === "object"
      ? textValue(object.customer_details as Record<string, unknown>, "email")
      : null);
  const planKey = textValue(meta, "plan_key") ?? "not_sure";
  const tenantId = textValue(meta, "tenant_id");
  const customerId = textValue(object, "customer");
  const subscriptionId = textValue(object, "subscription");

  if (textValue(meta, "purchase_flow") === "public_signup") {
    const accessRequestId = textValue(meta, "access_request_id");
    const companyName = textValue(meta, "company_name");
    if (!email || !accessRequestId || !companyName || !subscriptionId || !isSelfServePlanKey(planKey)) {
      await logAppError({
        source: "api.integrations.stripe.webhook",
        message: "Paid public signup completed without complete provisioning metadata.",
        severity: "critical",
        metadata: {
          eventId: event.id,
          hasEmail: Boolean(email),
          hasAccessRequestId: Boolean(accessRequestId),
          hasCompanyName: Boolean(companyName),
          hasSubscriptionId: Boolean(subscriptionId),
          planKey
        }
      });
      return;
    }

    await provisionPaidWorkspace({
      accessRequestId,
      email,
      companyName,
      buyerName: textValue(meta, "buyer_name"),
      planKey,
      stripeEventId: event.id,
      checkoutSessionId: textValue(object, "id"),
      customerId,
      subscriptionId
    });
    return;
  }

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
      values ($1, $2, 'trialing', $3, $4, $5::jsonb, now())
      on conflict (tenant_id) do update
      set plan_key = excluded.plan_key,
          external_customer_ref = excluded.external_customer_ref,
          external_subscription_ref = excluded.external_subscription_ref,
          metadata_json = public.billing_subscriptions.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        tenantId,
        planKey,
        customerId,
        subscriptionId,
        JSON.stringify({ stripeEventId: event.id, checkoutSessionId: textValue(object, "id"), source: "checkout.session.completed" })
      ]
    );
  }

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
  const paymentMode = textValue(meta, "payment_mode") ?? "platform_direct";
  const connectedAccountId = textValue(meta, "connected_account_id");
  const platformFeeCents = Number(textValue(meta, "platform_fee_cents") ?? 0);
  const netCents = Math.max(Math.round(amountCents) - (Number.isFinite(platformFeeCents) ? platformFeeCents : 0), 0);

  if (!tenantId || !invoiceId || !customerId || !Number.isFinite(amountCents) || amountCents <= 0) {
    await logAppError({
      source: "api.integrations.stripe.webhook",
      message: "Stripe invoice payment event missing Ferocity invoice metadata.",
      severity: "warning",
      metadata: { eventId: event.id, checkoutSessionId, invoiceId, tenantId }
    });
    return;
  }

  if (paymentMode === "stripe_connect_direct") {
    if (!paymentLinkId || !connectedAccountId || event.account !== connectedAccountId) {
      await logAppError({
        source: "api.integrations.stripe.webhook",
        message: "Stripe direct-charge event failed its connected-account binding check.",
        severity: "critical",
        category: "tenant_isolation",
        metadata: {
          eventId: event.id,
          tenantId,
          invoiceId,
          paymentLinkId,
          metadataAccountId: connectedAccountId,
          eventAccountId: event.account ?? null
        }
      });
      throw new Error("Stripe direct-charge account binding failed.");
    }

    const binding = await queryPostgres<{ payment_link_id: string }>(
      `
      select l.id as payment_link_id
      from public.service_invoice_payment_links l
      join public.payment_provider_accounts a
        on a.tenant_id = l.tenant_id
       and a.provider = 'stripe'
       and a.payment_mode = 'ferocity_managed_connect'
       and a.provider_account_id = l.connected_account_id
      where l.id = $1::uuid
        and l.tenant_id = $2::uuid
        and l.invoice_id = $3::uuid
        and l.customer_id = $4::uuid
        and l.payment_mode = 'stripe_connect_direct'
        and l.connected_account_id = $5
        and a.account_status = 'connected'
        and a.charges_enabled = true
        and a.payouts_enabled = true
      limit 1
      `,
      [paymentLinkId, tenantId, invoiceId, customerId, connectedAccountId]
    );
    if (!binding?.rows[0]) {
      await logAppError({
        source: "api.integrations.stripe.webhook",
        message: "Stripe direct-charge event did not match an active tenant payment link.",
        severity: "critical",
        category: "tenant_isolation",
        metadata: { eventId: event.id, tenantId, invoiceId, paymentLinkId, connectedAccountId }
      });
      throw new Error("Stripe direct-charge payment-link binding failed.");
    }
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
        status, amount_cents, net_cents, currency, paid_at, payment_mode, connected_account_id,
        platform_fee_cents, payout_status, metadata_json
      )
      select tenant_id, brand_id, customer_id, id, nullif($4::text, '')::uuid, 'stripe', $5,
        'succeeded', $6, $10, $7, now(), $11, nullif($12::text, ''),
        $13, 'not_applicable',
        jsonb_build_object('stripeEventId', $8::text, 'checkoutSessionId', $9::text, 'paymentMode', $11::text)
      from invoice
      on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing
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
      checkoutSessionId ?? "",
      netCents,
      paymentMode,
      connectedAccountId ?? "",
      Number.isFinite(platformFeeCents) ? platformFeeCents : 0
    ]
  );
  await ensureInvoiceReviewEnrollment({ tenantId, invoiceId, event: "invoice_paid" });
}

async function recordStripePaymentException(event: StripeEvent, object: Record<string, unknown>, status: "failed" | "refunded" | "partially_refunded") {
  const meta = metadata(object);
  const tenantId = textValue(meta, "tenant_id");
  const invoiceId = textValue(meta, "invoice_id");
  const paymentIntentId = textValue(object, "payment_intent") ?? textValue(object, "id");
  const amountCents = numberValue(object, "amount") ?? numberValue(object, "amount_refunded") ?? Number(textValue(meta, "amount_cents") ?? 0);

  if (!tenantId || !invoiceId) {
    await queryPostgres(
      `
      insert into public.payment_provider_account_events (tenant_id, provider, event_type, event_status, provider_event_id, metadata_json)
      values (coalesce(nullif($1::text, '')::uuid, '11111111-1111-4111-8111-111111111111'::uuid), 'stripe', $2, 'recorded', $3, $4::jsonb)
      `,
      [tenantId ?? "", event.type, event.id, JSON.stringify({ reason: "missing_invoice_metadata", stripeObjectId: textValue(object, "id") })]
    );
    return;
  }

  await queryPostgres(
    `
    update public.service_invoice_payments
    set status = $4,
        metadata_json = metadata_json || $5::jsonb
    where tenant_id = $1
      and invoice_id = $2
      and provider = 'stripe'
      and ($3::text is null or provider_payment_id = $3)
    `,
    [tenantId, invoiceId, paymentIntentId, status, JSON.stringify({ stripeEventId: event.id, eventType: event.type })]
  );

  await queryPostgres(
    `
    insert into public.service_ledger_entries (
      tenant_id, invoice_id, entry_type, direction, amount_cents, currency, description, provider, provider_event_id, metadata_json
    )
    values (
      $1, $2, $3, case when $3 = 'payment_failed' then 'debit' else 'debit' end,
      greatest($4::integer, 0), 'usd', $5, 'stripe', $6, $7::jsonb
    )
    on conflict do nothing
    `,
    [
      tenantId,
      invoiceId,
      status === "failed" ? "payment_failed" : "refund",
      Math.round(amountCents),
      status === "failed" ? "Stripe payment failed or expired." : "Stripe payment refund recorded.",
      event.id,
      JSON.stringify({ eventType: event.type, providerPaymentId: paymentIntentId })
    ]
  );
}

async function recordStripeProviderEvent(event: StripeEvent, object: Record<string, unknown>) {
  const meta = metadata(object);
  const tenantId = textValue(meta, "tenant_id") ?? textValue(meta, "ferocity_tenant_id");
  const connectedAccountId =
    event.account ?? textValue(object, "account") ?? textValue(object, "destination") ?? textValue(meta, "connected_account_id");
  const fallbackTenant = "11111111-1111-4111-8111-111111111111";

  await queryPostgres(
    `
    insert into public.payment_provider_account_events (
      tenant_id, provider, event_type, event_status, provider_event_id, metadata_json
    )
    values (
      coalesce(nullif($1::text, '')::uuid, $2::uuid),
      'stripe',
      $3,
      'recorded',
      $4,
      jsonb_build_object('stripeObjectId', $5::text, 'connectedAccountId', nullif($6::text, ''), 'metadata', $7::jsonb)
    )
    `,
    [tenantId ?? "", fallbackTenant, event.type, event.id, textValue(object, "id") ?? "", connectedAccountId ?? "", JSON.stringify(meta)]
  );
}

async function handleSubscriptionLifecycle(event: StripeEvent, object: Record<string, unknown>) {
  const meta = metadata(object);
  const tenantId = textValue(meta, "tenant_id");
  const planKey = textValue(meta, "plan_key");
  const customerId = textValue(object, "customer");
  const subscriptionId = textValue(object, "id");
  const status = textValue(object, "status") ?? "active";
  const mappedStatus = mapStripeSubscriptionStatus(status, event.type);

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
    await applyPlanEntitlements({ tenantId, planKey, billingStatus: mappedStatus });
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
  const verification = verifyStripeWebhookSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET]
  );

  if (!verification.ok) {
    const correlationId = await logAppError({
      source: "api.integrations.stripe.webhook",
      message:
        verification.reason === "missing_secret"
          ? "Stripe webhook called before STRIPE_WEBHOOK_SECRET was configured."
          : "Stripe webhook signature verification failed.",
      severity: verification.reason === "missing_secret" ? "info" : "warning",
      category: "provider_auth",
      retryable: verification.reason === "stale_signature",
      metadata: { reason: verification.reason }
    });

    return NextResponse.json(
      {
        ok: false,
        provider: "stripe",
        status: verification.reason,
        correlationId
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
  if (!event.id || !event.type) {
    return NextResponse.json({ ok: false, status: "invalid_event" }, { status: 400 });
  }
  const eventMeta = metadata(object);
  const receipt = await queryPostgres<{ id: string }>(
    `
    insert into public.provider_webhook_events (
      tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
      signature_status, processing_status, idempotency_key, payload_redacted_json, metadata_json
    )
    values (
      nullif($1::text, '')::uuid, 'stripe', $2, $3, $4, $5,
      'verified', 'processing', $6, $7::jsonb, $8::jsonb
    )
    on conflict (provider_key, provider_event_id) do update
    set processing_status = 'processing'
    where public.provider_webhook_events.processing_status in ('failed', 'retrying')
       or (
         public.provider_webhook_events.processing_status = 'processing'
         and public.provider_webhook_events.received_at < now() - interval '5 minutes'
       )
    returning id
    `,
    [
      textValue(eventMeta, "tenant_id") ?? textValue(eventMeta, "ferocity_tenant_id") ?? "",
      event.id,
      event.type,
      textValue(object, "object"),
      textValue(object, "id"),
      `stripe:${event.id}`,
      JSON.stringify({ objectId: textValue(object, "id"), objectType: textValue(object, "object") }),
      JSON.stringify({ source: "stripe_webhook", connectedAccountId: event.account ?? textValue(object, "account") })
    ]
  );
  const receiptId = receipt?.rows[0]?.id;
  if (!receiptId) {
    return NextResponse.json({ ok: true, received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await handleCheckoutCompleted(event, object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await handleSubscriptionLifecycle(event, object);
    }

    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") {
      await recordStripePaymentException(event, object, "failed");
    }

    if (event.type === "charge.refunded") {
      const amountRefunded = numberValue(object, "amount_refunded") ?? 0;
      const amount = numberValue(object, "amount") ?? 0;
      await recordStripePaymentException(event, object, amountRefunded >= amount ? "refunded" : "partially_refunded");
    }

    if (
      event.type.startsWith("charge.dispute.") ||
      event.type.startsWith("payout.") ||
      event.type.startsWith("transfer.") ||
      event.type === "account.updated"
    ) {
      await recordStripeProviderEvent(event, object);
    }

    await logAppError({
      source: "api.integrations.stripe.webhook",
      message: "Stripe webhook processed.",
      severity: "info",
      metadata: { eventId: event.id, type: event.type, connectedAccountId: event.account ?? null }
    });
    await queryPostgres(
      `
      update public.provider_webhook_events
      set processing_status = 'processed', processed_at = now()
      where id = $1
      `,
      [receiptId]
    );

    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : "Stripe webhook processing failed.";
    await queryPostgres(
      `
      update public.provider_webhook_events
      set processing_status = 'failed',
          error_category = 'provider_processing',
          safe_error_message = $2
      where id = $1
      `,
      [receiptId, safeMessage]
    );
    await logAppError({
      source: "api.integrations.stripe.webhook",
      message: "Stripe webhook processing failed.",
      severity: "error",
      retryable: true,
      metadata: { eventId: event.id, type: event.type, connectedAccountId: event.account ?? null, detail: safeMessage }
    });
    return NextResponse.json({ ok: false, status: "processing_failed" }, { status: 500 });
  }
}
