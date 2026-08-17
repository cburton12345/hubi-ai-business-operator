import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});

await client.connect();
try {
  const settings = await client.query(`
    select t.slug as tenant_slug,s.provider_key,s.enabled,s.status,s.delivery_mode,
           c.status as connection_status,c.credentials_status,
           case
             when s.delivery_mode='native_api' and s.provider_key in ('highlevel','hubspot') then exists(
               select 1 from public.tenant_provider_credentials v
                where v.tenant_id=s.tenant_id and v.provider_key=s.provider_key
                  and v.status='configured' and v.credential_label in
                    ('oauth_access_token','private_integration_token','private_app_token','access_token','auth_token','api_key')
                  and v.encrypted_secret is not null and v.encryption_iv is not null and v.encryption_tag is not null
             )
             when s.delivery_mode='signed_webhook' then
               (select count(distinct v.credential_label) from public.tenant_provider_credentials v
                 where v.tenant_id=s.tenant_id and v.provider_key=s.provider_key and v.status='configured'
                   and v.credential_label in ('call_log_webhook_url','call_log_webhook_secret')
                   and v.encrypted_secret is not null and v.encryption_iv is not null and v.encryption_tag is not null) = 2
             else s.delivery_mode='manual_export'
           end as credential_ready,
           s.last_verified_at
      from public.external_call_log_settings s
      join public.integration_connections c on c.id=s.connection_id and c.tenant_id=s.tenant_id
      join public.tenants t on t.id=s.tenant_id
     order by t.slug,s.provider_key
  `);
  const deliveries = await client.query(`
    select status,count(*)::int as count,max(updated_at) as latest_at
      from public.external_call_log_deliveries
     group by status order by status
  `);
  const deadLetters = await client.query(`
    select count(*)::int as open
      from public.integration_dead_letters
     where operation='external_call_log' and status='open'
  `);
  const rows = settings.rows.map((row) => ({
    tenant: row.tenant_slug,
    provider: row.provider_key,
    enabled: row.enabled,
    status: row.status,
    deliveryMode: row.delivery_mode,
    connectionStatus: row.connection_status,
    credentialsStatus: row.credentials_status,
    credentialReady: row.credential_ready,
    lastVerifiedAt: row.last_verified_at
  }));
  const ready = rows.filter((row) => row.enabled && row.status === "ready" && row.connectionStatus === "connected" && row.credentialReady);
  const enabledNotReady = rows.filter((row) => row.enabled && !ready.includes(row));
  console.log(JSON.stringify({
    ok: enabledNotReady.length === 0,
    configuredBridges: rows.length,
    certifiedReadyBridges: ready.length,
    enabledNotReady,
    bridges: rows,
    deliveries: deliveries.rows,
    openDeadLetters: deadLetters.rows[0]?.open ?? 0,
    contract: {
      canonicalCallRemainsInFerocity: true,
      enqueueIdentity: "one delivery per tenant + connection + call",
      retries: "bounded exponential backoff; five attempts then dead letter",
      transcriptSharedByDefault: false
    }
  }, null, 2));
  if (enabledNotReady.length) process.exitCode = 2;
} finally {
  await client.end();
}
