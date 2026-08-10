import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const raw of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
let tenantId = process.env.JOBBER_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const callback = process.env.JOBBER_OAUTH_REDIRECT_URI ?? "";
const callbackUrl = callback ? new URL(callback) : null;
const callbackSafe = callbackUrl?.protocol === "https:" && callbackUrl.hostname === "ferocity.live" && callbackUrl.pathname === "/api/integrations/jobber/oauth/callback";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  if (process.env.TENANT_SLUG) {
    const tenant = await client.query("select id from public.tenants where slug=$1 limit 1", [process.env.TENANT_SLUG]);
    if (!tenant.rows[0]) throw new Error(`Tenant slug ${process.env.TENANT_SLUG} was not found.`);
    tenantId = tenant.rows[0].id;
  }
  const connectionResult = await client.query(
      `select status,credentials_status,scopes_json,metadata_json,last_checked_at
         from public.integration_connections where tenant_id=$1 and provider='jobber' limit 1`,
      [tenantId]
    );
  const credentialsResult = await client.query(
      `select credential_label,status,rotation_due_at,last_verified_at,
              encrypted_secret is not null and encryption_iv is not null and encryption_tag is not null as sealed
         from public.tenant_provider_credentials
        where tenant_id=$1 and provider_key='jobber' order by credential_label`,
      [tenantId]
    );
  const jobsResult = await client.query(
      `select status,count(*)::int as jobs
         from public.integration_jobs
        where tenant_id=$1 and job_type='oauth_start_requested'
          and payload_json->>'provider'='jobber' and created_at > now()-interval '24 hours'
        group by status order by status`,
      [tenantId]
    );
  const connection = connectionResult.rows[0] ?? null;
  const credentials = credentialsResult.rows;
  const configured = Boolean(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET && callbackSafe);
  const tokenReady = credentials.some((row) => row.credential_label === "oauth_access_token" && row.status === "configured" && row.sealed);
  console.log(JSON.stringify({
    ok: tokenReady,
    clientConfigurationPresent: Boolean(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET),
    callbackSafe,
    callbackPath: callbackUrl?.pathname ?? null,
    connectionStatus: connection?.status ?? "not_connected",
    credentialsStatus: connection?.credentials_status ?? "not_configured",
    encryptedAccessTokenReady: tokenReady,
    liveActionsEnabled: connection?.metadata_json?.liveActionsEnabled === true,
    recentOAuthJobs: jobsResult.rows,
    nextStep: tokenReady
      ? "Run the read-only Jobber account and import verification."
      : "After the release callback is deployed, approve the waiting Jobber authorization once."
  }, null, 2));
  if (!tokenReady) process.exitCode = 2;
} finally {
  await client.end();
}
