import fs from "node:fs";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
  throw new Error("DATABASE_URL and STRIPE_SECRET_KEY are required.");
}

const tenantId = process.env.STRIPE_CONNECT_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const apply = process.env.CONFIRM_STRIPE_CONNECT_RECONCILE === "YES";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const result = await client.query(
    `select id,provider_account_id,account_status,charges_enabled,payouts_enabled
       from public.payment_provider_accounts
      where tenant_id=$1 and provider='stripe' and payment_mode='ferocity_managed_connect'
        and ownership_label='ferocity_managed' and provider_account_id is not null
      order by updated_at desc limit 1`,
    [tenantId]
  );
  const account = result.rows[0];
  if (!account?.provider_account_id) throw new Error("No managed Stripe Connect account exists for this tenant.");

  const query = new URLSearchParams();
  query.set("include[0]", "configuration.merchant");
  query.set("include[1]", "requirements");
  const response = await fetch(`https://api.stripe.com/v2/core/accounts/${encodeURIComponent(account.provider_account_id)}?${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": process.env.STRIPE_V2_VERSION ?? "2026-06-24.preview"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}.`);

  const cardStatus = payload.configuration?.merchant?.capabilities?.card_payments?.status ?? "unknown";
  const payoutStatus = payload.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status ?? "unknown";
  const requirements = payload.requirements?.entries ?? [];
  const due = requirements.filter((entry) => entry.status === "currently_due").length;
  const pastDue = requirements.filter((entry) => entry.status === "past_due").length;
  const status = due > 0 || pastDue > 0
    ? "requirements_due"
    : cardStatus === "active" && payoutStatus === "active"
      ? "connected"
      : payoutStatus === "pending" || cardStatus === "pending"
        ? "pending_review"
        : "restricted";
  const chargesEnabled = cardStatus === "active";
  const payoutsEnabled = payoutStatus === "active";
  const detailsSubmitted = due === 0 && pastDue === 0;

  if (apply) {
    await client.query("begin");
    try {
      await client.query(
        `update public.payment_provider_accounts
            set account_status=$2,charges_enabled=$3,payouts_enabled=$4,details_submitted=$5,
                last_provider_sync_at=now(),updated_at=now(),
                metadata_json=metadata_json || jsonb_build_object(
                  'lastManualReconcileAt',now(),'cardPaymentsStatus',$6::text,'payoutsStatus',$7::text)
          where id=$1`,
        [account.id, status, chargesEnabled, payoutsEnabled, detailsSubmitted, cardStatus, payoutStatus]
      );
      await client.query(
        `update public.integration_connections
            set status=case when $2='connected' then 'connected' else 'planned' end,
                credentials_status=case when $2='connected' then 'configured' else 'not_configured' end,
                last_checked_at=now(),updated_at=now(),
                metadata_json=metadata_json || jsonb_build_object(
                  'chargesEnabled',$3::boolean,'payoutsEnabled',$4::boolean,'accountStatus',$2::text)
          where tenant_id=$1 and provider='stripe_connect'`,
        [tenantId, status, chargesEnabled, payoutsEnabled]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? "applied" : "dry_run",
    previousStatus: account.account_status,
    providerStatus: status,
    cardPayments: cardStatus,
    payouts: payoutStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted
  }, null, 2));
} finally {
  await client.end();
}
