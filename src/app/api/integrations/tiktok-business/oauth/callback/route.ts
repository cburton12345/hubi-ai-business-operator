import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { exchangeTikTokBusinessAuthorizationCode, listTikTokAdvertisers } from "@/lib/integrations/tiktok-business-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { recordInitialOAuthAuthority } from "@/lib/integrations/authority-grants";
import { syncCustomerOnboardingForTenant } from "@/lib/onboarding/customer-onboarding";
import { oauthAppRedirect } from "@/lib/onboarding/oauth-return";

function appRedirect(request: Request, params: Record<string, string>, returnTo?: string | null) {
  return oauthAppRedirect(request, params, returnTo);
}

async function saveToken(input: { workspaceId: string; userId: string | null; token: string; expiresAt: string; advertisers: string[] }) {
  const encrypted = encryptSecret(input.token);
  if (!encrypted) throw new Error("Encrypted credential storage is not configured.");
  await queryPostgres(
    `insert into public.tenant_provider_credentials (
       tenant_id, provider_key, credential_label, credential_kind, status, secret_preview, secret_fingerprint,
       encrypted_secret, encryption_iv, encryption_tag, rotation_due_at, last_verified_at,
       created_by_user_id, updated_by_user_id, metadata_json
     ) values ($1,'tiktok_business','oauth_access_token','auth_token','configured',$2,$3,$4,$5,$6,$7::timestamptz,now(),$8,$8,$9::jsonb)
     on conflict (tenant_id, provider_key, credential_label) do update set
       status='configured', secret_preview=excluded.secret_preview, secret_fingerprint=excluded.secret_fingerprint,
       encrypted_secret=excluded.encrypted_secret, encryption_iv=excluded.encryption_iv, encryption_tag=excluded.encryption_tag,
       rotation_due_at=excluded.rotation_due_at, last_verified_at=now(), updated_by_user_id=excluded.updated_by_user_id,
       metadata_json=public.tenant_provider_credentials.metadata_json || excluded.metadata_json, updated_at=now()`,
    [input.workspaceId, encrypted.secretPreview, encrypted.secretFingerprint, encrypted.encryptedSecret, encrypted.encryptionIv, encrypted.encryptionTag, input.expiresAt, input.userId, JSON.stringify({ source: "tiktok_business_oauth", advertiserIds: input.advertisers })]
  );
}

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
  const workspaceId = await getCurrentWorkspaceId();
  if (!state) return appRedirect(request, { provider: "tiktok_business", setup: "invalid_state" });

  const claimed = await queryPostgres<{ id: string; return_to: string | null }>(
    `update public.integration_jobs set status='running', started_at=now()
     where id=(select id from public.integration_jobs where tenant_id=$1 and job_type='oauth_start_requested'
       and status='queued' and payload_json->>'provider'='tiktok_business' and payload_json->>'oauthState'=$2
       and created_at > now() - interval '10 minutes' order by created_at desc limit 1 for update skip locked)
     returning id,payload_json->>'returnTo' as return_to`,
    [workspaceId, state]
  );
  const job = claimed?.rows[0];
  if (!job) return appRedirect(request, { provider: "tiktok_business", setup: "invalid_state" });
  if (!authCode || !env.TIKTOK_BUSINESS_APP_ID || !env.TIKTOK_BUSINESS_APP_SECRET || !env.TIKTOK_BUSINESS_REDIRECT_URI || !hasCredentialEncryptionKey()) {
    await queryPostgres(`update public.integration_jobs set status='failed', error_message='TikTok Business callback or server configuration was incomplete.', completed_at=now() where id=$1`, [job.id]);
    return appRedirect(request, { provider: "tiktok_business", setup: "failed" }, job.return_to);
  }

  try {
    const token = await exchangeTikTokBusinessAuthorizationCode({ appId: env.TIKTOK_BUSINESS_APP_ID, appSecret: env.TIKTOK_BUSINESS_APP_SECRET, authCode, redirectUri: env.TIKTOK_BUSINESS_REDIRECT_URI });
    const advertisers = await listTikTokAdvertisers(token.access_token);
    const advertiserIds = advertisers.data.list.map((item) => item.advertiser_id);
    const expiresAt = new Date(Date.now() + (token.expires_in ?? 86_400) * 1000).toISOString();
    const session = await getCurrentAppSession();
    await saveToken({ workspaceId, userId: session?.userId ?? null, token: token.access_token, expiresAt, advertisers: advertiserIds });
    const metadata = { connectedAt: new Date().toISOString(), advertiserIds, advertisers: advertisers.data.list, liveActionsEnabled: false, readReportingReady: true, campaignWritesApprovalGated: true };
    await queryPostgres(
      `insert into public.integration_connections (tenant_id,provider,display_name,status,credentials_status,scopes_json,metadata_json,last_checked_at)
       values ($1,'tiktok_business','TikTok Ads','connected','configured',$2::jsonb,$3::jsonb,now())
       on conflict (tenant_id,provider) do update set status='connected',credentials_status='configured',scopes_json=excluded.scopes_json,
       metadata_json=public.integration_connections.metadata_json || excluded.metadata_json,last_checked_at=now(),updated_at=now()`,
      [workspaceId, JSON.stringify(token.scope ?? []), JSON.stringify(metadata)]
    );
    await queryPostgres(
      `insert into public.provider_accounts (tenant_id,provider_key,display_name,status,credentials_status,live_actions_enabled,metadata_json)
       values ($1,'tiktok_business','TikTok Ads','connected','configured',false,$2::jsonb)
       on conflict (tenant_id,provider_key) do update set status='connected',credentials_status='configured',live_actions_enabled=false,
       metadata_json=public.provider_accounts.metadata_json || excluded.metadata_json,updated_at=now()`,
      [workspaceId, JSON.stringify(metadata)]
    );
    await queryPostgres(
      `insert into public.provider_connection_lanes (tenant_id,capability_key,provider_key,lane_key,display_name,connection_status,credentials_status,live_actions_enabled,source,plain_language_status,metadata_json)
       values ($1,'tiktok_ads','tiktok_business','customer_owned','Customer TikTok Ads','connected','configured',false,'provider_account',$2,$3::jsonb)
       on conflict (tenant_id,capability_key,lane_key) do update set provider_key='tiktok_business',display_name='Customer TikTok Ads',connection_status='connected',
       credentials_status='configured',live_actions_enabled=false,source='provider_account',plain_language_status=excluded.plain_language_status,
       metadata_json=public.provider_connection_lanes.metadata_json || excluded.metadata_json,updated_at=now()`,
      [workspaceId, "TikTok Ads reporting is connected. Campaign writes remain off until provider approval, account certification, customer approval, and hard budget caps are all active.", JSON.stringify(metadata)]
    );
    await queryPostgres(`update public.integration_jobs set status='completed',result_json=$2::jsonb,completed_at=now() where id=$1`, [job.id, JSON.stringify({ provider: "tiktok_business", advertiserIds, liveActionsEnabled: false })]);
    await recordInitialOAuthAuthority({ tenantId: workspaceId, provider: "tiktok_business", scopes: token.scope ?? [], actorKey: session?.userId ?? null });
    await syncCustomerOnboardingForTenant(workspaceId).catch(() => null);
    return appRedirect(request, { provider: "tiktok_business", setup: "connected", onboarding: "resumed" }, job.return_to);
  } catch (error) {
    const message = error instanceof Error ? error.message : "TikTok Business connection failed.";
    await queryPostgres(`update public.integration_jobs set status='failed',error_message=$2,result_json=$3::jsonb,completed_at=now() where id=$1`, [job.id, message, JSON.stringify({ safeMode: true, reason: "token_exchange_failed" })]);
    return appRedirect(request, { provider: "tiktok_business", setup: "failed" }, job.return_to);
  }
}
