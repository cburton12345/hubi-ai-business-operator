import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import {
  exchangeTikTokAuthorizationCode,
  fetchTikTokProfile,
  tokenExpiryFromNow,
  type TikTokProfile,
  type TikTokTokenSet
} from "@/lib/integrations/tiktok-oauth";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { handleStandardOAuthCallback } from "@/lib/integrations/complete-standard-oauth";

function appRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/app/integrations", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

async function claimOAuthJob(workspaceId: string, state: string, provider: "tiktok" | "tiktok_content") {
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
        and payload_json->>'provider' = $3
        and payload_json->>'oauthState' = $2
        and created_at > now() - interval '10 minutes'
      order by created_at desc
      limit 1
      for update skip locked
    )
    returning id, payload_json->>'credentialProfile' as credential_profile
    `,
    [workspaceId, state, provider]
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
  provider: "tiktok" | "tiktok_content";
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
      $1, $2, $3, $4, 'configured', $5, $6, $7, $8, $9, $10::timestamptz,
      now(), $11, $11, $12::jsonb
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
      input.provider,
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
  provider: "tiktok" | "tiktok_content";
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
    values ($1, $2, $3, 'connected', 'configured', $4::jsonb, $5::jsonb, now())
    on conflict (tenant_id, provider) do update
    set display_name = excluded.display_name,
        status = 'connected',
        credentials_status = 'configured',
        scopes_json = excluded.scopes_json,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        last_checked_at = now(),
        updated_at = now()
    returning id
    `,
    [
      input.workspaceId,
      input.provider,
      input.provider === "tiktok_content" ? "TikTok Content Publishing" : "TikTok",
      JSON.stringify(input.tokens.scope.split(",").filter(Boolean)),
      JSON.stringify(metadata)
    ]
  );
  if (!connection?.rowCount) throw new Error("Ferocity could not update the TikTok connection.");

  await queryPostgres(
    `
    insert into public.provider_accounts (
      tenant_id, provider_key, display_name, status, credentials_status,
      live_actions_enabled, metadata_json
    )
    values ($1, $2, $3, 'connected', 'configured', false, $4::jsonb)
    on conflict (tenant_id, provider_key) do update
    set display_name = excluded.display_name,
        status = 'connected',
        credentials_status = 'configured',
        live_actions_enabled = false,
        metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [input.workspaceId, input.provider, input.profile.display_name || "TikTok account", JSON.stringify(metadata)]
  );
}

async function handleTikTokCallback(request: Request, provider: "tiktok" | "tiktok_content") {
  await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return appRedirect(request, { provider, setup: "invalid_state" });

  const workspaceId = await getCurrentWorkspaceId();
  const job = await claimOAuthJob(workspaceId, state, provider);
  if (!job) return appRedirect(request, { provider, setup: "invalid_state" });
  const jobId = job.id;
  const useSandboxCredentials = job.credential_profile === "sandbox";

  const providerError = url.searchParams.get("error") || url.searchParams.get("error_code");
  if (providerError) {
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "authorization_denied" }, providerError);
    return appRedirect(request, { provider, setup: "denied" });
  }

  const code = url.searchParams.get("code");
  const clientKey = useSandboxCredentials ? env.TIKTOK_SANDBOX_CLIENT_KEY : env.TIKTOK_CLIENT_KEY;
  const clientSecret = useSandboxCredentials ? env.TIKTOK_SANDBOX_CLIENT_SECRET : env.TIKTOK_CLIENT_SECRET;
  const redirectUri = provider === "tiktok_content" ? env.TIKTOK_CONTENT_REDIRECT_URI : env.TIKTOK_OAUTH_REDIRECT_URI;
  if (!code || !clientKey || !clientSecret || !redirectUri) {
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "incomplete_callback" }, "TikTok callback was incomplete.");
    return appRedirect(request, { provider, setup: "failed" });
  }
  if (!hasCredentialEncryptionKey()) {
    await finishOAuthJob(
      jobId,
      "failed",
      { safeMode: true, reason: "credential_encryption_unavailable" },
      "Encrypted credential storage is not configured."
    );
    return appRedirect(request, { provider, setup: "encryption_required" });
  }

  try {
    const tokens = await exchangeTikTokAuthorizationCode({
      clientKey,
      clientSecret,
      code,
      redirectUri
    });
    const profile = await fetchTikTokProfile(tokens.access_token);
    const session = await getCurrentAppSession();
    const accessExpiresAt = tokenExpiryFromNow(tokens.expires_in);
    const refreshExpiresAt = tokenExpiryFromNow(tokens.refresh_expires_in);
    const commonMetadata = {
      source: provider === "tiktok_content" ? "tiktok_content_oauth" : "tiktok_oauth",
      credentialProfile: useSandboxCredentials ? "sandbox" : "production",
      openId: profile.open_id,
      scopes: tokens.scope.split(",").filter(Boolean)
    };

    await saveEncryptedCredential({
      workspaceId,
      userId: session?.userId ?? null,
      provider,
      label: "oauth_access_token",
      kind: "auth_token",
      secret: tokens.access_token,
      rotationDueAt: accessExpiresAt,
      metadata: commonMetadata
    });
    await saveEncryptedCredential({
      workspaceId,
      userId: session?.userId ?? null,
      provider,
      label: "oauth_refresh_token",
      kind: "refresh_token",
      secret: tokens.refresh_token,
      rotationDueAt: refreshExpiresAt,
      metadata: commonMetadata
    });
    await recordConnectedAccount({ workspaceId, provider, tokens, profile, accessExpiresAt, refreshExpiresAt });
    await finishOAuthJob(jobId, "completed", {
      safeMode: true,
      provider,
      openId: profile.open_id,
      displayName: profile.display_name,
      credentialProfile: useSandboxCredentials ? "sandbox" : "production",
      liveActionsEnabled: false
    });
    return appRedirect(request, { provider, setup: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TikTok connection failed.";
    await finishOAuthJob(jobId, "failed", { safeMode: true, reason: "token_exchange_failed" }, message);
    await queryPostgres(
      `
      insert into public.integration_connections (
        tenant_id, provider, display_name, status, credentials_status, metadata_json
      )
      values ($1, $2, $3, 'error', 'invalid', $4::jsonb)
      on conflict (tenant_id, provider) do update
      set status = 'error',
          credentials_status = 'invalid',
          metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [workspaceId, provider, provider === "tiktok_content" ? "TikTok Content Publishing" : "TikTok", JSON.stringify({ lastOAuthErrorAt: new Date().toISOString() })]
    );
    return appRedirect(request, { provider, setup: "failed" });
  }
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === "tiktok" || normalizedProvider === "tiktok_content") return handleTikTokCallback(request, normalizedProvider);
  if (normalizedProvider === "reddit") return handleStandardOAuthCallback(request, ["reddit"]);
  if (normalizedProvider === "linkedin_ads") return handleStandardOAuthCallback(request, ["linkedin_ads"]);
  if (normalizedProvider === "pinterest_ads") return handleStandardOAuthCallback(request, ["pinterest_ads"]);
  if (normalizedProvider === "snapchat_ads") return handleStandardOAuthCallback(request, ["snapchat_ads"]);
  if (normalizedProvider === "amazon_ads") return handleStandardOAuthCallback(request, ["amazon_ads"]);
  if (normalizedProvider === "jobber") return handleStandardOAuthCallback(request, ["jobber"]);
  if (normalizedProvider === "microsoft" || normalizedProvider === "microsoft_ads" || normalizedProvider === "microsoft_calendar" || normalizedProvider === "microsoft_mailbox") {
    return handleStandardOAuthCallback(request, ["microsoft_ads", "microsoft_calendar", "microsoft_mailbox"]);
  }
  return Response.json(
    { ok: false, status: "unsupported_provider", message: "This OAuth provider is not registered in Ferocity." },
    { status: 404 }
  );
}
