import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { isSelfServePlanKey } from "@/lib/billing/public-plans";
import { queryPostgres } from "@/lib/db/postgres";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { hashSessionToken } from "@/lib/auth/password";

const checkoutSchema = z.object({
  plan: z.string().trim(),
  billingInterval: z.enum(["month", "year"]).default("month"),
  source: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional(),
  companyName: z.string().trim().min(1).max(180).optional(),
  name: z.string().trim().max(160).optional(),
  consentToContact: z.string().optional(),
  termsAccepted: z.string().optional()
  ,accessRequestId: z.string().uuid().optional()
  ,checkoutHandoff: z.string().trim().min(32).max(200).optional()
});

const priceEnvByPlan = {
  ferocity_connect: "STRIPE_PRICE_ID_FEROCITY_CONNECT",
  calls: "STRIPE_PRICE_ID_CALLS",
  job_tracker: "STRIPE_PRICE_ID_JOB_TRACKER",
  starter: "STRIPE_PRICE_ID_STARTER",
  growth: "STRIPE_PRICE_ID_GROWTH",
  operator: "STRIPE_PRICE_ID_OPERATOR"
} as const;

const annualPriceEnvByPlan = {
  starter: "STRIPE_PRICE_ID_STARTER_ANNUAL",
  growth: "STRIPE_PRICE_ID_GROWTH_ANNUAL",
  operator: "STRIPE_PRICE_ID_OPERATOR_ANNUAL"
} as const;

function redirectTo(request: NextRequest, path: string) {
  return safeRedirect(request, path);
}

function startFallback(request: NextRequest, plan: string, reason: string) {
  const params = new URLSearchParams({
    source: "checkout",
    plan,
    billing: reason
  });
  return redirectTo(request, `/start?${params.toString()}`);
}

