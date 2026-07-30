import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { integrationNotConfiguredResponse } from "@/lib/integrations/integration-route";
import {
  exchangeTikTokAuthorizationCode,
  fetchTikTokProfile,
  tokenExpiryFromNow,
  type TikTokProfile,
  type TikTokTokenSet
} from "@/lib/integrations/tiktok-oauth";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function appRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/app/integrations", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

async function claimOAuthJob(workspaceId: string, state: string) {
  const result = await queryPostgres<{ id: string; credential_profile: string | null }>(
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
        and payload_json->>'provider' = 'tiktok'
        and payload_json->>'oauthState' = $2
        and created_at > now() - interval '10 minutes'
      order by created_at desc
      limit 1
      for update skip locked
    )
    returning id, payload_json->>'credentialProfile' as credential_profile
    `,
    [workspaceId, state]
  );
  return result?.rows[0] ?? null;
}

async function finishOAuthJob(jobId: string, status: "completed" | "failed", result: Record<string, unknown>, error?: string) {
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

async function saveEncryptedCredential(input: {
  workspaceId: string;
  userId: string | null;
  label: "oauth_access_token" | "oauth_refresh_token";
  kind: "auth_token" | "refresh_token";
  secret: string;
  rotationDueAt: string;
  metadata: Record<string, unknown>;
}) {
  const encrypted = encryptSecret(input.secret);
  if (!encrypted) throw new Error("Encrypted credential storage is not configured.");

  const saved = await queryPostgres(
    `
    insert into public.tenant_provider_credentials (
      tenant_id, provider_key, credential_label, credential_kind, status, secret_preview,
      secret_fingerprint, encrypted_secret, encryption_iv, encryption_tag, rotation_due_at,
      last_verified_at, created_by_user_id, updated_by_user_id, metadata_json
    )
    values (
      $1, 'tiktok', $2, $3, 'configured', $4, $5, $6, $7, $8, $9::timestamptz,
      now(), $10, $10, $11::jsonb
    )
    on conflict (tenant_id, provider_key, credential_label) do update
    set credential_kind = excluded.credential_kind,
        status = 'configured',
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
      input.label,
      input.kind,
      encrypted.secretPreview,
      encrypted.secretFingerprint,
      encrypted.encryptedSecret,
      encrypted.encryptionIv,
      encrypted.encryptionTag,
      input.rotationDueAt,
      input.userId,
      JSON.stringify(input.metadata)
    ]
  );
  if (!saved?.rowCount) throw new Error("Ferocity could not securely save the TikTok credential.");
}

async function recordConnectedAccount(input: {
  workspaceId: string;
  tokens: TikTokTokenSet;
  profile: TikTokProfile;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}) {
  const metadata = {
    connectedAt: new Date().toISOString(),
    openId: input.profile.open_id,
    unionId: input.profile.union_id,
    displayName: input.profile.display_name,
    avatarUrl: input.profile.avatar_url,
    accessTokenExpiresAt: input.accessExpiresAt,
    refreshTokenExpiresAt: input.refreshExpiresAt,
    liveActionsEnabled: false
  };

  const connection = await queryPostgres(
    `
    insert into public.integration_connections (
      tenant_id, provider, display_name, status, credentials_status, scopes_json,
      metadata_json, last_checked_at
    )
    values ($1, 'tiktok', 'TikTok', 'connected', 'configured', $2::jsonb, $3::jsonb, now())
    on conflict (tenant_id, provider) do update
    set display_name = 'TikTok',
        status = 'connected',
        credentials_status = 'configured',
        scopes_json = excluded.scopes_json,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        last_checked_at = now(),
        updated_at = now()
    returning id
    `,
    [input.workspaceId, JSON.stringify(input.tokens.scope.split(",").filter(Boolean)), JSON.stringify(metadata)]
  );
  if (!connection?.rowCount) throw new Error("Ferocity could not update the TikTok connection.");

  await queryPostgres(
    `
    insert into public.provider_accounts (
      tenant_id, provider_key, display_name, status, credentials_status,
      live_actions_enabled, metadata_json
    )
    values ($1, 'tiktok', $2, 'connected', 'configured', false, $3::jsonb)
    on conflict (tenant_id, provider_key) do update
    set display_name = excluded.display_name,
        status = 'connected',
        credentials_status = 'configured',
        live_actions_enabled = false,
        metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [input.workspaceId, input.profile.display_name || "TikTok account", JSON.stringify(metadata)]
  );

  await queryPostgres(
    `
    insert into public.provider_connection_lanes (
      tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
      credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
    )
    values (
      $1, 'tiktok_ads', 'tiktok', 'customer_owned', 'Customer TikTok', 'connected',
      'configured', false, 'provider_account', $2, $3::jsonb
    )
    on conflict (tenant_id, capability_key, lane_key) do update
    set provider_key = 'tiktok',
        display_name = 'Customer TikTok',
        connection_status = 'connected',
        credentials_status = 'configured',
        live_actions_enabled = false,
        source = 'provider_account',
        plain_language_status = excluded.plain_language_status,
        metadata_json = public.provider_connection_lanes.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      input.workspaceId,
      "TikTok account identity is connected. Posting, campaign changes, and ad spend remain disabled until Ferocity receives the additional provider approvals and the business enables those actions.",
      JSON.stringify(metadata)
    ]
  );
}

