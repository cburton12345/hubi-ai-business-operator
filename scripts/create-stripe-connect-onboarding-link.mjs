import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

if (process.env.STRIPE_CONNECT_CREATE !== "true") {
  throw new Error("Set STRIPE_CONNECT_CREATE=true to authorize creating or resuming the real onboarding account.");
}
const adminToken = process.env.ADMIN_ACCESS_TOKEN?.trim();
const appUrl = (
  process.env.STRIPE_CONNECT_RETURN_URL_ORIGIN ||
  process.env.EXTERNAL_TEST_APP_URL ||
  process.env.FEROCITY_APP_URL ||
  "https://ferocity.live"
).replace(/\/+$/, "");
const direct = process.env.STRIPE_CONNECT_DIRECT === "true";

if (direct) {
  const returnOrigin = new URL(appUrl);
  if (returnOrigin.protocol !== "https:" || returnOrigin.hostname === "localhost") {
    throw new Error("Direct live recovery requires an HTTPS STRIPE_CONNECT_RETURN_URL_ORIGIN.");
  }
  if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
    throw new Error("DATABASE_URL and STRIPE_SECRET_KEY are required for direct recovery.");
  }
  const tenantId = process.env.STRIPE_CONNECT_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
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
    if (account.metadata_json?.stripeAccountApiVersion !== "v2") throw new Error("The managed Stripe account is not Accounts v2.");

    const response = await fetch("https://api.stripe.com/v2/core/account_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Stripe-Version": process.env.STRIPE_V2_VERSION ?? "2026-06-24.preview",
        "Idempotency-Key": `ferocity-connect-recovery-${tenantId}-${Date.now()}`
      },
      body: JSON.stringify({
        account: account.provider_account_id,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            refresh_url: `${appUrl}/app/billing?stripe_connect=refresh`,
            return_url: `${appUrl}/app/billing?stripe_connect=returned`,
            collection_options: { fields: "eventually_due", future_requirements: "include" }
          }
        }
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.url) throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}.`);
    const destination = new URL(payload.url);
    if (!destination.hostname.endsWith("stripe.com")) throw new Error("Unexpected Stripe onboarding destination.");
    console.log(JSON.stringify({
      ok: true,
      ...(process.env.STRIPE_CONNECT_PRINT_URL === "true" ? { onboardingUrl: payload.url } : {}),
      host: destination.hostname,
      directRecovery: true,
      urlPrinted: process.env.STRIPE_CONNECT_PRINT_URL === "true"
    }, null, 2));
  } finally {
    await client.end();
  }
  process.exit(0);
}

if (!adminToken) throw new Error("ADMIN_ACCESS_TOKEN is required.");

const cookieValue = crypto.createHash("sha256").update(`ferocity-admin-session:${adminToken}`).digest("hex");
const response = await fetch(`${appUrl}/api/integrations/stripe-connect/onboard`, {
  method: "POST",
  headers: {
    Cookie: `ferocity_admin_session=${cookieValue}; ferocity_selected_workspace=11111111-1111-4111-8111-111111111111`,
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: new URLSearchParams({ country: "US" }),
  redirect: "manual"
});

const location = response.headers.get("location");
if (response.status !== 303 || !location) {
  const body = await response.text();
  throw new Error(`Stripe Connect onboarding route returned HTTP ${response.status}: ${body.slice(0, 500)}`);
}

const parsed = new URL(location);
if (!parsed.hostname.endsWith("stripe.com")) throw new Error("Unexpected Stripe onboarding destination.");
console.log(JSON.stringify({ ok: true, onboardingUrl: location, host: parsed.hostname }, null, 2));
