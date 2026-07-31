import fs from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function has(...keys) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyOpenAi() {
  if (!has("OPENAI_API_KEY")) return false;
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const response = await requestJson(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  });
  return response.ok;
}

async function verifyResend() {
  if (
    process.env.EMAIL_PROVIDER?.trim().toLowerCase() !== "resend" ||
    !has("EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "RESEND_INBOUND_WEBHOOK_SECRET")
  ) {
    return false;
  }
  const response = await requestJson("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}` }
  });
  if (!response.ok) return false;
  const domains = Array.isArray(response.body?.data) ? response.body.data : [];
  return domains.some(
    (domain) =>
      domain?.status === "verified" &&
      domain?.name &&
      process.env.EMAIL_FROM_ADDRESS.endsWith(`@${domain.name}`)
  );
}

async function verifyStripe() {
  const priceKeys = [
    "STRIPE_PRICE_ID_JOB_TRACKER",
    "STRIPE_PRICE_ID_STARTER",
    "STRIPE_PRICE_ID_GROWTH",
    "STRIPE_PRICE_ID_OPERATOR",
    "STRIPE_PRICE_ID_AI_GROWTH_REPORT"
  ];
  if (!has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", ...priceKeys)) return false;
  for (const key of priceKeys) {
    const response = await requestJson(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(process.env[key])}`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
    );
    if (!response.ok) return false;
  }
  return true;
}

loadLocalEnv();
assert(process.env.DATABASE_URL, "DATABASE_URL is required.");

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const verifiedAt = new Date().toISOString();
const checks = {
  openai: await verifyOpenAi(),
  resend: await verifyResend(),
  stripe: await verifyStripe(),
  supabase: has(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ),
  marketplacepro: has("MARKETPLACEPRO_WEBHOOK_SECRET")
};

const oauthApps = {
  google_business_profile: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"),
  google_ads: has(
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI"
  ),
  search_console: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"),
  facebook: has("META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI", "META_BUSINESS_LOGIN_CONFIG_ID"),
  reddit: has("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_OAUTH_REDIRECT_URI"),
  microsoft_ads: has(
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_OAUTH_REDIRECT_URI",
    "MICROSOFT_ADS_DEVELOPER_TOKEN"
  )
};

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function markIntegrationConnected(provider, evidence) {
  await client.query(
    `
    update public.integration_connections
    set status = 'connected',
        credentials_status = 'configured',
        last_checked_at = now(),
        updated_at = now(),
        metadata_json = metadata_json || $3::jsonb
    where tenant_id = $1 and provider = $2
    `,
    [
      tenantId,
      provider,
      JSON.stringify({
        apiConnected: true,
        liveActionsEnabled: false,
        connectionEvidence: evidence,
        connectionVerifiedAt: verifiedAt
      })
    ]
  );
}

try {
  await client.query("begin");

  if (checks.supabase) {
    await markIntegrationConnected("supabase_auth", "required Supabase credentials are configured");
  }
  await markIntegrationConnected("webhook_framework", "signed inbound webhook framework is installed");

  if (checks.marketplacepro) {
    await markIntegrationConnected("marketplacepro", "signed inbound bridge secret is configured");
  }
  if (checks.resend) {
    await markIntegrationConnected("email_provider", "Resend API accepted the key and verified sender domain");
    await markIntegrationConnected("resend_shared", "Resend API accepted the key and verified sender domain");
  }
  if (checks.stripe) {
    await markIntegrationConnected("stripe", "Stripe API accepted the live key and all Ferocity price IDs");
  }

  for (const [provider, ready] of Object.entries(oauthApps)) {
    if (!ready) continue;
    await client.query(
      `
      update public.integration_connections
      set credentials_status = 'configured',
          last_checked_at = now(),
          updated_at = now(),
          metadata_json = metadata_json || $3::jsonb
      where tenant_id = $1 and provider = $2
      `,
      [
        tenantId,
        provider,
        JSON.stringify({
          apiConnected: false,
          liveActionsEnabled: false,
          oauthAppConfigured: true,
          oauthUserGrantRequired: true,
          credentialsVerifiedAt: verifiedAt
        })
      ]
    );
  }

  for (const [provider, ready, evidence] of [
    ["openai", checks.openai, "OpenAI API accepted the configured model"],
    ["resend_shared", checks.resend, "Resend API accepted the key and verified sender domain"]
  ]) {
    if (!ready) continue;
    await client.query(
      `
      update public.provider_accounts
      set status = 'connected',
          credentials_status = 'configured',
          live_actions_enabled = false,
          updated_at = now(),
          metadata_json = metadata_json || $3::jsonb
      where tenant_id = $1 and provider_key = $2
      `,
      [
        tenantId,
        provider,
        JSON.stringify({ connectionEvidence: evidence, connectionVerifiedAt: verifiedAt })
      ]
    );
  }

  if (checks.resend) {
    await client.query(
      `
      update public.tenant_messaging_accounts
      set connection_status = 'configured',
          credentials_status = 'configured',
          live_sending_enabled = false,
          inbound_enabled = true,
          outbound_enabled = true,
          updated_at = now(),
          metadata_json = metadata_json || $2::jsonb
      where tenant_id = $1
        and provider_key = 'resend_email'
        and ownership_mode = 'ferocity_managed'
      `,
      [
        tenantId,
        JSON.stringify({
          providerVerified: true,
          senderDomainVerified: true,
          liveSendingRequiresPolicyApproval: true,
          connectionVerifiedAt: verifiedAt
        })
      ]
    );
    await client.query(
      `
      update public.provider_connection_lanes
      set connection_status = 'connected',
          credentials_status = 'configured',
          live_actions_enabled = false,
          source = 'env',
          plain_language_status = 'Ferocity managed email is connected. Sending remains governed by consent, policy, and approval settings.',
          updated_at = now(),
          metadata_json = metadata_json || $2::jsonb
      where tenant_id = $1
        and capability_key = 'email'
        and lane_key = 'ferocity_managed'
      `,
      [tenantId, JSON.stringify({ connectionVerifiedAt: verifiedAt })]
    );
  }

  if (checks.marketplacepro) {
    await client.query(
      `
      update public.provider_connection_lanes
      set connection_status = 'connected',
          credentials_status = 'configured',
          live_actions_enabled = false,
          source = 'env',
          plain_language_status = 'Ferocity can receive signed MarketplacePro events. Outbound synchronization remains review-gated.',
          updated_at = now(),
          metadata_json = metadata_json || $2::jsonb
      where tenant_id = $1
        and capability_key = 'marketplacepro'
        and lane_key = 'ferocity_managed'
      `,
      [tenantId, JSON.stringify({ connectionVerifiedAt: verifiedAt })]
    );
  }

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log("Provider reconciliation complete.");
console.log(JSON.stringify({ tenantId, checks, oauthApps, liveActionsEnabled: false }, null, 2));