async function handleTikTokCallback(request: Request) {
  await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return appRedirect(request, { provider: "tiktok", setup: "invalid_state" });

  const workspaceId = await getCurrentWorkspaceId();
  const job = await claimOAuthJob(workspaceId, state);
  if (!job) return appRedirect(request, { provider: "tiktok", setup: "invalid_state" });
  const jobId = job.id;
  const useSandboxCredentials = job.credential_profile === "sandbox";

  const providerError = url.searchParams.get("error") || url.searchParams.get("error_code");
  if (providerError) {
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "authorization_denied" }, providerError);
    return appRedirect(request, { provider: "tiktok", setup: "denied" });
  }

  const code = url.searchParams.get("code");
  const clientKey = useSandboxCredentials ? env.TIKTOK_SANDBOX_CLIENT_KEY : env.TIKTOK_CLIENT_KEY;
  const clientSecret = useSandboxCredentials ? env.TIKTOK_SANDBOX_CLIENT_SECRET : env.TIKTOK_CLIENT_SECRET;
  if (!code || !clientKey || !clientSecret || !env.TIKTOK_OAUTH_REDIRECT_URI) {
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "incomplete_callback" }, "TikTok callback was incomplete.");
    return appRedirect(request, { provider: "tiktok", setup: "failed" });
  }
  if (!hasCredentialEncryptionKey()) {
    await finishOAuthJob(
      jobId,
      "failed",
      { safeMode: true, reason: "credential_encryption_unavailable" },
      "Encrypted credential storage is not configured."
    );
    return appRedirect(request, { provider: "tiktok", setup: "encryption_required" });
  }

  try {
    const tokens = await exchangeTikTokAuthorizationCode({
      clientKey,
      clientSecret,
      code,
      redirectUri: env.TIKTOK_OAUTH_REDIRECT_URI
    });
    const profile = await fetchTikTokProfile(tokens.access_token);
    const session = await getCurrentAppSession();
    const accessExpiresAt = tokenExpiryFromNow(tokens.expires_in);
    const refreshExpiresAt = tokenExpiryFromNow(tokens.refresh_expires_in);
    const commonMetadata = {
      source: "tiktok_oauth",
      credentialProfile: useSandboxCredentials ? "sandbox" : "production",
      openId: profile.open_id,
      scopes: tokens.scope.split(",").filter(Boolean)
    };

    await saveEncryptedCredential({
      workspaceId,
      userId: session?.userId ?? null,
      label: "oauth_access_token",
      kind: "auth_token",
      secret: tokens.access_token,
      rotationDueAt: accessExpiresAt,
      metadata: commonMetadata
    });
    await saveEncryptedCredential({
      workspaceId,
      userId: session?.userId ?? null,
      label: "oauth_refresh_token",
      kind: "refresh_token",
      secret: tokens.refresh_token,
      rotationDueAt: refreshExpiresAt,
      metadata: commonMetadata
    });
    await recordConnectedAccount({ workspaceId, tokens, profile, accessExpiresAt, refreshExpiresAt });
    await finishOAuthJob(jobId, "completed", {
      safeMode: true,
      provider: "tiktok",
      openId: profile.open_id,
      displayName: profile.display_name,
      credentialProfile: useSandboxCredentials ? "sandbox" : "production",
      liveActionsEnabled: false
    });
    return appRedirect(request, { provider: "tiktok", setup: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TikTok connection failed.";
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "token_exchange_failed" }, message);
    await queryPostgres(
      `
      insert into public.integration_connections (
        tenant_id, provider, display_name, status, credentials_status, metadata_json
      )
      values ($1, 'tiktok', 'TikTok', 'error', 'invalid', $2::jsonb)
      on conflict (tenant_id, provider) do update
      set status = 'error',
          credentials_status = 'invalid',
          metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, JSON.stringify({ lastOAuthErrorAt: new Date().toISOString() })]
    );
    return appRedirect(request, { provider: "tiktok", setup: "failed" });
  }
}

const providerEnv = {
  reddit: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_OAUTH_REDIRECT_URI"],
  microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_OAUTH_REDIRECT_URI"],
  yahoo: ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_OAUTH_REDIRECT_URI"]
} as const;

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === "tiktok") return handleTikTokCallback(request);

  const requiredEnv = providerEnv[normalizedProvider as keyof typeof providerEnv];
  if (!requiredEnv) {
    return Response.json(
      { ok: false, status: "unsupported_provider", message: "This OAuth provider is not registered in Ferocity." },
      { status: 404 }
    );
  }

  return integrationNotConfiguredResponse({ provider: normalizedProvider, request, requiredEnv: [...requiredEnv] });
}
