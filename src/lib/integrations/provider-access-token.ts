import { decryptSecret, encryptSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { refreshTikTokAccessToken } from "@/lib/integrations/tiktok-oauth";

type RefreshableProvider =
  | "google_calendar"
  | "google_business_profile"
  | "google_ads"
  | "search_console"
  | "analytics"
  | "microsoft_calendar"
  | "jobber"
  | "tiktok";

type CredentialRow = {
  credential_label: string;
  encrypted_secret: string;
  encryption_iv: string;
  encryption_tag: string;
  rotation_due_at: string | null;
};

function clientConfig(provider: RefreshableProvider) {
  if (provider === "tiktok") {
    return { clientId: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET, tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/" };
  }
  if (provider === "jobber") {
    return { clientId: env.JOBBER_CLIENT_ID, clientSecret: env.JOBBER_CLIENT_SECRET, tokenUrl: "https://api.getjobber.com/api/oauth/token" };
  }
  return provider !== "microsoft_calendar"
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, tokenUrl: "https://oauth2.googleapis.com/token" }
    : { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" };
}

function open(row: CredentialRow | undefined) {
  if (!row) return null;
  return decryptSecret({ encryptedSecret: row.encrypted_secret, encryptionIv: row.encryption_iv, encryptionTag: row.encryption_tag });
}

async function storeToken(tenantId: string, provider: RefreshableProvider, label: string, value: string, expiresAt: string) {
  const encrypted = encryptSecret(value);
  if (!encrypted) throw new Error("Encrypted credential storage is unavailable.");
  await queryPostgres(
    `update public.tenant_provider_credentials
     set encrypted_secret=$4, encryption_iv=$5, encryption_tag=$6, secret_preview=$7,
       secret_fingerprint=$8, rotation_due_at=$9::timestamptz, last_verified_at=now(), updated_at=now()
     where tenant_id=$1 and provider_key=$2 and credential_label=$3`,
    [tenantId, provider, label, encrypted.encryptedSecret, encrypted.encryptionIv, encrypted.encryptionTag, encrypted.secretPreview, encrypted.secretFingerprint, expiresAt]
  );
}

export async function getFreshProviderAccessToken(tenantId: string, provider: RefreshableProvider, fetchImpl: typeof fetch = fetch) {
  const result = await queryPostgres<CredentialRow>(
    `select credential_label, encrypted_secret, encryption_iv, encryption_tag, rotation_due_at
     from public.tenant_provider_credentials
     where tenant_id=$1 and provider_key=$2 and status='configured'
       and credential_label in ('oauth_access_token','oauth_refresh_token')`,
    [tenantId, provider]
  );
  const accessRow = result?.rows.find((row) => row.credential_label === "oauth_access_token");
  const refreshRow = result?.rows.find((row) => row.credential_label === "oauth_refresh_token");
  const accessToken = open(accessRow);
  const expiresAt = accessRow?.rotation_due_at ? new Date(accessRow.rotation_due_at).getTime() : 0;
  if (accessToken && expiresAt > Date.now() + 5 * 60_000) return accessToken;

  const refreshToken = open(refreshRow);
  const config = clientConfig(provider);
  if (!refreshToken || !config.clientId || !config.clientSecret) throw new Error("The provider connection must be reauthorized.");
  if (provider === "tiktok") {
    const tokens = await refreshTikTokAccessToken({
      clientKey: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
      fetchImpl
    });
    await storeToken(tenantId, provider, "oauth_access_token", tokens.access_token, new Date(Date.now() + tokens.expires_in * 1000).toISOString());
    await storeToken(tenantId, provider, "oauth_refresh_token", tokens.refresh_token, new Date(Date.now() + tokens.refresh_expires_in * 1000).toISOString());
    return tokens.access_token;
  }
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...(provider === "microsoft_calendar" ? { scope: "offline_access openid profile User.Read Calendars.ReadWrite" } : {})
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string } | null;
  if (!response.ok || !body?.access_token) throw new Error(body?.error_description || "The provider token refresh failed.");
  const newExpiresAt = new Date(Date.now() + Math.max(300, Number(body.expires_in ?? 3600)) * 1000).toISOString();
  await storeToken(tenantId, provider, "oauth_access_token", body.access_token, newExpiresAt);
  if (body.refresh_token) {
    await storeToken(tenantId, provider, "oauth_refresh_token", body.refresh_token, new Date(Date.now() + 180 * 86_400_000).toISOString());
  }
  return body.access_token;
}
