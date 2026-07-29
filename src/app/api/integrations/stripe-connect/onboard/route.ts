import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { requirePermission } from "@/lib/auth/require-permission";
import { logAppError } from "@/lib/observability/log-error";
import {
  getManagedPaymentAccount,
  normalizeStripeV2Account,
  type StripeConnectedAccount,
  type StripeV2ConnectedAccount,
  stripeV2JsonRequest,
  upsertManagedPaymentAccount
} from "@/lib/payments/stripe-connect";

export const dynamic = "force-dynamic";

async function resolveContactEmail(tenantId: string, actorEmail: string) {
  if (actorEmail.includes("@")) return actorEmail;
  const result = await queryPostgres<{ email: string }>(
    `
    select u.email
    from public.tenant_users tu
    join public.users u on u.id = tu.user_id
    where tu.tenant_id = $1
      and tu.status = 'active'
      and u.email is not null
    order by case when tu.role = 'owner' then 0 else 1 end, tu.created_at
    limit 1
    `,
    [tenantId]
  );
  const email = result?.rows[0]?.email;
  if (!email?.includes("@")) {
    throw new Error("A workspace owner email is required before Stripe Connect onboarding.");
  }
  return email;
}

export async function POST() {
  const actor = await requirePermission("tenant:manage");
  const tenantId = actor.workspace.id;
  const appUrl = env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";

  if (!env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, status: "missing_stripe_secret" }, { status: 501 });
  }

  try {
    const existing = await getManagedPaymentAccount(tenantId);
    if (existing?.apiVersion !== undefined && existing.apiVersion !== "v2") {
      return NextResponse.json(
        { ok: false, status: "legacy_connect_account_requires_reconnect" },
        { status: 409 }
      );
    }
    const contactEmail = await resolveContactEmail(tenantId, actor.email);
    const account: StripeConnectedAccount =
      (existing
        ? {
            id: existing.providerAccountId,
            charges_enabled: existing.chargesEnabled,
            payouts_enabled: existing.payoutsEnabled,
            details_submitted: existing.detailsSubmitted
          }
        : null) ??
      normalizeStripeV2Account(
        await stripeV2JsonRequest<StripeV2ConnectedAccount>("core/accounts", {
          body: {
            contact_email: contactEmail,
            display_name: actor.workspace.name,
            dashboard: "full",
            configuration: {
              merchant: {
                capabilities: {
                  card_payments: { requested: true },
                  stripe_balance: {
                    payouts: { requested: true }
                  }
                }
              }
            },
            defaults: {
              currency: "usd",
              responsibilities: {
                fees_collector: "stripe",
                losses_collector: "stripe"
              },
              locales: ["en-US"]
            },
            include: ["configuration.merchant", "requirements"]
          },
          idempotencyKey: `ferocity-connect-v2-account-${tenantId}`
        })
      );

    if (!existing) {
      await upsertManagedPaymentAccount({
        tenantId,
        account,
        userId: actor.userId === "admin-token" ? null : actor.userId,
        metadata: {
          createdFrom: "stripe_connect_onboard_route",
          stripeAccountApiVersion: "v2",
          stripeDashboard: "full"
        }
      });
    }

    await queryPostgres(
      `
      insert into public.payment_provider_account_events (
        tenant_id, provider, event_type, event_status, provider_event_id, metadata_json
      )
      values ($1, 'stripe', 'connect_onboarding_started', 'recorded', $2, $3::jsonb)
      `,
      [tenantId, account.id, JSON.stringify({ actor: contactEmail, reusedExistingAccount: Boolean(existing) })]
    );

    const accountLink = await stripeV2JsonRequest<{ url?: string }>("core/account_links", {
      body: {
        account: account.id,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            refresh_url: `${appUrl}/api/integrations/stripe-connect/refresh?account=${encodeURIComponent(account.id)}&mode=link&return=/app/billing`,
            return_url: `${appUrl}/api/integrations/stripe-connect/refresh?account=${encodeURIComponent(account.id)}&return=/app/billing`,
            collection_options: {
              fields: "eventually_due",
              future_requirements: "include"
            }
          }
        }
      },
      idempotencyKey: `ferocity-connect-v2-link-${tenantId}-${Math.floor(Date.now() / 60_000)}`
    });

    if (!accountLink.url) {
      return NextResponse.json({ ok: false, status: "missing_account_link" }, { status: 502 });
    }

    return NextResponse.redirect(accountLink.url, 303);
  } catch (error) {
    await logAppError({
      source: "api.integrations.stripe-connect.onboard",
      message: error instanceof Error ? error.message : "Stripe Connect onboarding failed.",
      severity: "error",
      metadata: { tenantId }
    });
    return NextResponse.json({ ok: false, status: "stripe_connect_error" }, { status: 502 });
  }
}
