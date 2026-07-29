import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getCurrentAppSession } from "@/lib/auth/session";
import { isSelfServePlanKey } from "@/lib/billing/public-plans";
import { queryPostgres } from "@/lib/db/postgres";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

const checkoutSchema = z.object({
  plan: z.string().trim(),
  source: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional(),
  companyName: z.string().trim().min(1).max(180).optional(),
  name: z.string().trim().max(160).optional(),
  consentToContact: z.string().optional()
});

const priceEnvByPlan = {
  job_tracker: "STRIPE_PRICE_ID_JOB_TRACKER",
  starter: "STRIPE_PRICE_ID_STARTER",
  growth: "STRIPE_PRICE_ID_GROWTH",
  operator: "STRIPE_PRICE_ID_OPERATOR"
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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = checkoutSchema.safeParse({
    plan: String(formData.get("plan") ?? ""),
    source: String(formData.get("source") ?? ""),
    email: String(formData.get("email") ?? "") || undefined,
    companyName: String(formData.get("companyName") ?? "") || undefined,
    name: String(formData.get("name") ?? "") || undefined,
    consentToContact: String(formData.get("consentToContact") ?? "") || undefined
  });

  if (!parsed.success || !isSelfServePlanKey(parsed.data.plan)) {
    return redirectTo(request, "/pricing?billing=invalid_plan");
  }

  const priceEnvKey = priceEnvByPlan[parsed.data.plan];
  const priceId = env[priceEnvKey];
  const appSession = await getCurrentAppSession();
  const workspace = appSession ? await getCurrentWorkspace() : null;
  const publicSignup = !workspace;

  if (publicSignup && (!parsed.data.email || !parsed.data.companyName || parsed.data.consentToContact !== "on")) {
    return redirectTo(request, `/subscribe?plan=${encodeURIComponent(parsed.data.plan)}&error=details`);
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
      ? redirectTo(request, `/subscribe?plan=${encodeURIComponent(parsed.data.plan)}&error=checkout_not_ready`)
      : startFallback(request, parsed.data.plan, "stripe_not_ready");
  }

  const origin = request.nextUrl.origin;
  let accessRequestId: string | null = null;

  if (publicSignup) {
    const accessRequest = await queryPostgres<{ id: string }>(
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
          submittedAt: new Date().toISOString()
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
    return startFallback(request, parsed.data.plan, "stripe_error");
  }

  const checkoutSession = (await response.json()) as { id?: string; url?: string };
  if (!checkoutSession.url) {
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
