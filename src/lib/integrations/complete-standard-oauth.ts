import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import {
  assessOAuthScopes,
  exchangeStandardOAuthAuthorizationCode,
  standardOAuthProviderDetails,
  verifyStandardOAuthIdentity,
  type StandardOAuthProvider
} from "@/lib/integrations/standard-oauth";
import { getOAuthProviderConfig } from "@/lib/integrations/oauth-providers";
import { discoverAdvertisingAccounts } from "@/lib/integrations/advertising-account-discovery";
import { recordInitialOAuthAuthority } from "@/lib/integrations/authority-grants";
import { syncCustomerOnboardingForTenant } from "@/lib/onboarding/customer-onboarding";
import { discoverConnectedProviderContext } from "@/lib/onboarding/post-connection-discovery";
import { oauthAppRedirect } from "@/lib/onboarding/oauth-return";

function appRedirect(request: Request, params: Record<string, string>, returnTo: string | null | undefined = "/app/integrations") {
  return oauthAppRedirect(request, params, returnTo);
}

function providerClient(provider: StandardOAuthProvider) {
  if (provider === "reddit") {
    return { clientId: env.REDDIT_CLIENT_ID, clientSecret: env.REDDIT_CLIENT_SECRET, redirectUri: env.REDDIT_OAUTH_REDIRECT_URI };
  }
  if (provider === "microsoft_ads" || provider === "microsoft_calendar" || provider === "microsoft_mailbox") {
    return { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, redirectUri: env.MICROSOFT_OAUTH_REDIRECT_URI };
  }
  if (provider === "jobber") {
    return { clientId: env.JOBBER_CLIENT_ID, clientSecret: env.JOBBER_CLIENT_SECRET, redirectUri: env.JOBBER_OAUTH_REDIRECT_URI };
  }
  if (provider === "linkedin_ads") {
    return { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET, redirectUri: env.LINKEDIN_OAUTH_REDIRECT_URI };
  }
  if (provider === "pinterest_ads") {
    return { clientId: env.PINTEREST_CLIENT_ID, clientSecret: env.PINTEREST_CLIENT_SECRET, redirectUri: env.PINTEREST_OAUTH_REDIRECT_URI };
  }
  if (provider === "snapchat_ads") {
    return { clientId: env.SNAPCHAT_CLIENT_ID, clientSecret: env.SNAPCHAT_CLIENT_SECRET, redirectUri: env.SNAPCHAT_OAUTH_REDIRECT_URI };
  }
  if (provider === "amazon_ads") {
    return { clientId: env.AMAZON_ADS_CLIENT_ID, clientSecret: env.AMAZON_ADS_CLIENT_SECRET, redirectUri: env.AMAZON_ADS_OAUTH_REDIRECT_URI };
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI };
}

async function claimOAuthJob(workspaceId: string, state: string, allowedProviders: StandardOAuthProvider[]) {
  const result = await queryPostgres<{
    id: string;
    provider: StandardOAuthProvider;
    pkce_verifier: { encryptedSecret?: string; encryptionIv?: string; encryptionTag?: string } | null;
    return_to: string | null;
  }>(
    `
    update public.integration_jobs
    set status = 'running', started_at = now()
    where id = (
      select id
      from public.integration_jobs
      where tenant_id = $1
        and job_type = 'oauth_start_requested'
        and status = 'queued'
        and payload_json->>'provider' = any($3::text[])
        and payload_json->>'oauthState' = $2
        and created_at > now() - interval '10 minutes'
      order by created_at desc
      limit 1
      for update skip locked
    )
    returning id, payload_json->>'provider' as provider, payload_json->'pkceVerifier' as pkce_verifier,
      payload_json->>'returnTo' as return_to
    `,
    [workspaceId, state, allowedProviders]
  );
  return result?.rows[0] ?? null;
}

async function finishOAuthJob(jobId: string, status: "completed" | "failed", result: Record<string, unknown>, error?: string) {
  await queryPostgres(
    `update public.integration_jobs
     set status = $2, result_json = $3::jsonb, error_message = $4, completed_at = now(),
         payload_json = payload_json - 'pkceVerifier'
     where id = $1`,
    [jobId, status, JSON.stringify(result), error ?? null]
  );
}

