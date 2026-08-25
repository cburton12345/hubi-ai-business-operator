import { applyPlanEntitlements } from "@/lib/billing/apply-plan-entitlements";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

export type FerocityBillingStatus = "active" | "trialing" | "past_due" | "cancelled";
export type StripeSubscriptionInvoiceEvent =
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.payment_action_required"
  | "invoice.finalization_failed";

type SubscriptionRow = {
  tenant_id: string;
  tenant_name: string;
  plan_key: string;
  status: string;
  owner_email: string | null;
  metadata_json: Record<string, unknown> | null;
};

function text(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stripeId(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) return text(value as Record<string, unknown>, "id");
  return null;
}

export function mapStripeSubscriptionStatus(status: string, eventType: string): FerocityBillingStatus {
  if (status === "canceled" || eventType === "customer.subscription.deleted") return "cancelled";
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (["past_due", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(status)) return "past_due";
  return "past_due";
}

export function getInvoiceSubscriptionId(invoice: Record<string, unknown>) {
  const legacy = stripeId(invoice.subscription);
  if (legacy) return legacy;
  const parent = objectValue(invoice, "parent");
  const subscriptionDetails = parent ? objectValue(parent, "subscription_details") : null;
  return subscriptionDetails ? stripeId(subscriptionDetails.subscription) : null;
}

export async function reconcileStripeSubscriptionInvoice(input: {
  eventId: string;
  eventType: StripeSubscriptionInvoiceEvent;
  invoice: Record<string, unknown>;
}) {
  const subscriptionId = getInvoiceSubscriptionId(input.invoice);
  const customerId = stripeId(input.invoice.customer);
  const billingReason = text(input.invoice, "billing_reason");
  if (!subscriptionId && !billingReason?.startsWith("subscription")) return { status: "not_tracked" as const };
  if (!subscriptionId && !customerId) return { status: "not_tracked" as const };

  const subscription = await queryPostgres<SubscriptionRow>(
    `select s.tenant_id,t.name tenant_name,s.plan_key,s.status,s.metadata_json,
            (select u.email from public.tenant_users tu join public.users u on u.id=tu.user_id
              where tu.tenant_id=s.tenant_id and tu.status='active' and tu.role in ('owner','admin')
              order by case when tu.role='owner' then 0 else 1 end,tu.created_at limit 1) owner_email
       from public.billing_subscriptions s
       join public.tenants t on t.id=s.tenant_id
      where ($1::text is not null and s.external_subscription_ref=$1)
         or ($2::text is not null and s.external_customer_ref=$2)
      order by case when s.external_subscription_ref=$1 then 0 else 1 end
      limit 1`,
    [subscriptionId, customerId]
  );
  const row = subscription?.rows[0];
  if (!row) return { status: "not_tracked" as const };

  const recovered = input.eventType === "invoice.paid";
  const nextStatus: FerocityBillingStatus = recovered ? "active" : "past_due";
  const invoiceId = stripeId(input.invoice.id) ?? input.eventId;
  const amountDue = typeof input.invoice.amount_due === "number" ? Math.max(0, Math.round(input.invoice.amount_due)) : 0;
  const periodEnd = typeof input.invoice.period_end === "number" ? input.invoice.period_end : null;

  await queryPostgres(
    `update public.billing_subscriptions
        set status=$2,
            current_period_end=case when $3::bigint is null then current_period_end else to_timestamp($3) end,
            metadata_json=(case
              when $5::boolean then metadata_json - 'billingPastDueSince'
              else metadata_json || jsonb_build_object(
                'billingPastDueSince',coalesce(metadata_json->>'billingPastDueSince',now()::text)
              )
            end) || $4::jsonb,
            updated_at=now()
      where tenant_id=$1`,
    [row.tenant_id, nextStatus, periodEnd, JSON.stringify({
      stripeInvoiceEventId: input.eventId,
      stripeInvoiceId: invoiceId,
      stripeInvoiceEventType: input.eventType
    }), recovered]
  );
  await applyPlanEntitlements({ tenantId: row.tenant_id, planKey: row.plan_key, billingStatus: nextStatus });

  const title = recovered ? "Ferocity subscription payment received" : "Ferocity subscription payment needs attention";
  const summary = recovered
    ? "Stripe confirmed the subscription payment and Ferocity restored the billing status to active."
    : "Stripe could not complete the subscription payment. Access remains available during recovery; update the payment method to prevent interruption.";
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
       owner_attention,ai_handled,ai_summary,recommended_action,action_href,money_cents,risk_type,confidence_score,metadata_json
     ) values ($1,'stripe','Stripe',$2,$3,$4,$5,$6,$7,$8,$9,true,$5,$10,'/app/billing',$11,'financial',100,$12::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update
       set title=excluded.title,summary=excluded.summary,severity=excluded.severity,status=excluded.status,
           owner_attention=excluded.owner_attention,ai_handled=excluded.ai_handled,ai_summary=excluded.ai_summary,
           recommended_action=excluded.recommended_action,money_cents=excluded.money_cents,
           metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json,updated_at=now()`,
    [
      row.tenant_id,
      `subscription-invoice:${invoiceId}`,
      input.eventType,
      title,
      summary,
      recovered ? "info" : "high",
      recovered ? "resolved" : "needs_owner",
      !recovered,
      recovered,
      recovered ? "No action is required." : "Open Billing and update the saved payment method.",
      amountDue,
      JSON.stringify({ stripeEventId: input.eventId, stripeInvoiceId: invoiceId, subscriptionId, customerId })
    ]
  );

  if (!recovered) {
    await sendWorkspacePushNotifications({
      tenantId: row.tenant_id,
      eventType: "billing.subscription_payment_failed",
      title,
      body: "Update the payment method in Billing to keep Ferocity running without interruption.",
      url: "/app/billing",
      tag: `subscription-payment-${invoiceId}`,
      metadata: { stripeEventId: input.eventId, stripeInvoiceId: invoiceId }
    });
    if (row.owner_email) {
      const appUrl = (env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/$/, "");
      await sendTransactionalEmail({
        to: row.owner_email,
        subject: "Action needed: update your Ferocity payment method",
        text: `Stripe could not complete your Ferocity subscription payment.\n\nYour workspace remains available while you fix it. Open Billing to update your payment method:\n${appUrl}/app/billing\n\nIf you already updated it, no further action is needed.`,
        tenantId: row.tenant_id,
        eventKey: `subscription_payment_failed_${invoiceId}`,
        metadata: { stripeEventId: input.eventId, stripeInvoiceId: invoiceId }
      });
    }
  }

  if (!recovered || billingReason !== "subscription_create") {
    await raisePlatformAdminAlert({
      fingerprint: `subscription-invoice:${invoiceId}:${input.eventType}`,
      family: "customer_revenue",
      type: recovered ? "subscription_payment_received" : "subscription_payment_failed",
      severity: recovered ? "info" : "high",
      title: recovered ? `Subscription payment received: ${row.tenant_name}` : `Subscription payment failed: ${row.tenant_name}`,
      body: recovered
        ? `Stripe confirmed ${amountDue > 0 ? `$${(amountDue / 100).toFixed(2)}` : "the recurring payment"} for ${row.tenant_name}.`
        : `Stripe could not complete ${amountDue > 0 ? `the $${(amountDue / 100).toFixed(2)} payment` : "the subscription payment"} for ${row.tenant_name}. The customer was prompted to update payment details.`,
      tenantId: row.tenant_id,
      actionUrl: "/app/platform-activity",
      metadata: { stripeEventId: input.eventId, stripeInvoiceId: invoiceId, subscriptionId, billingReason, amountDue }
    });
  }

  return { status: recovered ? "active" as const : "past_due" as const, tenantId: row.tenant_id };
}
