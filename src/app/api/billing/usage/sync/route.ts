import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type UsageCharge = {
  id: string;
  charge_key: string;
  fee_family: string;
  description: string;
  amount_cents: number;
  currency: string;
};

type BillingSubscription = {
  external_customer_ref: string | null;
  external_subscription_ref: string | null;
  status: string;
};

export const dynamic = "force-dynamic";

function wantsJson(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

function result(request: NextRequest, body: Record<string, unknown>, status = 200) {
  if (wantsJson(request)) {
    return NextResponse.json(body, { status });
  }
  const query = new URLSearchParams({
    usageBilling: String(body.status ?? (body.ok ? "ok" : "error"))
  });
  if (typeof body.synced === "number") query.set("synced", String(body.synced));
  if (typeof body.failed === "number") query.set("failed", String(body.failed));
  return NextResponse.redirect(new URL(`/app/billing?${query.toString()}`, request.nextUrl.origin), 303);
}

function usageBillingEnabled() {
  return env.FEROCITY_USAGE_BILLING_ENABLED === "true";
}

function stripeMetadata(charge: UsageCharge, workspaceId: string) {
  return {
    ferocity_kind: "usage_rebilling",
    tenant_id: workspaceId,
    charge_id: charge.id,
    charge_key: charge.charge_key,
    fee_family: charge.fee_family
  };
}

async function createStripeInvoiceItem(input: {
  customerId: string;
  subscriptionId: string | null;
  workspaceId: string;
  charge: UsageCharge;
}) {
  const body = new URLSearchParams({
    customer: input.customerId,
    amount: String(input.charge.amount_cents),
    currency: input.charge.currency,
    description: input.charge.description.slice(0, 500)
  });

  if (input.subscriptionId) {
    body.set("subscription", input.subscriptionId);
  }

  for (const [key, value] of Object.entries(stripeMetadata(input.charge, input.workspaceId))) {
    body.set(`metadata[${key}]`, value);
  }

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

export async function POST(request: NextRequest) {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    return result(request, { ok: false, status: "login_required", message: "Login required." }, 401);
  }

  if (!usageBillingEnabled()) {
    return result(request, {
      ok: false,
      status: "usage_billing_disabled",
      message: "Set FEROCITY_USAGE_BILLING_ENABLED=true before syncing usage charges to Stripe."
    }, 409);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return result(request, { ok: false, status: "stripe_not_ready", message: "Missing STRIPE_SECRET_KEY." }, 409);
  }

  const workspaceId = await getCurrentWorkspaceId();
  const subscriptionResult = await queryPostgres<BillingSubscription>(
    `
    select external_customer_ref, external_subscription_ref, status
    from public.billing_subscriptions
    where tenant_id = $1
    limit 1
    `,
    [workspaceId]
  );
  const subscription = subscriptionResult?.rows[0];

  if (!subscription?.external_customer_ref) {
    return result(request, {
      ok: false,
      status: "missing_stripe_customer",
      message: "This workspace needs a Stripe subscription customer before usage charges can be queued."
    }, 409);
  }

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return result(request, {
      ok: false,
      status: "subscription_not_active",
      message: `Usage charges are blocked while subscription status is ${subscription.status}.`
    }, 409);
  }

  const chargesResult = await queryPostgres<UsageCharge>(
    `
    select id, charge_key, fee_family, description, amount_cents, currency
    from public.billing_usage_charges
    where tenant_id = $1
      and status = 'approved'
      and amount_cents > 0
      and (
        coalesce(metadata_json->>'aggregatedMonthly', 'false') <> 'true'
        or period_end <= now()
      )
    order by created_at asc
    limit 50
    `,
    [workspaceId]
  );
  const charges = chargesResult?.rows ?? [];

  if (charges.length === 0) {
    return result(request, { ok: true, status: "nothing_to_sync", synced: 0 });
  }

  const results: { id: string; status: "queued_for_invoice" | "failed"; stripeInvoiceItemId?: string; error?: string }[] = [];

  for (const charge of charges) {
    try {
      const stripeItem = await createStripeInvoiceItem({
        customerId: subscription.external_customer_ref,
        subscriptionId: subscription.external_subscription_ref,
        workspaceId,
        charge
      });

      await queryPostgres(
        `
        update public.billing_usage_charges
        set status = 'queued_for_invoice',
            stripe_invoice_item_id = $2,
            stripe_invoice_id = nullif($3::text, ''),
            synced_at = now(),
            last_error = null,
            metadata_json = metadata_json || $4::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $5
        `,
        [
          workspaceId,
          stripeItem.id ?? "",
          stripeItem.invoice ?? "",
          JSON.stringify({ stripeInvoiceItemCreatedAt: new Date().toISOString(), syncedBy: adminSession ? "admin" : appSession?.userId ?? "app_session" }),
          charge.id
        ]
      );

      results.push({ id: charge.id, status: "queued_for_invoice", stripeInvoiceItemId: stripeItem.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Stripe usage billing error.";
      await queryPostgres(
        `
        update public.billing_usage_charges
        set status = 'failed',
            last_error = $2,
            updated_at = now()
        where tenant_id = $1 and id = $3
        `,
        [workspaceId, message.slice(0, 1000), charge.id]
      );
      await logAppError({
        source: "api.billing.usage.sync",
        message: "Usage charge failed to sync to Stripe.",
        severity: "warning",
        tenantId: workspaceId,
        metadata: { chargeId: charge.id, error: message.slice(0, 500) }
      });
      results.push({ id: charge.id, status: "failed", error: message.slice(0, 300) });
    }
  }

  return result(request, {
    ok: true,
    status: "synced",
    synced: results.filter((result) => result.status === "queued_for_invoice").length,
    failed: results.filter((result) => result.status === "failed").length,
    results
  });
}
