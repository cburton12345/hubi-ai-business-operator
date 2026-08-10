import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { env, missingEnvVars } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getOAuthProviderConfig, getOAuthRequiredEnv } from "@/lib/integrations/oauth-providers";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { connectorCanBeMarkedReady } from "@/lib/integrations/connector-runtime";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { createOAuthPkcePair } from "@/lib/integrations/standard-oauth";

function appRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/app/integrations", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  await requirePermission("tenant:manage");
  const { provider } = await context.params;
  const config = getOAuthProviderConfig(provider);
  const requestUrl = new URL(request.url);
  const useTikTokSandbox = config?.provider === "tiktok" && requestUrl.searchParams.get("sandbox") === "1";

  if (!config) {
    return appRedirect(request, { provider, setup: "unsupported" });
  }
  if (!connectorCanBeMarkedReady(config.provider)) {
    return appRedirect(request, { provider: config.provider, setup: "unsupported" });
  }

  const requiredEnv = getOAuthRequiredEnv(config);
  const missing = [
    ...(useTikTokSandbox
      ? missingEnvVars(["TIKTOK_SANDBOX_CLIENT_KEY", "TIKTOK_SANDBOX_CLIENT_SECRET", "TIKTOK_OAUTH_REDIRECT_URI"])
      : missingEnvVars(requiredEnv)),
    ...((config.provider === "tiktok" || config.pkce) && !hasCredentialEncryptionKey() ? ["CREDENTIAL_ENCRYPTION_KEY"] : [])
  ];
  const workspaceId = await getCurrentWorkspaceId();
  const state = randomUUID();
  const pkce = config.pkce && missing.length === 0 ? createOAuthPkcePair() : null;
  const encryptedVerifier = pkce ? encryptSecret(pkce.verifier) : null;

  await queryPostgres(
    `
    insert into public.integration_jobs (tenant_id, job_type, status, payload_json, result_json)
    values ($1, 'oauth_start_requested', $2, $3::jsonb, $4::jsonb)
    `,
    [
      workspaceId,
      missing.length > 0 ? "cancelled" : "queued",
      JSON.stringify({
        provider: config.provider,
        label: config.label,
        oauthState: state,
        requestedScopes: config.scopes,
        credentialProfile: useTikTokSandbox ? "sandbox" : "production",
        missingEnvVars: missing,
        liveActionRule: config.liveActionRule,
        ...(encryptedVerifier
          ? {
              pkceVerifier: {
                encryptedSecret: encryptedVerifier.encryptedSecret,
                encryptionIv: encryptedVerifier.encryptionIv,
                encryptionTag: encryptedVerifier.encryptionTag
              }
            }
          : {})
      }),
      JSON.stringify({
        safeMode: true,
        liveActionsEnabled: false,
        reason: missing.length > 0 ? "missing_provider_credentials" : "redirected_to_provider_authorization"
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.integration_connections (
      tenant_id, provider, display_name, status, credentials_status, scopes_json, metadata_json
    )
    values ($1, $2, $3, 'planned', 'not_configured', $4::jsonb, $5::jsonb)
    on conflict (tenant_id, provider) do update
    set display_name = excluded.display_name,
        scopes_json = excluded.scopes_json,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      workspaceId,
      config.provider,
      config.label,
      JSON.stringify(config.scopes),
      JSON.stringify({
        lastOAuthStartAt: new Date().toISOString(),
        lastOAuthStartState: missing.length > 0 ? "missing_credentials" : "redirected",
        liveActionRule: config.liveActionRule,
        requestedScopes: config.scopes
      })
    ]
  );

  if (missing.length > 0) {
    return appRedirect(request, {
      provider: config.provider,
      setup: "missing_credentials",
      missing: missing.join(",")
    });
  }

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set(
    config.clientIdParam ?? "client_id",
    String(useTikTokSandbox ? env.TIKTOK_SANDBOX_CLIENT_KEY : env[config.clientIdEnv])
  );
  authorizeUrl.searchParams.set("redirect_uri", String(env[config.redirectUriEnv]));
  authorizeUrl.searchParams.set("response_type", "code");
  if (config.configurationIdEnv) {
    authorizeUrl.searchParams.set("config_id", String(env[config.configurationIdEnv]));
  }
  if (config.sendScopes !== false) {
    authorizeUrl.searchParams.set("scope", config.scopes.join(config.scopeSeparator ?? " "));
  }
  authorizeUrl.searchParams.set("state", state);
  if (pkce) {
    authorizeUrl.searchParams.set("code_challenge", pkce.challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
  }
  Object.entries(config.query).forEach(([key, value]) => authorizeUrl.searchParams.set(key, value));

  return NextResponse.redirect(authorizeUrl);
}