export async function saveCredential(input: {
  workspaceId: string;
  userId: string | null;
  provider: StandardOAuthProvider;
  label: "oauth_access_token" | "oauth_refresh_token" | "oauth_token_secret";
  kind: "auth_token" | "refresh_token";
  secret: string;
  rotationDueAt: string;
  metadata: Record<string, unknown>;
}) {
  const encrypted = encryptSecret(input.secret);
  if (!encrypted) throw new Error("Encrypted credential storage is not configured.");
  const result = await queryPostgres(
    `
    insert into public.tenant_provider_credentials (
      tenant_id, provider_key, credential_label, credential_kind, status, secret_preview,
      secret_fingerprint, encrypted_secret, encryption_iv, encryption_tag, rotation_due_at,
      last_verified_at, created_by_user_id, updated_by_user_id, metadata_json
    )
    values ($1, $2, $3, $4, 'configured', $5, $6, $7, $8, $9, $10::timestamptz, now(), $11, $11, $12::jsonb)
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
  if (!result?.rowCount) throw new Error("Ferocity could not securely save the provider credential.");
}

export async function recordConnectedProvider(input: {
  workspaceId: string;
  provider: StandardOAuthProvider;
  scopes: string[];
  metadata: Record<string, unknown>;
}) {
  const details = standardOAuthProviderDetails(input.provider);
  const displayName = typeof input.metadata.accountName === "string" && input.metadata.accountName
    ? `${details.label} — ${input.metadata.accountName}`
    : details.label;

  await queryPostgres(
    `
    insert into public.integration_connections (
      tenant_id, provider, display_name, status, credentials_status, scopes_json, metadata_json, last_checked_at
    )
    values ($1, $2, $3, 'connected', 'configured', $4::jsonb, $5::jsonb, now())
    on conflict (tenant_id, provider) do update
    set display_name = excluded.display_name, status = 'connected', credentials_status = 'configured',
        scopes_json = excluded.scopes_json,
        metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
        last_checked_at = now(), updated_at = now()
    `,
    [input.workspaceId, input.provider, displayName, JSON.stringify(input.scopes), JSON.stringify(input.metadata)]
  );
  await queryPostgres(
    `
    insert into public.provider_accounts (
      tenant_id, provider_key, display_name, status, credentials_status, live_actions_enabled, metadata_json
    )
    values ($1, $2, $3, 'connected', 'configured', false, $4::jsonb)
    on conflict (tenant_id, provider_key) do update
    set display_name = excluded.display_name, status = 'connected', credentials_status = 'configured',
        live_actions_enabled = false,
        metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [input.workspaceId, input.provider, displayName, JSON.stringify(input.metadata)]
  );
  await queryPostgres(
    `
    insert into public.provider_connection_lanes (
      tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
      credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
    )
    values ($1, $2, $3, 'customer_owned', $4, 'connected', 'configured', false, 'provider_account', $5, $6::jsonb)
    on conflict (tenant_id, capability_key, lane_key) do update
    set provider_key = excluded.provider_key, display_name = excluded.display_name,
        connection_status = 'connected', credentials_status = 'configured', live_actions_enabled = false,
        source = 'provider_account', plain_language_status = excluded.plain_language_status,
        metadata_json = public.provider_connection_lanes.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [input.workspaceId, details.capability, input.provider, `Customer ${details.label}`, details.plainLanguageStatus, JSON.stringify(input.metadata)]
  );
}

async function completeConnection(input: {
  request: Request;
  workspaceId: string;
  jobId: string;
  provider: StandardOAuthProvider;
  code: string;
  codeVerifier?: string;
  returnTo?: string | null;
}) {
  const client = providerClient(input.provider);
  if (!client.clientId || !client.clientSecret || !client.redirectUri) {
    throw new Error("Provider OAuth credentials are incomplete.");
  }
  const tokens = await exchangeStandardOAuthAuthorizationCode({
    provider: input.provider,
    code: input.code,
    client: { clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: client.redirectUri },
    codeVerifier: input.codeVerifier
  });
  const identity = await verifyStandardOAuthIdentity({ provider: input.provider, accessToken: tokens.accessToken });
  const session = await getCurrentAppSession();
  const expiresAt = new Date(Date.now() + Math.max(300, tokens.expiresIn) * 1000).toISOString();
  const requestedScopes = getOAuthProviderConfig(input.provider)?.scopes ?? [];
  const scopeAssessment = assessOAuthScopes(requestedScopes, tokens.scopes);
  const effectiveScopes = scopeAssessment.effectiveScopes;
  const discoveryProviders = ["google_ads", "reddit", "microsoft_ads", "linkedin_ads", "pinterest_ads", "snapchat_ads", "amazon_ads"] as const;
  const discovery = discoveryProviders.includes(input.provider as (typeof discoveryProviders)[number])
    ? await discoverAdvertisingAccounts({
        provider: input.provider as (typeof discoveryProviders)[number],
        accessToken: tokens.accessToken
      })
    : null;
  const metadata = {
    source: `${input.provider}_oauth`,
    accountId: identity.accountId,
    accountName: identity.accountName,
    reportingVerified: identity.reportingVerified,
    connectedAt: new Date().toISOString(),
    accessTokenExpiresAt: expiresAt,
    scopes: effectiveScopes,
    requestedScopes,
    grantedScopes: scopeAssessment.grantedScopes,
    missingScopes: scopeAssessment.missingScopes,
    scopeVerificationStatus: scopeAssessment.status,
    liveActionsEnabled: false,
    ...(discovery ? {
      availableAccounts: discovery.accounts,
      selectedAccountId: discovery.selectedAccountId,
      accountSelectionRequired: discovery.selectionRequired,
      accountDiscoveryStatus: discovery.status,
      accountDiscoveryMessage: discovery.message
    } : {})
  };
  await saveCredential({
    workspaceId: input.workspaceId,
    userId: session?.userId ?? null,
    provider: input.provider,
    label: "oauth_access_token",
    kind: "auth_token",
    secret: tokens.accessToken,
    rotationDueAt: expiresAt,
    metadata
  });
  if (tokens.refreshToken) {
    await saveCredential({
      workspaceId: input.workspaceId,
      userId: session?.userId ?? null,
      provider: input.provider,
      label: "oauth_refresh_token",
      kind: "refresh_token",
      secret: tokens.refreshToken,
      rotationDueAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      metadata
    });
  }
  await recordConnectedProvider({ workspaceId: input.workspaceId, provider: input.provider, scopes: effectiveScopes, metadata });
  await recordInitialOAuthAuthority({
    tenantId: input.workspaceId,
    provider: input.provider,
    scopes: effectiveScopes,
    actorKey: session?.userId ?? null,
  });
  if (scopeAssessment.status !== "insufficient" && (input.provider === "gmail_mailbox" || input.provider === "microsoft_mailbox")) {
    const mailboxSaved = await queryPostgres(
      `insert into public.mailbox_connections (
         tenant_id, provider_key, account_external_id, account_email, display_name, status,
         read_enabled, send_enabled, metadata_json, connected_at
       ) values ($1,$2,$3,$4,$5,'connected',true,false,$6::jsonb,now())
       on conflict (tenant_id, provider_key) do update set
         account_external_id=excluded.account_external_id, account_email=excluded.account_email,
         display_name=excluded.display_name, status='connected', read_enabled=true,
         metadata_json=public.mailbox_connections.metadata_json || excluded.metadata_json,
         connected_at=now(), updated_at=now()`,
      [input.workspaceId, input.provider, identity.accountId, identity.accountName, identity.accountName, JSON.stringify(metadata)]
    );
    if (!mailboxSaved?.rowCount) throw new Error("Ferocity could not finish the mailbox connection.");
    await queryPostgres(
      `update public.ai_monitor_sources set status='connected',provider_key=$2,metadata_json=metadata_json || $3::jsonb,updated_at=now()
       where tenant_id=$1 and source_key='email_monitor'`,
      [input.workspaceId, input.provider, JSON.stringify({ connectedMailbox: identity.accountName, connectedAt: new Date().toISOString() })]
    );
  }
  await finishOAuthJob(input.jobId, "completed", {
    safeMode: true,
    provider: input.provider,
    reportingVerified: identity.reportingVerified,
    liveActionsEnabled: false
  });
  const onboardingDiscovery = scopeAssessment.status === "insufficient"
    ? {
        status: "failed" as const,
        summary: `Reconnect ${standardOAuthProviderDetails(input.provider).label} and approve the required read access.`,
        recordsDiscovered: 0,
      }
    : await discoverConnectedProviderContext({
        tenantId: input.workspaceId,
        provider: input.provider,
      });
  await syncCustomerOnboardingForTenant(input.workspaceId).catch(() => null);
  return appRedirect(input.request, {
    provider: input.provider,
    setup: scopeAssessment.status === "insufficient" ? "scope_reconnect_required" : "connected",
    onboarding: "resumed",
    discovery: onboardingDiscovery.status,
    discovered: String(onboardingDiscovery.recordsDiscovered),
  }, input.returnTo ?? undefined);
}

export async function handleStandardOAuthCallback(request: Request, allowedProviders: StandardOAuthProvider[]) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) {
    return NextResponse.json(
      { ok: false, error: "Invalid OAuth callback." },
      { status: 400 }
    );
  }
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const job = await claimOAuthJob(workspaceId, state, allowedProviders);
  if (!job) return appRedirect(request, { provider: "oauth", setup: "invalid_state" });
  const providerError = url.searchParams.get("error") || url.searchParams.get("error_description");
  if (providerError) {
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "authorization_denied" }, providerError);
    return appRedirect(request, { provider: job.provider, setup: "denied" }, job.return_to);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "incomplete_callback" }, "OAuth callback did not include an authorization code.");
    return appRedirect(request, { provider: job.provider, setup: "failed" }, job.return_to);
  }
  if (!hasCredentialEncryptionKey()) {
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "credential_encryption_unavailable" }, "Encrypted credential storage is not configured.");
    return appRedirect(request, { provider: job.provider, setup: "encryption_required" }, job.return_to);
  }
  try {
    const sealed = job.pkce_verifier;
    const codeVerifier = sealed?.encryptedSecret && sealed.encryptionIv && sealed.encryptionTag
      ? decryptSecret({ encryptedSecret: sealed.encryptedSecret, encryptionIv: sealed.encryptionIv, encryptionTag: sealed.encryptionTag })
      : undefined;
    if (job.provider === "jobber" && !codeVerifier) throw new Error("The secure Jobber authorization verifier expired. Please reconnect.");
    return await completeConnection({ request, workspaceId, jobId: job.id, provider: job.provider, code, codeVerifier: codeVerifier ?? undefined, returnTo: job.return_to });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider connection failed.";
    await finishOAuthJob(job.id, "failed", { safeMode: true, reason: "token_exchange_failed" }, message);
    return appRedirect(request, { provider: job.provider, setup: "failed" }, job.return_to);
  }
}
