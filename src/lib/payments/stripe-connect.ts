import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";

export type StripeConnectedAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[]; past_due?: string[]; disabled_reason?: string | null };
};

export type StripeV2ConnectedAccount = {
  id: string;
  dashboard?: "full" | "express" | "none";
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status?: string };
      };
    };
  };
  requirements?: {
    entries?: Array<{
      status?: string;
      requested_reasons?: Array<{ code?: string }>;
    }>;
  };
};

export type ManagedPaymentAccount = {
  id: string;
  providerAccountId: string;
  apiVersion: "v1" | "v2";
  accountStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export function managedPaymentsEnabled() {
  return env.FEROCITY_MANAGED_PAYMENTS_ENABLED === "true";
}

export function managedPaymentFeeBps() {
  const configured = Number(env.FEROCITY_MANAGED_PAYMENT_FEE_BPS ?? 150);
  return Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 1000) : 150;
}

export function calculatePlatformFeeCents(amountCents: number) {
  if (!managedPaymentsEnabled()) return 0;
  return Math.max(0, Math.floor((amountCents * managedPaymentFeeBps()) / 10000));
}

export async function stripeFormRequest<T>(
  path: string,
  body: URLSearchParams,
  options: { connectedAccountId?: string; idempotencyKey?: string } = {}
) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (options.connectedAccountId) headers["Stripe-Account"] = options.connectedAccountId;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers,
    body
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Stripe request failed with ${response.status}.`);
  }
  return json as T;
}

export async function stripeGetRequest<T>(path: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");

  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\/+/, "")}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Stripe request failed with ${response.status}.`);
  }
  return json as T;
}

function stripeV2Version() {
  return env.STRIPE_V2_VERSION ?? "2026-06-24.preview";
}

export async function stripeV2JsonRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown>; idempotencyKey?: string } = {}
) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Stripe-Version": stripeV2Version()
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v2/${path.replace(/^\/+/, "")}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Stripe v2 request failed with ${response.status}.`);
  }
  return json as T;
}

export function normalizeStripeV2Account(account: StripeV2ConnectedAccount): StripeConnectedAccount {
  const cardStatus = account.configuration?.merchant?.capabilities?.card_payments?.status;
  const requirements = account.requirements?.entries ?? [];
  const currentlyDue = requirements
    .filter((entry) => entry.status === "currently_due")
    .flatMap((entry) => entry.requested_reasons?.map((reason) => reason.code).filter(Boolean) ?? []) as string[];
  const pastDue = requirements
    .filter((entry) => entry.status === "past_due")
    .flatMap((entry) => entry.requested_reasons?.map((reason) => reason.code).filter(Boolean) ?? []) as string[];
  const active = cardStatus === "active";
  return {
    id: account.id,
    charges_enabled: active,
    payouts_enabled: active,
    details_submitted: requirements.length === 0 || (currentlyDue.length === 0 && pastDue.length === 0),
    requirements: {
      currently_due: currentlyDue,
      past_due: pastDue,
      disabled_reason: pastDue.length > 0 ? "requirements.past_due" : null
    }
  };
}

export async function getManagedPaymentAccount(tenantId: string): Promise<ManagedPaymentAccount | null> {
  const result = await queryPostgres<{
    id: string;
    provider_account_id: string | null;
    metadata_json: Record<string, unknown> | null;
    account_status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  }>(
    `
    select id, provider_account_id, metadata_json, account_status, charges_enabled, payouts_enabled, details_submitted
    from public.payment_provider_accounts
    where tenant_id = $1
      and provider = 'stripe'
      and payment_mode = 'ferocity_managed_connect'
      and ownership_label = 'ferocity_managed'
      and provider_account_id is not null
    order by updated_at desc
    limit 1
    `,
    [tenantId]
  );
  const row = result?.rows[0];
  if (!row?.provider_account_id) return null;

  return {
    id: row.id,
    providerAccountId: row.provider_account_id,
    apiVersion: row.metadata_json?.stripeAccountApiVersion === "v2" ? "v2" : "v1",
    accountStatus: row.account_status,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted
  };
}

export function stripeConnectStatus(account: StripeConnectedAccount) {
  if (account.requirements?.disabled_reason) return "restricted";
  if (!account.details_submitted) return "onboarding_started";
  if (account.charges_enabled && account.payouts_enabled) return "connected";
  if (account.requirements?.currently_due?.length || account.requirements?.past_due?.length) return "requirements_due";
  return "onboarding_started";
}

export async function upsertManagedPaymentAccount({
  tenantId,
  brandId,
  account,
  userId,
  metadata = {}
}: {
  tenantId: string;
  brandId?: string | null;
  account: StripeConnectedAccount;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const status = stripeConnectStatus(account);
  await queryPostgres(
    `
    insert into public.payment_provider_accounts (
      tenant_id, brand_id, provider, payment_mode, ownership_label, provider_account_id,
      account_status, charges_enabled, payouts_enabled, details_submitted, last_provider_sync_at,
      metadata_json, created_by_user_id, updated_at
    )
    values (
      $1, $2, 'stripe', 'ferocity_managed_connect', 'ferocity_managed', $3,
      $4, $5, $6, $7, now(), $8::jsonb, nullif($9::text, '')::uuid, now()
    )
    on conflict (provider, provider_account_id) where provider_account_id is not null do update
    set tenant_id = excluded.tenant_id,
        brand_id = coalesce(excluded.brand_id, public.payment_provider_accounts.brand_id),
        account_status = excluded.account_status,
        charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled,
        details_submitted = excluded.details_submitted,
        last_provider_sync_at = now(),
        metadata_json = public.payment_provider_accounts.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      tenantId,
      brandId ?? null,
      account.id,
      status,
      Boolean(account.charges_enabled),
      Boolean(account.payouts_enabled),
      Boolean(account.details_submitted),
      JSON.stringify({
        ...metadata,
        requirements: account.requirements ?? {},
        statusSource: "stripe_connect"
      }),
      userId ?? ""
    ]
  );

  await queryPostgres(
    `
    insert into public.integration_connections (
      tenant_id, provider, display_name, status, credentials_status, metadata_json, last_checked_at, updated_at
    )
    values (
      $1, 'stripe_connect', 'Stripe Connect Managed Payments', $2, $3,
      jsonb_build_object('connectedAccountId', $4::text, 'chargesEnabled', $5::boolean, 'payoutsEnabled', $6::boolean),
      now(), now()
    )
    on conflict (tenant_id, provider) do update
    set status = excluded.status,
        credentials_status = excluded.credentials_status,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        last_checked_at = now(),
        updated_at = now()
    `,
    [
      tenantId,
      status === "connected" ? "connected" : "planned",
      status === "connected" ? "configured" : "not_configured",
      account.id,
      Boolean(account.charges_enabled),
      Boolean(account.payouts_enabled)
    ]
  );
}
