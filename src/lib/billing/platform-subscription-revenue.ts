import "server-only";

import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";

type SubscriptionIdentity = {
  tenantId: string;
  planKey: string;
  subscriptionId: string | null;
  customerId: string | null;
};

function integer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function currency(value: unknown) {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value) ? value.toLowerCase() : "usd";
}

function timestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function eventType(type: string) {
  if (type === "invoice.paid") return "subscription_invoice_paid";
  if (type === "invoice.payment_action_required") return "subscription_invoice_action_required";
  if (type === "invoice.finalization_failed") return "subscription_invoice_finalization_failed";
  return "subscription_invoice_failed";
}

export async function recordPlatformSubscriptionInvoiceEvent(input: {
  eventId: string;
  eventType: string;
  invoice: Record<string, unknown>;
  identity: SubscriptionIdentity;
}) {
  const providerObjectId = typeof input.invoice.id === "string" ? input.invoice.id : input.eventId;
  const collected = input.eventType === "invoice.paid";
  const grossAmountCents = collected ? integer(input.invoice.amount_paid) : integer(input.invoice.amount_due);
  const result = await queryPostgres<{ id: string }>(
    `insert into public.platform_subscription_revenue_events (
       tenant_id,plan_key,provider_event_id,provider_object_id,external_subscription_ref,external_customer_ref,
       event_type,financial_status,gross_amount_cents,refund_amount_cents,net_amount_cents,currency,
       billing_period_start,billing_period_end,occurred_at,metadata_json
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15::jsonb)
     on conflict (provider_event_id) do nothing returning id`,
    [
      input.identity.tenantId,
      input.identity.planKey,
      input.eventId,
      providerObjectId,
      input.identity.subscriptionId,
      input.identity.customerId,
      eventType(input.eventType),
      collected ? "collected" : "at_risk",
      grossAmountCents,
      collected ? grossAmountCents : 0,
      currency(input.invoice.currency),
      timestamp(input.invoice.period_start),
      timestamp(input.invoice.period_end),
      timestamp(input.invoice.created) ?? new Date().toISOString(),
      JSON.stringify({
        source: "verified_stripe_webhook",
        billingReason: typeof input.invoice.billing_reason === "string" ? input.invoice.billing_reason : null,
      }),
    ],
  );
  if (!result) throw new Error("Ferocity subscription revenue could not be recorded.");
  return { recorded: Boolean(result.rows[0]), collected, amountCents: grossAmountCents };
}

export async function recordPlatformSubscriptionRefundEvent(input: {
  eventId: string;
  charge: Record<string, unknown>;
}) {
  const chargeId = typeof input.charge.id === "string" ? input.charge.id : null;
  const customerId = typeof input.charge.customer === "string" ? input.charge.customer : null;
  const cumulativeRefundCents = integer(input.charge.amount_refunded);
  if (!chargeId || !customerId || cumulativeRefundCents <= 0) return { status: "not_subscription" as const, amountCents: 0 };

  const outcome = await withPostgresTransactionResult(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`ferocity-subscription-refund:${chargeId}`]);
    const subscription = await client.query<{
      tenant_id: string; plan_key: string; external_subscription_ref: string | null; external_customer_ref: string | null;
    }>(
      `select subscription.tenant_id,subscription.plan_key,subscription.external_subscription_ref,subscription.external_customer_ref
       from public.billing_subscriptions subscription
       join public.tenants tenant on tenant.id=subscription.tenant_id and tenant.account_type='customer'
       where subscription.external_customer_ref=$1
       order by subscription.updated_at desc limit 1`,
      [customerId],
    );
    const row = subscription.rows[0];
    if (!row) return { status: "not_subscription" as const, amountCents: 0 };

    const prior = await client.query<{ refunded_cents: string }>(
      `select coalesce(sum(refund_amount_cents),0)::text refunded_cents
       from public.platform_subscription_revenue_events
       where provider='stripe' and provider_object_id=$1 and event_type='subscription_refund'`,
      [chargeId],
    );
    const priorRefundCents = Number(prior.rows[0]?.refunded_cents ?? 0);
    const refundDeltaCents = Math.max(cumulativeRefundCents - priorRefundCents, 0);
    if (refundDeltaCents <= 0) return { status: "already_recorded" as const, amountCents: 0 };

    const inserted = await client.query<{ id: string }>(
      `insert into public.platform_subscription_revenue_events (
         tenant_id,plan_key,provider_event_id,provider_object_id,external_subscription_ref,external_customer_ref,
         event_type,financial_status,gross_amount_cents,refund_amount_cents,net_amount_cents,currency,occurred_at,metadata_json
       ) values ($1,$2,$3,$4,$5,$6,'subscription_refund','refunded',0,$7,$8,$9,$10::timestamptz,$11::jsonb)
       on conflict (provider_event_id) do nothing returning id`,
      [
        row.tenant_id,
        row.plan_key,
        input.eventId,
        chargeId,
        row.external_subscription_ref,
        row.external_customer_ref,
        refundDeltaCents,
        -refundDeltaCents,
        currency(input.charge.currency),
        timestamp(input.charge.created) ?? new Date().toISOString(),
        JSON.stringify({ source: "verified_stripe_webhook", cumulativeRefundCents }),
      ],
    );
    return { status: inserted.rows[0] ? "recorded" as const : "already_recorded" as const, amountCents: inserted.rows[0] ? refundDeltaCents : 0 };
  });
  if (!outcome.ok) throw new Error("Ferocity subscription refund could not be reconciled.");
  return outcome.value;
}
