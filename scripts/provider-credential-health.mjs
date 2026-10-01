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

const tenantId = process.env.CREDENTIAL_HEALTH_TENANT_ID?.trim() || null;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(
    `select credentials.tenant_id,credentials.provider_key,credentials.credential_label,credentials.status,
            credentials.encrypted_secret is not null and credentials.encryption_iv is not null and credentials.encryption_tag is not null as sealed,
            credentials.rotation_due_at,credentials.last_verified_at,
            coalesce(accounts.status in ('connected','ready','active'), false) as operational_active,
            accounts.status as provider_account_status,
            case
              when credentials.rotation_due_at is null then 'unscheduled'
              when credentials.rotation_due_at <= now() then 'expired'
              when credentials.rotation_due_at <= now()+interval '14 days' then 'due_soon'
              else 'healthy'
            end as rotation_health
       from public.tenant_provider_credentials credentials
       left join public.provider_accounts accounts
         on accounts.tenant_id=credentials.tenant_id and accounts.provider_key=credentials.provider_key
      where ($1::uuid is null or credentials.tenant_id=$1::uuid)
      order by credentials.tenant_id,credentials.provider_key,credentials.credential_label`,
    [tenantId]
  );
  const summary = result.rows.reduce((acc, row) => {
    if (!row.operational_active) {
      acc.inactive += 1;
      return acc;
    }
    acc[row.rotation_health] = (acc[row.rotation_health] ?? 0) + 1;
    if (!row.sealed) acc.unsealed += 1;
    return acc;
  }, { healthy: 0, due_soon: 0, expired: 0, unscheduled: 0, unsealed: 0, inactive: 0 });
  console.log(JSON.stringify({
    ok: summary.expired === 0 && summary.unsealed === 0,
    scope: tenantId ?? "all_tenants",
    summary,
    credentials: result.rows.map((row) => ({
      tenantId: row.tenant_id,
      provider: row.provider_key,
      label: row.credential_label,
      status: row.status,
      operationalActive: row.operational_active,
      providerAccountStatus: row.provider_account_status,
      sealed: row.sealed,
      rotationHealth: row.rotation_health,
      rotationDueAt: row.rotation_due_at,
      lastVerifiedAt: row.last_verified_at
    }))
  }, null, 2));
  if (summary.expired > 0 || summary.unsealed > 0) process.exitCode = 2;
} finally {
  await client.end();
}
