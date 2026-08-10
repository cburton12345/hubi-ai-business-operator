import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

if (process.env.CONFIRM_STRIPE_CONNECT_CONTACT_UPDATE !== "YES") {
  throw new Error("Set CONFIRM_STRIPE_CONNECT_CONTACT_UPDATE=YES for this live account update.");
}

const tenantId = process.env.STRIPE_CONNECT_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const contactEmail = process.env.STRIPE_CONNECT_CONTACT_EMAIL?.trim().toLowerCase();
if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.endsWith(".local")) {
  throw new Error("STRIPE_CONNECT_CONTACT_EMAIL must be a real external email address.");
}
if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
  throw new Error("DATABASE_URL and STRIPE_SECRET_KEY are required.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const result = await client.query(
    `select provider_account_id, metadata_json
       from public.payment_provider_accounts
      where tenant_id=$1 and provider='stripe' and payment_mode='ferocity_managed_connect'
        and ownership_label='ferocity_managed' and provider_account_id is not null
      order by updated_at desc limit 1`,
    [tenantId]
  );
  const account = result.rows[0];
  if (!account?.provider_account_id) throw new Error("No managed Stripe Connect account exists for this tenant.");
  if (account.metadata_json?.stripeAccountApiVersion !== "v2") {
    throw new Error("The managed Stripe account is not an Accounts v2 account.");
  }

  const response = await fetch(`https://api.stripe.com/v2/core/accounts/${encodeURIComponent(account.provider_account_id)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Stripe-Version": process.env.STRIPE_V2_VERSION ?? "2026-06-24.preview",
      "Idempotency-Key": `ferocity-connect-contact-${tenantId}-${contactEmail}`
    },
    body: JSON.stringify({ contact_email: contactEmail })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}.`);
  if (payload.contact_email?.toLowerCase() !== contactEmail) {
    throw new Error("Stripe did not confirm the requested contact email.");
  }

  await client.query(
    `insert into public.payment_provider_account_events
       (tenant_id,provider,event_type,event_status,provider_event_id,metadata_json)
     values ($1,'stripe','connect_contact_email_updated','recorded',$2,$3::jsonb)`,
    [tenantId, account.provider_account_id, JSON.stringify({ source: "controlled_launch_recovery" })]
  );
  console.log(JSON.stringify({ ok: true, contactEmailUpdated: true, auditEventRecorded: true }, null, 2));
} finally {
  await client.end();
}
