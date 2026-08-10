import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const providerSchema = z.enum(["google_ads", "meta_ads", "tiktok_ads", "reddit_ads", "microsoft_ads"]);
const checkoutSchema = z.object({
  providerKey: providerSchema,
  amount: z.coerce.number().min(25).max(50_000)
});

const providerNames: Record<z.infer<typeof providerSchema>, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  reddit_ads: "Reddit Ads",
  microsoft_ads: "Microsoft Ads"
};

export async function POST(request: NextRequest) {
  const actor = await requirePermission("billing:manage");
  const formData = await request.formData();
  const parsed = checkoutSchema.safeParse({
    providerKey: formData.get("providerKey"),
    amount: formData.get("amount")
  });
  if (!parsed.success) return safeRedirect(request, "/app/billing?ad_wallet=invalid_amount");
  if (!env.STRIPE_SECRET_KEY) return safeRedirect(request, "/app/billing?ad_wallet=stripe_not_ready");

  const tenantId = await getCurrentWorkspaceId();
  const amountCents = Math.round(parsed.data.amount * 100);
  const budget = await queryPostgres<{ id: string }>(
    `
    select id
    from public.managed_ad_budget_controls
    where tenant_id = $1 and provider_key = $2 and lane_key = 'ferocity_managed'
    limit 1
    `,
    [tenantId, parsed.data.providerKey]
  );
  if (!budget?.rows[0]?.id) return safeRedirect(request, "/app/billing?ad_wallet=provider_not_ready");

  const subscription = await queryPostgres<{ external_customer_ref: string | null }>(
    `select external_customer_ref from public.billing_subscriptions where tenant_id = $1 limit 1`,
    [tenantId]
  );
  const stripeCustomerId = subscription?.rows[0]?.external_customer_ref ?? null;
  const origin = request.nextUrl.origin;
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `${providerNames[parsed.data.providerKey]} prepaid advertising funds`,
    "line_items[0][price_data][product_data][description]": "Media budget reserved for this Ferocity workspace. Management fees are separate.",
    "line_items[0][quantity]": "1",
    success_url: `${origin}/app/billing?ad_wallet=funded&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/billing?ad_wallet=cancelled`,
    client_reference_id: tenantId,
    "metadata[ferocity_kind]": "managed_ad_wallet_credit",
    "metadata[tenant_id]": tenantId,
    "metadata[provider_key]": parsed.data.providerKey,
    "metadata[amount_cents]": String(amountCents),
    "metadata[user_id]": actor.userId
  });
  if (stripeCustomerId) body.set("customer", stripeCustomerId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) {
    await logAppError({
      source: "api.billing.ad-wallet.checkout",
      message: "Stripe could not create the managed-ad wallet checkout.",
      severity: "warning",
      metadata: { tenantId, providerKey: parsed.data.providerKey, amountCents, status: response.status }
    });
    return safeRedirect(request, "/app/billing?ad_wallet=stripe_error");
  }

  const session = (await response.json()) as { url?: string };
  return session.url
    ? NextResponse.redirect(session.url, 303)
    : safeRedirect(request, "/app/billing?ad_wallet=stripe_error");
}
