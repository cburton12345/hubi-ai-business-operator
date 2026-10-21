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
const managedRefreshProviders = new Map([
  ["google_calendar", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["google_business_profile", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["google_ads", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["youtube", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["search_console", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["analytics", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["gmail_mailbox", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)],
  ["microsoft_ads", Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)],
  ["microsoft_calendar", Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)],
  ["microsoft_mailbox", Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)],
  ["jobber", Boolean(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET)],
  ["tiktok", Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)],
  ["reddit", Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)],
  ["snapchat_ads", Boolean(process.env.SNAPCHAT_CLIENT_ID && process.env.SNAPCHAT_CLIENT_SECRET)],
]);
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
  const refreshCredentials = new Map(result.rows
    .filter((row) => row.credential_label === "oauth_refresh_token")
    .map((row) => [`${row.tenant_id}:${row.provider_key}`, row]));
  const credentialRows = result.rows.map((row) => {
    const refresh = refreshCredentials.get(`${row.tenant_id}:${row.provider_key}`);
    const refreshUsable = refresh?.status === "configured"
      && refresh.sealed
      && (!refresh.rotation_due_at || new Date(refresh.rotation_due_at).getTime() > Date.now());
    const managedRefresh = row.credential_label === "oauth_access_token"
      && managedRefreshProviders.get(row.provider_key) === true
      && refreshUsable;
    return {
      ...row,
      effective_rotation_health: managedRefresh && ["expired", "due_soon"].includes(row.rotation_health)
        ? "managed_refresh"
        : row.rotation_health,
    };
  });
  const summary = credentialRows.reduce((acc, row) => {
    if (!row.operational_active) {
      acc.inactive += 1;
      return acc;
    }
    acc[row.effective_rotation_health] = (acc[row.effective_rotation_health] ?? 0) + 1;
    if (!row.sealed) acc.unsealed += 1;
    return acc;
  }, { healthy: 0, managed_refresh: 0, due_soon: 0, expired: 0, unscheduled: 0, unsealed: 0, inactive: 0 });
  console.log(JSON.stringify({
    ok: summary.expired === 0 && summary.unsealed === 0,
    scope: tenantId ?? "all_tenants",
    summary,
    credentials: credentialRows.map((row) => ({
      tenantId: row.tenant_id,
      provider: row.provider_key,
      label: row.credential_label,
      status: row.status,
      operationalActive: row.operational_active,
      providerAccountStatus: row.provider_account_status,
      sealed: row.sealed,
      rotationHealth: row.effective_rotation_health,
      rotationDueAt: row.rotation_due_at,
      lastVerifiedAt: row.last_verified_at
    }))
  }, null, 2));
  if (summary.expired > 0 || summary.unsealed > 0) process.exitCode = 2;
} finally {
  await client.end();
}
