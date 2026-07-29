import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";
import {
  normalizeStripeV2Account,
  stripeV2JsonRequest,
  type StripeV2ConnectedAccount,
  upsertManagedPaymentAccount
} from "@/lib/payments/stripe-connect";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe-webhook-signature";

type StripeV2ThinEvent = {
  id?: string;
  object?: string;
  type?: string;
  livemode?: boolean;
  context?: string | null;
  related_object?: {
    id?: string;
    type?: string;
    url?: string;
  };
};

export const dynamic = "force-dynamic";

const supportedEvents = new Set([
  "v2.core.event_destination.ping",
  "v2.core.account[requirements].updated",
  "v2.core.account[future_requirements].updated",
  "v2.core.account[identity].updated",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
  "v2.core.account.updated",
  "v2.core.account.closed"
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifyStripeWebhookSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    env.STRIPE_V2_WEBHOOK_SECRET
  );
  if (!verification.ok) {
    await logAppError({
      source: "api.integrations.stripe-connect.webhook",
      message: "Stripe Accounts v2 webhook signature verification failed.",
      severity: verification.reason === "missing_secret" ? "info" : "warning",
      category: "provider_auth",
      metadata: { reason: verification.reason }
    });
    return NextResponse.json(
      { ok: false, status: verification.reason },
      { status: verification.reason === "missing_secret" ? 501 : 400 }
    );
  }

  let event: StripeV2ThinEvent;
  try {
    event = JSON.parse(rawBody) as StripeV2ThinEvent;
  } catch {
    return NextResponse.json({ ok: false, status: "invalid_json" }, { status: 400 });
  }

  const eventId = event.id?.trim();
  const eventType = event.type?.trim();
  const accountId = event.related_object?.id?.trim();
  if (
    eventId &&
    event.object === "v2.core.event" &&
    eventType === "v2.core.event_destination.ping" &&
    accountId?.startsWith("ed_")
  ) {
    await queryPostgres(
      `
      insert into public.provider_webhook_events (
        tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
        signature_status, processing_status, idempotency_key, payload_redacted_json, metadata_json,
        processed_at
      )
      values (
        null, 'stripe_connect_v2', $1, $2, 'v2.core.event_destination', $3,
        'verified', 'processed', $4,
        jsonb_build_object('eventDestinationId', $3::text),
        jsonb_build_object('livemode', $5::boolean),
        now()
      )
      on conflict (provider_key, provider_event_id) do nothing
      `,
      [eventId, eventType, accountId, `stripe-connect-v2:${eventId}`, Boolean(event.livemode)]
    );
    return NextResponse.json({ ok: true, received: true, ping: true });
  }

  if (
    !eventId ||
    event.object !== "v2.core.event" ||
    !eventType ||
    !supportedEvents.has(eventType) ||
    !accountId?.startsWith("acct_") ||
    event.related_object?.type !== "v2.core.account"
  ) {
    return NextResponse.json({ ok: false, status: "unsupported_event" }, { status: 400 });
  }

  const mapping = await queryPostgres<{ tenant_id: string; brand_id: string | null }>(
    `
    select tenant_id, brand_id
    from public.payment_provider_accounts
    where provider = 'stripe'
      and payment_mode = 'ferocity_managed_connect'
      and provider_account_id = $1
    limit 1
    `,
    [accountId]
  );
  const mapped = mapping?.rows[0];
  if (!mapped) {
    await logAppError({
      source: "api.integrations.stripe-connect.webhook",
      message: "Stripe Accounts v2 event did not match a Ferocity connected account.",
      severity: "warning",
      metadata: { eventId, eventType, accountId }
    });
    return NextResponse.json({ ok: true, received: true, ignored: "unknown_account" });
  }

  const receipt = await queryPostgres<{ id: string }>(
    `
    insert into public.provider_webhook_events (
      tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
      signature_status, processing_status, idempotency_key, payload_redacted_json, metadata_json
    )
    values (
      $1, 'stripe_connect_v2', $2, $3, 'v2.core.account', $4,
      'verified', 'processing', $5,
      jsonb_build_object('accountId', $4::text),
      jsonb_build_object('livemode', $6::boolean, 'contextPresent', $7::boolean)
    )
    on conflict (provider_key, provider_event_id) do nothing
    returning id
    `,
    [
      mapped.tenant_id,
      eventId,
      eventType,
      accountId,
      `stripe-connect-v2:${eventId}`,
      Boolean(event.livemode),
      Boolean(event.context)
    ]
  );
  const receiptId = receipt?.rows[0]?.id;
  if (!receiptId) {
    return NextResponse.json({ ok: true, received: true, duplicate: true });
  }

  try {
    if (eventType === "v2.core.account.closed") {
      await queryPostgres(
        `
        update public.payment_provider_accounts
        set account_status = 'closed',
            charges_enabled = false,
            payouts_enabled = false,
            updated_at = now()
        where tenant_id = $1 and provider = 'stripe' and provider_account_id = $2
        `,
        [mapped.tenant_id, accountId]
      );
    } else {
      const v2Account = await stripeV2JsonRequest<StripeV2ConnectedAccount>(
        `core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.merchant&include[]=requirements`
      );
      await upsertManagedPaymentAccount({
        tenantId: mapped.tenant_id,
        brandId: mapped.brand_id,
        account: normalizeStripeV2Account(v2Account),
        metadata: {
          refreshedFrom: "stripe_connect_v2_webhook",
          stripeAccountApiVersion: "v2",
          stripeDashboard: "full",
          lastStripeV2EventType: eventType
        }
      });
    }

    await queryPostgres(
      `
      update public.provider_webhook_events
      set processing_status = 'processed', processed_at = now(), updated_at = now()
      where id = $1
      `,
      [receiptId]
    );
    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    await queryPostgres(
      `
      update public.provider_webhook_events
      set processing_status = 'failed',
          error_category = 'provider_sync',
          safe_error_message = $2,
          updated_at = now()
      where id = $1
      `,
      [receiptId, error instanceof Error ? error.message.slice(0, 500) : "Stripe v2 sync failed."]
    );
    await logAppError({
      source: "api.integrations.stripe-connect.webhook",
      message: error instanceof Error ? error.message : "Stripe Accounts v2 webhook processing failed.",
      severity: "error",
      metadata: { eventId, eventType, accountId, tenantId: mapped.tenant_id }
    });
    return NextResponse.json({ ok: false, status: "processing_failed" }, { status: 500 });
  }
}