async function markCheckoutFailure(accessRequestId: string | null, reason: string) {
  if (!accessRequestId) return;
  try {
    await queryPostgres(
      `update public.access_requests
       set status='new',metadata_json=metadata_json || $2::jsonb,updated_at=now()
       where id=$1 and request_type='paid_checkout'`,
      [accessRequestId, JSON.stringify({ checkoutStatus: "checkout_failed", checkoutFailureReason: reason })],
    );
  } catch (error) {
    await logAppError({
      source: "api.billing.checkout",
      message: "Checkout failed and its recovery checkpoint could not be updated.",
      severity: "error",
      metadata: { accessRequestId, reason, safeError: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function updateExistingSubscription(input: {
  subscriptionId: string;
  priceId: string;
  plan: string;
  tenantId: string;
  billingInterval: "month" | "year";
}) {
  const currentResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    cache: "no-store"
  });
  const current = await currentResponse.json() as { items?: { data?: Array<{ id?: string }> }; status?: string; metadata?: Record<string, string> };
  const itemId = current.items?.data?.[0]?.id;
  if (!currentResponse.ok || !itemId || current.status === "canceled") return { ok: false, status: currentResponse.status };

  const body = new URLSearchParams({
    "items[0][id]": itemId,
    "items[0][price]": input.priceId,
    proration_behavior: "always_invoice",
    payment_behavior: "pending_if_incomplete",
    "metadata[plan_key]": input.plan,
    "metadata[tenant_id]": input.tenantId,
    "metadata[purchase_flow]": "plan_change"
  });
  body.set("metadata[billing_interval]", input.billingInterval);
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  return { ok: response.ok, status: response.status };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = checkoutSchema.safeParse({
    plan: String(formData.get("plan") ?? ""),
    billingInterval: String(formData.get("billingInterval") ?? "month"),
    source: String(formData.get("source") ?? ""),
    email: String(formData.get("email") ?? "") || undefined,
    companyName: String(formData.get("companyName") ?? "") || undefined,
    name: String(formData.get("name") ?? "") || undefined,
    consentToContact: String(formData.get("consentToContact") ?? "") || undefined,
    termsAccepted: String(formData.get("termsAccepted") ?? "") || undefined
    ,accessRequestId: String(formData.get("accessRequestId") ?? "") || undefined
    ,checkoutHandoff: String(formData.get("checkoutHandoff") ?? "") || undefined
  });

  if (!parsed.success || !isSelfServePlanKey(parsed.data.plan)) {
    return redirectTo(request, "/pricing?billing=invalid_plan");
  }

  const annualPlan = parsed.data.billingInterval === "year" && parsed.data.plan in annualPriceEnvByPlan;
  const priceEnvKey = annualPlan
    ? annualPriceEnvByPlan[parsed.data.plan as keyof typeof annualPriceEnvByPlan]
    : priceEnvByPlan[parsed.data.plan];
  const priceId = env[priceEnvKey];
  const appSession = await getCurrentAppSession();
  const workspace = appSession ? await getCurrentWorkspace() : null;
  const publicSignup = !workspace;

  if (workspace) {
    await requirePermission("billing:manage");
  }

  if (publicSignup && (!parsed.data.email || !parsed.data.companyName || parsed.data.consentToContact !== "on" || parsed.data.termsAccepted !== "on")) {
    return redirectTo(request, `/subscribe?plan=${encodeURIComponent(parsed.data.plan)}&billing=${parsed.data.billingInterval}&error=details`);
  }

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    await logAppError({
      source: "api.billing.checkout",
      message: "Checkout requested before Stripe credentials or price IDs were configured.",
      severity: "info",
      metadata: {
        plan: parsed.data.plan,
        source: parsed.data.source,
        missing: {
          STRIPE_SECRET_KEY: !env.STRIPE_SECRET_KEY,
          [priceEnvKey]: !priceId
        }
      }
    });
    return publicSignup
      ? redirectTo(request, `/subscribe?plan=${encodeURIComponent(parsed.data.plan)}&billing=${parsed.data.billingInterval}&error=checkout_not_ready`)
      : startFallback(request, parsed.data.plan, "stripe_not_ready");
  }

  const origin = request.nextUrl.origin;
  let accessRequestId: string | null = null;

  if (workspace && workspace.accountType !== "internal") {
    const existing = await queryPostgres<{ external_subscription_ref: string | null; plan_key: string; status: string }>(
      `select external_subscription_ref,plan_key,status from public.billing_subscriptions
        where tenant_id=$1 limit 1`,
      [workspace.id]
    );
    const subscription = existing?.rows[0];
    if (subscription?.external_subscription_ref && ["active", "trialing", "past_due", "incomplete"].includes(subscription.status)) {
      if (subscription.plan_key === parsed.data.plan && parsed.data.billingInterval === "month") {
        return redirectTo(request, "/app/billing?plan=already_active");
      }
      const updated = await updateExistingSubscription({
        subscriptionId: subscription.external_subscription_ref,
        priceId,
        plan: parsed.data.plan,
        tenantId: workspace.id,
        billingInterval: parsed.data.billingInterval
      });
      if (!updated.ok) {
        await logAppError({
          source: "api.billing.checkout",
          message: "Stripe could not safely update the existing Ferocity subscription.",
          severity: "warning",
          metadata: { tenantId: workspace.id, plan: parsed.data.plan, stripeStatus: updated.status }
        });
        return startFallback(request, parsed.data.plan, "plan_change_failed");
      }
      return redirectTo(request, `/app/billing?plan_change=${encodeURIComponent(parsed.data.plan)}`);
    }
  }

  if (publicSignup) {
    const reusableRequest = parsed.data.accessRequestId && parsed.data.checkoutHandoff
      ? await queryPostgres<{ id: string }>(`
          update public.access_requests set
            status='new',
            metadata_json=(metadata_json-'checkoutHandoffTokenHash'-'checkoutHandoffExpiresAt') || $6::jsonb,
            updated_at=now()
          where id=$1 and lower(email)=lower($2) and company_name=$3 and requested_plan=$4
            and metadata_json->>'checkoutHandoffTokenHash'=$5
            and (metadata_json->>'checkoutHandoffExpiresAt')::timestamptz > now()
          returning id`, [
            parsed.data.accessRequestId,
            parsed.data.email,
            parsed.data.companyName,
            parsed.data.plan,
            hashSessionToken(parsed.data.checkoutHandoff),
            JSON.stringify({
              purchaseFlow: "guided_start_to_checkout",
              checkoutStatus: "creating",
              consentToContact: true,
              termsAccepted: true,
              termsVersion: TERMS_VERSION,
              billingInterval: parsed.data.billingInterval,
            }),
          ])
      : null;
    const accessRequest = reusableRequest?.rows[0] ? reusableRequest : await queryPostgres<{ id: string }>(
      `
      insert into public.access_requests (
        request_type, status, priority, name, email, company_name, requested_plan,
        source, source_detail, metadata_json, ip_address, user_agent
      )
      values (
        'paid_checkout', 'new', 'high', $1, lower($2), $3, $4,
        'stripe_checkout', $5, $6::jsonb, $7::inet, $8
      )
      returning id
      `,
      [
        parsed.data.name || null,
        parsed.data.email,
        parsed.data.companyName,
        parsed.data.plan,
        parsed.data.source || "public_subscribe",
        JSON.stringify({
           purchaseFlow: "public_signup",
           checkoutStatus: "creating",
           consentToContact: true,
           termsAccepted: true,
           termsVersion: TERMS_VERSION,
           submittedAt: new Date().toISOString(),
           billingInterval: parsed.data.billingInterval
        }),
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        request.headers.get("user-agent") || null
      ]
    );
    accessRequestId = accessRequest?.rows[0]?.id ?? null;
    if (!accessRequestId) {
      return redirectTo(request, `/subscribe?plan=${encodeURIComponent(parsed.data.plan)}&error=save`);
    }
  }

  const metadata: Record<string, string> = {
    plan_key: parsed.data.plan,
    billing_interval: parsed.data.billingInterval,
    source: parsed.data.source ?? "pricing"
  };

  if (workspace && workspace.accountType !== "internal") {
    metadata.tenant_id = workspace.id;
    metadata.workspace_slug = workspace.slug;
    metadata.workspace_name = workspace.name;
  }

  if (appSession?.userId) {
    metadata.user_id = appSession.userId;
  }
  if (publicSignup) {
    metadata.purchase_flow = "public_signup";
    metadata.access_request_id = accessRequestId!;
    metadata.company_name = parsed.data.companyName!;
    metadata.terms_accepted = "true";
    metadata.terms_version = TERMS_VERSION;
    if (parsed.data.name) metadata.buyer_name = parsed.data.name;
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/checkout/success?plan=${encodeURIComponent(parsed.data.plan)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel?plan=${encodeURIComponent(parsed.data.plan)}`,
    client_reference_id: workspace?.id ?? appSession?.userId ?? accessRequestId ?? "public_checkout"
  });

  const customerEmail = appSession?.email ?? parsed.data.email;
  if (customerEmail) {
    body.set("customer_email", customerEmail);
  }

  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
    body.set(`subscription_data[metadata][${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    await logAppError({
      source: "api.billing.checkout",
      message: "Stripe checkout session creation failed.",
      severity: "warning",
      metadata: {
        plan: parsed.data.plan,
        status: response.status,
        detail: detail.slice(0, 500)
      }
    });
    await markCheckoutFailure(accessRequestId, "stripe_session_creation_failed");
    return startFallback(request, parsed.data.plan, "stripe_error");
  }

  const checkoutSession = (await response.json()) as { id?: string; url?: string };
  if (!checkoutSession.url) {
    await markCheckoutFailure(accessRequestId, "stripe_session_missing_url");
    return startFallback(request, parsed.data.plan, "stripe_missing_url");
  }

  if (accessRequestId) {
    await queryPostgres(
      `
      update public.access_requests
      set status = 'reviewing',
          metadata_json = metadata_json || $2::jsonb,
          updated_at = now()
      where id = $1
      `,
      [
        accessRequestId,
        JSON.stringify({
          checkoutStatus: "redirected",
          stripeCheckoutSessionId: checkoutSession.id ?? null
        })
      ]
    );
  }

  return NextResponse.redirect(checkoutSession.url, 303);
}
