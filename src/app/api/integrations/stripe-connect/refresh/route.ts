import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { requirePermission } from "@/lib/auth/require-permission";
import { logAppError } from "@/lib/observability/log-error";
import {
  getManagedPaymentAccount,
  normalizeStripeV2Account,
  type StripeV2ConnectedAccount,
  stripeV2JsonRequest,
  upsertManagedPaymentAccount
} from "@/lib/payments/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const accountId = url.searchParams.get("account");
  const requestedReturn = url.searchParams.get("return");
  const returnTo = requestedReturn?.startsWith("/app/") || requestedReturn === "/app" ? requestedReturn : "/app/billing";

  if (!accountId) {
    return NextResponse.redirect(new URL(`${returnTo}?stripe_connect=missing_account`, request.url), 303);
  }

  try {
    const managedAccount = await getManagedPaymentAccount(actor.workspace.id);
    if (
      !managedAccount ||
      managedAccount.providerAccountId !== accountId ||
      managedAccount.apiVersion !== "v2"
    ) {
      return NextResponse.redirect(new URL(`${returnTo}?stripe_connect=account_mismatch`, request.url), 303);
    }

    if (url.searchParams.get("mode") === "link") {
      const appUrl = env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
      const accountLink = await stripeV2JsonRequest<{ url?: string }>("core/account_links", {
        body: {
          account: accountId,
          use_case: {
            type: "account_onboarding",
            account_onboarding: {
              configurations: ["merchant"],
              refresh_url: `${appUrl}/api/integrations/stripe-connect/refresh?account=${encodeURIComponent(accountId)}&mode=link&return=${encodeURIComponent(returnTo)}`,
              return_url: `${appUrl}/api/integrations/stripe-connect/refresh?account=${encodeURIComponent(accountId)}&return=${encodeURIComponent(returnTo)}`,
              collection_options: {
                fields: "eventually_due",
                future_requirements: "include"
              }
            }
          }
        },
        idempotencyKey: `ferocity-connect-v2-refresh-link-${actor.workspace.id}-${Math.floor(Date.now() / 60_000)}`
      });
      if (!accountLink.url) {
        throw new Error("Stripe did not return an onboarding link.");
      }
      return NextResponse.redirect(accountLink.url, 303);
    }

    const v2Account = await stripeV2JsonRequest<StripeV2ConnectedAccount>(
      `core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.merchant&include[]=requirements`
    );
    const account = normalizeStripeV2Account(v2Account);
    await upsertManagedPaymentAccount({
      tenantId: actor.workspace.id,
      account,
      userId: actor.userId === "admin-token" ? null : actor.userId,
      metadata: {
        refreshedFrom: "stripe_connect_refresh_route",
        stripeAccountApiVersion: "v2",
        stripeDashboard: "full"
      }
    });

    return NextResponse.redirect(new URL(`${returnTo}?stripe_connect=updated`, request.url), 303);
  } catch (error) {
    await logAppError({
      source: "api.integrations.stripe-connect.refresh",
      message: error instanceof Error ? error.message : "Stripe Connect refresh failed.",
      severity: "error",
      metadata: { tenantId: actor.workspace.id, accountId }
    });
    return NextResponse.redirect(new URL(`${returnTo}?stripe_connect=error`, request.url), 303);
  }
}
