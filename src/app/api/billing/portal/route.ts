import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function redirectTo(request: NextRequest, path: string) {
  return safeRedirect(request, path);
}

export async function POST(request: NextRequest) {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    return redirectTo(request, "/login?next=/app/billing");
  }

  if (!env.STRIPE_SECRET_KEY) {
    await logAppError({
      source: "api.billing.portal",
      message: "Stripe billing portal requested before STRIPE_SECRET_KEY was configured.",
      severity: "info"
    });
    return redirectTo(request, "/app/billing?portal=stripe_not_ready");
  }

  const workspaceId = await getCurrentWorkspaceId();
  const subscription = await queryPostgres<{ external_customer_ref: string | null }>(
    `
    select external_customer_ref
    from public.billing_subscriptions
    where tenant_id = $1
    limit 1
    `,
    [workspaceId]
  );
  const customerId = subscription?.rows[0]?.external_customer_ref;

  if (!customerId) {
    return redirectTo(request, "/app/billing?portal=missing_customer");
  }

  const body = new URLSearchParams({
    customer: customerId,
    return_url: `${request.nextUrl.origin}/app/billing?portal=returned`
  });

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
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
      source: "api.billing.portal",
      message: "Stripe billing portal session creation failed.",
      severity: "warning",
      tenantId: workspaceId,
      metadata: {
        status: response.status,
        detail: detail.slice(0, 500)
      }
    });
    return redirectTo(request, "/app/billing?portal=stripe_error");
  }

  const session = (await response.json()) as { url?: string };
  if (!session.url) {
    return redirectTo(request, "/app/billing?portal=stripe_missing_url");
  }

  return NextResponse.redirect(session.url, 303);
}
