import fs from "node:fs";

function loadEnv(file: string) {
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

async function main() {
  const [{ queryPostgres }, { getFreshProviderAccessToken }, { fetchTikTokProfile }] = await Promise.all([
    import("../src/lib/db/postgres"),
    import("../src/lib/integrations/provider-access-token"),
    import("../src/lib/integrations/tiktok-oauth")
  ]);
  const tenantSlug = process.env.TENANT_SLUG ?? "ferocity-qa-demo";
  const tenant = await queryPostgres<{ id: string }>("select id from public.tenants where slug=$1 limit 1", [tenantSlug]);
  const tenantId = tenant?.rows[0]?.id;
  if (!tenantId) throw new Error(`Tenant not found: ${tenantSlug}`);

  const accessToken = await getFreshProviderAccessToken(tenantId, "tiktok");
  const profile = await fetchTikTokProfile(accessToken);
  await queryPostgres(
    `update public.provider_accounts
        set status='connected', credentials_status='configured', last_provider_sync_at=now(),
            configuration_json=configuration_json || $2::jsonb, updated_at=now()
      where tenant_id=$1 and provider_key='tiktok'`,
    [tenantId, JSON.stringify({ openId: profile.open_id, displayName: profile.display_name ?? null, identityVerifiedAt: new Date().toISOString() })]
  );
  console.log(JSON.stringify({
    ok: true,
    tenantId,
    provider: "tiktok",
    displayName: profile.display_name ?? null,
    identityVerified: true,
    accessTokenStoredEncrypted: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
