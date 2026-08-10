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
    `select tenant_id,provider_key,credential_label,status,
            encrypted_secret is not null and encryption_iv is not null and encryption_tag is not null as sealed,
            rotation_due_at,last_verified_at,
            case
              when rotation_due_at is null then 'unscheduled'
              when rotation_due_at <= now() then 'expired'
              when rotation_due_at <= now()+interval '14 days' then 'due_soon'
              else 'healthy'
            end as rotation_health
       from public.tenant_provider_credentials
      where ($1::uuid is null or tenant_id=$1::uuid) order by tenant_id,provider_key,credential_label`,
    [tenantId]
  );
  const summary = result.rows.reduce((acc, row) => {
    acc[row.rotation_health] = (acc[row.rotation_health] ?? 0) + 1;
    if (!row.sealed) acc.unsealed += 1;
    return acc;
  }, { healthy: 0, due_soon: 0, expired: 0, unscheduled: 0, unsealed: 0 });
  console.log(JSON.stringify({
    ok: summary.expired === 0 && summary.unsealed === 0,
    scope: tenantId ?? "all_tenants",
    summary,
    credentials: result.rows.map((row) => ({
      tenantId: row.tenant_id,
      provider: row.provider_key,
      label: row.credential_label,
      status: row.status,
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
