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

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const tenantId = process.env.EXTERNAL_TEST_TENANT_ID || "11111111-1111-4111-8111-111111111111";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const providerAccounts = await client.query(`select provider_key, status, credentials_status, ownership_mode, live_actions_enabled from public.provider_accounts where tenant_id=$1 order by provider_key`, [tenantId]);
  const credentialCounts = await client.query(`select provider_key, count(*)::int as configured_credentials from public.tenant_provider_credentials where tenant_id=$1 and status='configured' and encrypted_secret is not null group by provider_key order by provider_key`, [tenantId]);
  const telephony = await client.query(`select provider_key, phone_number, status, inbound_enabled, outbound_enabled, compliance_status from public.telephony_numbers where tenant_id=$1 order by provider_key, phone_number`, [tenantId]);
  const paymentAccounts = await client.query(`select provider, payment_mode, account_status, charges_enabled, payouts_enabled from public.payment_provider_accounts where tenant_id=$1 order by provider`, [tenantId]);
  const reviewDestinations = await client.query(`select provider, display_name, status, priority from public.review_request_destinations where tenant_id=$1 order by priority, provider`, [tenantId]);
  const connections = await client.query(`select provider, status, credentials_status from public.integration_connections where tenant_id=$1 order by provider`, [tenantId]);
  const recentExternalErrors = await client.query(`select source, severity, message, created_at from public.app_error_events where created_at > now() - interval '30 minutes' order by created_at desc limit 20`);
  console.log(JSON.stringify({
    tenantId,
    providerAccounts: providerAccounts.rows,
    configuredCredentialCounts: credentialCounts.rows,
    telephony: telephony.rows,
    paymentAccounts: paymentAccounts.rows,
    reviewDestinations: reviewDestinations.rows,
    integrationConnections: connections.rows,
    recentExternalErrors: recentExternalErrors.rows
  }, null, 2));
} finally {
  await client.end();
}
