import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

type MetaProfileResponse = {
  id?: string;
  name?: string;
  error?: { message?: string };
};

function appRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/app/integrations", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

async function claimOAuthJob(workspaceId: string, state: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    update public.integration_jobs
    set status = 'running',
        started_at = now()
    where id = (
      select id
      from public.integration_jobs
      where tenant_id = $1
        and job_type = 'oauth_start_requested'
        and status = 'queued'
        and payload_json->>'provider' = 'facebook'
        and payload_json->>'oauthState' = $2
        and created_at > now() - interval '10 minutes'
      order by created_at desc
      limit 1
      for update skip locked
    )
    returning id
    `,
    [workspaceId, state]
  );
  return result?.rows[0] ?? null;
}

async function finishOAuthJob(
  jobId: string,
  status: "completed" | "failed",
  result: Record<string, unknown>,
  error?: string
) {
  await queryPostgres(
    `
    update public.integration_jobs
    set status = $2,
        result_json = $3::jsonb,
        error_message = $4,
        completed_at = now()
    where id = $1
    `,
    [jobId, status, JSON.stringify(result), error ?? null]
  );
}

async function exchangeAuthorizationCode(code: string) {
  const url = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  url.searchParams.set("client_id", env.META_APP_ID!);
  url.searchParams.set("client_secret", env.META_APP_SECRET!);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI!);
  url.searchParams.set("code", code);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = await response.json() as MetaTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message || "Meta did not return an access token.");
  }
  return payload;
}

async function exchangeForLongLivedToken(accessToken: string) {
  const url = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", env.META_APP_ID!);
  url.searchParams.set("client_secret", env.META_APP_SECRET!);
  url.searchParams.set("fb_exchange_token", accessToken);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as MetaTokenResponse;
  return payload.access_token ? payload : null;
}

async function fetchMetaProfile(accessToken: string) {
  const url = new URL("https://graph.facebook.com/v25.0/me");
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = await response.json() as MetaProfileResponse;
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || "Meta account verification failed.");
  }
  return payload;
}

async function saveEncryptedAccessToken(input: {
  workspaceId: string;
  userId: string | null;
  accessToken: string;
  expiresAt: string;
  profile: MetaProfileResponse;
}) {
  const encrypted = encryptSecret(input.accessToken);
  if (!encrypted) throw new Error("Encrypted credential storage is not configured.");
  const metadata = {
    source: "meta_oauth",
    metaUserId: input.profile.id,
    metaUserName: input.profile.name,
    expiresAt: input.expiresAt,
    scopes: ["pages_read_engagement", "pages_show_list", "business_management", "ads_read"],
    liveActionsEnabled: false
  };

  const saved = await queryPostgres(
    `
    insert into public.tenant_provider_credentials (
      tenant_id, provider_key, credential_label, credential_kind, status, secret_preview,
      secret_fingerprint, encrypted_secret, encryption_iv, encryption_tag, rotation_due_at,
      last_verified_at, created_by_user_id, updated_by_user_id, metadata_json
    )
    values (
      $1, 'facebook', 'oauth_access_token', 'auth_token', 'configured', $2, $3, $4, $5, $6,
      $7::timestamptz, now(), $8, $8, $9::jsonb
    )
    on conflict (tenant_id, provider_key, credential_label) do update
    set status = 'configured',
        secret_preview = excluded.secret_preview,
        secret_fingerprint = excluded.secret_fingerprint,
        encrypted_secret = excluded.encrypted_secret,
        encryption_iv = excluded.encryption_iv,
        encryption_tag = excluded.encryption_tag,
        rotation_due_at = excluded.rotation_due_at,
        last_verified_at = now(),
        updated_by_user_id = excluded.updated_by_user_id,
        metadata_json = public.tenant_provider_credentials.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id
    `,
    [
      input.workspaceId,
      encrypted.secretPreview,
      encrypted.secretFingerprint,
      encrypted.encryptedSecret,
      encrypted.encryptionIv,
      encrypted.encryptionTag,
      input.expiresAt,
      input.userId,
      JSON.stringify(metadata)
    ]
  );
  if (!saved?.rowCount) throw new Error("Ferocity could not securely save the Meta credential.");
  return metadata;
}

async function recordConnectedAccount(
  workspaceId: string,
  profile: MetaProfileResponse,
  metadata: Record<string, unknown>
) {
  const displayName = profile.name ? `Meta — ${profile.name}` : "Facebook / Meta";
  const scopes = ["pages_read_engagement", "pages_show_list", "business_management", "ads_read"];

  await queryPostgres(
    `
    insert into public.integration_connections (
      tenant_id, provider, display_name, status, credentials_status, scopes_json,
      metadata_json, last_checked_at
    )
    values ($1, 'facebook', $2, 'connected', 'configured', $3::jsonb, $4::jsonb, now())
    on conflict (tenant_id, provider) do update
    set display_name = excluded.display_name,
        status = 'connected',
        credentials_status = 'configured',
        scopes_json = excluded.scopes_json,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        last_checked_at = now(),
        updated_at = now()
    `,
    [workspaceId, displayName, JSON.stringify(scopes), JSON.stringify(metadata)]
  );

  await queryPostgres(
    `
    insert into public.provider_accounts (
      tenant_id, provider_key, display_name, status, credentials_status,
      live_actions_enabled, metadata_json
    )
    values ($1, 'facebook', $2, 'connected', 'configured', false, $3::jsonb)
    on conflict (tenant_id, provider_key) do update
    set display_name = excluded.display_name,
        status = 'connected',
        credentials_status = 'configured',
        live_actions_enabled = false,
        metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [workspaceId, displayName, JSON.stringify(metadata)]
  );

  await queryPostgres(
    `
    insert into public.provider_connection_lanes (
      tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
      credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
    )
    values (
      $1, 'meta_ads', 'facebook', 'customer_owned', 'Customer Meta/Facebook', 'connected',
      'configured', false, 'provider_account',
      'Meta reporting access is connected. Publishing, campaign changes, and ad spend remain approval-gated.',
      $2::jsonb
    )
    on conflict (tenant_id, capability_key, lane_key) do update
    set provider_key = 'facebook',
        display_name = 'Customer Meta/Facebook',
        connection_status = 'connected',
        credentials_status = 'configured',
        live_actions_enabled = false,
        source = 'provider_account',
        plain_language_status = excluded.plain_language_status,
        metadata_json = public.provider_connection_lanes.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [workspaceId, JSON.stringify(metadata)]
  );
}

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return appRedirect(request, { provider: "facebook", setup: "invalid_state" });

  const workspaceId = await getCurrentWorkspaceId();
  const job = await claimOAuthJob(workspaceId, state);
  if (!job) return appRedirect(request, { provider: "facebook", setup: "invalid_state" });

  const providerError = url.searchParams.get("error") || url.searchParams.get("error_reason");
  if (providerError) {
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "authorization_denied" }, providerError);
    return appRedirect(request, { provider: "facebook", setup: "denied" });
  }

  const code = url.searchParams.get("code");
  if (!code || !env.META_APP_ID || !env.META_APP_SECRET || !env.META_OAUTH_REDIRECT_URI) {
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "incomplete_callback" }, "Meta callback was incomplete.");
    return appRedirect(request, { provider: "facebook", setup: "failed" });
  }
  if (!hasCredentialEncryptionKey()) {
    await finishOAuthJob(
      job.id,
      "failed",
      { safeMode: true, reason: "credential_encryption_unavailable" },
      "Encrypted credential storage is not configured."
    );
    return appRedirect(request, { provider: "facebook", setup: "encryption_required" });
  }

  try {
    const initialToken = await exchangeAuthorizationCode(code);
    const extendedToken = await exchangeForLongLivedToken(initialToken.access_token!);
    const token = extendedToken ?? initialToken;
    const profile = await fetchMetaProfile(token.access_token!);
    const session = await getCurrentAppSession();
    const expiresAt = new Date(Date.now() + Math.max(300, token.expires_in ?? 5_184_000) * 1000).toISOString();
    const metadata = await saveEncryptedAccessToken({
      workspaceId,
      userId: session?.userId ?? null,
      accessToken: token.access_token!,
      expiresAt,
      profile
    });
    await recordConnectedAccount(workspaceId, profile, metadata);
    await finishOAuthJob(job.id, "completed", {
      safeMode: true,
      provider: "facebook",
      metaUserId: profile.id,
      liveActionsEnabled: false
    });
    return appRedirect(request, { provider: "facebook", setup: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta connection failed.";
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "token_exchange_failed" }, message);
    return appRedirect(request, { provider: "facebook", setup: "failed" });
  }
}
