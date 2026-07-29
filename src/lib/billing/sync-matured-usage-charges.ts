import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";

type UsageCharge = {
  id: string;
  charge_key: string;
  fee_family: string;
  description: string;
  amount_cents: number;
  currency: string;
};

export type MaturedUsageSyncResult = {
  status: "disabled" | "not_ready" | "nothing_to_sync" | "synced";
  synced: number;
  failed: number;
};

async function createStripeInvoiceItem(input: {
  customerId: string;
  subscriptionId: string | null;
  tenantId: string;
  charge: UsageCharge;
}) {
  const body = new URLSearchParams({
    customer: input.customerId,
    amount: String(input.charge.amount_cents),
    currency: input.charge.currency,
    description: input.charge.description.slice(0, 500),
    "metadata[ferocity_kind]": "usage_rebilling",
    "metadata[tenant_id]": input.tenantId,
    "metadata[charge_id]": input.charge.id,
    "metadata[charge_key]": input.charge.charge_key,
    "metadata[fee_family]": input.charge.fee_family
  });
  if (input.subscriptionId) body.set("subscription", input.subscriptionId);

  const response = await fetch("https://api.stripe.com/v1/invoiceitems", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe invoice item failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return (await response.json()) as { id?: string; invoice?: string | null };
}

export async function syncMaturedUsageChargesForTenant(tenantId: string): Promise<MaturedUsageSyncResult> {
  if (env.FEROCITY_USAGE_BILLING_ENABLED !== "true") {
    return { status: "disabled", synced: 0, failed: 0 };
  }
  if (!env.STRIPE_SECRET_KEY) {
    return { status: "not_ready", synced: 0, failed: 0 };
  }

  const subscriptionResult = await queryPostgres<{
    external_customer_ref: string | null;
    external_subscription_ref: string | null;
    status: string;
  }>(
    `
    select external_customer_ref, external_subscription_ref, status
    from public.billing_subscriptions
    where tenant_id = $1
    limit 1
    `,
    [tenantId]
  );
  const subscription = subscriptionResult?.rows[0];
  if (
    !subscription?.external_customer_ref
    || !["active", "trialing"].includes(subscription.status)
  ) {
    return { status: "not_ready", synced: 0, failed: 0 };
  }

  const chargesResult = await queryPostgres<UsageCharge>(
    `
    select id, charge_key, fee_family, description, amount_cents, currency
    from public.billing_usage_charges
    where tenant_id = $1
      and status = 'approved'
      and amount_cents > 0
      and period_end is not null
      and period_end <= now()
    order by period_end asc, created_at asc
    limit 25
    `,
    [tenantId]
  );
  const charges = chargesResult?.rows ?? [];
  if (charges.length === 0) return { status: "nothing_to_sync", synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  for (const charge of charges) {
    try {
      const stripeItem = await createStripeInvoiceItem({
        customerId: subscription.external_customer_ref,
        subscriptionId: subscription.external_subscription_ref,
        tenantId,
        charge
      });
      await queryPostgres(
        `
        update public.billing_usage_charges
        set status = 'queued_for_invoice',
            stripe_invoice_item_id = $3,
            stripe_invoice_id = nullif($4, ''),
            synced_at = now(),
            last_error = null,
            metadata_json = metadata_json || '{"automaticallySynced":true}'::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $2 and status = 'approved'
        `,
        [tenantId, charge.id, stripeItem.id ?? "", stripeItem.invoice ?? ""]
      );
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Stripe usage billing error.";
      await queryPostgres(
        `
        update public.billing_usage_charges
        set status = 'failed', last_error = $3, updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [tenantId, charge.id, message.slice(0, 1000)]
      );
      await logAppError({
        source: "automation.billing.usage",
        message: "Matured usage charge failed to sync to Stripe.",
        severity: "warning",
        tenantId,
        metadata: { chargeId: charge.id, error: message.slice(0, 500) }
      });
      failed += 1;
    }
  }
  return { status: "synced", synced, failed };
}
