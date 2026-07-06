import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getCurrentAppSession } from "@/lib/auth/session";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

const checkoutSchema = z.object({
  plan: z.enum(["free", "job_tracker", "starter", "growth", "operator", "pro_agency"]),
  source: z.string().max(120).optional()
});

const priceEnvByPlan = {
  free: null,
  job_tracker: "STRIPE_PRICE_ID_JOB_TRACKER",
  starter: "STRIPE_PRICE_ID_STARTER",
  growth: "STRIPE_PRICE_ID_GROWTH",
  operator: "STRIPE_PRICE_ID_OPERATOR",
  pro_agency: null
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
    source: String(formData.get("source") ?? "")
  });

  if (!parsed.success) {
    return redirectTo(request, "/pricing?billing=invalid_plan");
  }

  const priceEnvKey = priceEnvByPlan[parsed.data.plan];
  if (parsed.data.plan === "free") {
    return startFallback(request, parsed.data.plan, "free_plan");
  }

  if (!priceEnvKey) {
    return startFallback(request, parsed.data.plan, "manual_plan");
  }

  const priceId = env[priceEnvKey];
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
    return startFallback(request, parsed.data.plan, "stripe_not_ready");
  }

  const origin = request.nextUrl.origin;
  const appSession = await getCurrentAppSession();
  const workspace = appSession ? await getCurrentWorkspace() : null;
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

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/checkout/success?plan=${encodeURIComponent(parsed.data.plan)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel?plan=${encodeURIComponent(parsed.data.plan)}`,
    client_reference_id: workspace?.id ?? appSession?.userId ?? parsed.data.source ?? "public_checkout"
  });

  if (appSession?.email) {
    body.set("customer_email", appSession.email);
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

  const checkoutSession = (await response.json()) as { url?: string };
  if (!checkoutSession.url) {
    return startFallback(request, parsed.data.plan, "stripe_missing_url");
  }

  return NextResponse.redirect(checkoutSession.url, 303);
}
