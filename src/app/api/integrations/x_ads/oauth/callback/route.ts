import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { decryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { recordConnectedProvider, saveCredential } from "@/lib/integrations/complete-standard-oauth";
import { discoverXAdAccounts, exchangeXOAuthToken } from "@/lib/integrations/x-ads-oauth1";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function appRedirect(request: Request, setup: string) {
  const url = new URL("/app/integrations", request.url);
  url.searchParams.set("provider", "x_ads");
  url.searchParams.set("setup", setup);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  const url = new URL(request.url);
  const requestToken = url.searchParams.get("oauth_token");
  const verifier = url.searchParams.get("oauth_verifier");
  if (!requestToken || !verifier || !env.X_ADS_CONSUMER_KEY || !env.X_ADS_CONSUMER_SECRET || !hasCredentialEncryptionKey()) {
    return appRedirect(request, "failed");
  }
  const workspaceId = await getCurrentWorkspaceId();
  const claimed = await queryPostgres<{
    id: string;
    oauth_token_secret: { encryptedSecret?: string; encryptionIv?: string; encryptionTag?: string } | null;
  }>(
    `update public.integration_jobs set status='running',started_at=now()
     where id=(select id from public.integration_jobs where tenant_id=$1 and job_type='oauth_start_requested'
       and status='queued' and payload_json->>'provider'='x_ads' and payload_json->>'oauthToken'=$2
       and created_at>now()-interval '15 minutes' order by created_at desc limit 1 for update skip locked)
     returning id,payload_json->'oauthTokenSecret' as oauth_token_secret`,
    [workspaceId, requestToken]
  );
  const job = claimed?.rows[0];
  const sealed = job?.oauth_token_secret;
  if (!job || !sealed?.encryptedSecret || !sealed.encryptionIv || !sealed.encryptionTag) return appRedirect(request, "invalid_state");
  try {
    const requestTokenSecret = decryptSecret({ encryptedSecret: sealed.encryptedSecret, encryptionIv: sealed.encryptionIv, encryptionTag: sealed.encryptionTag });
    if (!requestTokenSecret) throw new Error("The X authorization request expired.");
    const tokens = await exchangeXOAuthToken({
      consumerKey: env.X_ADS_CONSUMER_KEY,
      consumerSecret: env.X_ADS_CONSUMER_SECRET,
      requestToken,
      requestTokenSecret,
      verifier
    });
    const accounts = await discoverXAdAccounts({
      consumerKey: env.X_ADS_CONSUMER_KEY,
      consumerSecret: env.X_ADS_CONSUMER_SECRET,
      accessToken: tokens.accessToken,
      accessTokenSecret: tokens.accessTokenSecret
    });
    const selectedAccountId = accounts.length === 1 ? accounts[0]!.id : null;
    const metadata = {
      source: "x_ads_oauth1",
      accountId: tokens.userId,
      accountName: tokens.screenName,
      reportingVerified: accounts.length > 0,
      connectedAt: new Date().toISOString(),
      availableAccounts: accounts,
      selectedAccountId,
      accountSelectionRequired: accounts.length !== 1,
      accountDiscoveryStatus: accounts.length ? "discovered" : "not_available",
      accountDiscoveryMessage: accounts.length ? "Choose the X advertiser account Ferocity should use." : "No eligible X advertiser account was returned.",
      liveActionsEnabled: false
    };
    const session = await getCurrentAppSession();
    const rotationDueAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    await saveCredential({ workspaceId, userId: session?.userId ?? null, provider: "x_ads", label: "oauth_access_token", kind: "auth_token", secret: tokens.accessToken, rotationDueAt, metadata });
    await saveCredential({ workspaceId, userId: session?.userId ?? null, provider: "x_ads", label: "oauth_token_secret", kind: "auth_token", secret: tokens.accessTokenSecret, rotationDueAt, metadata });
    await recordConnectedProvider({ workspaceId, provider: "x_ads", scopes: ["ads.read"], metadata });
    await queryPostgres(
      `update public.integration_jobs set status='completed',result_json=$2::jsonb,completed_at=now(),payload_json=payload_json-'oauthTokenSecret' where id=$1`,
      [job.id, JSON.stringify({ safeMode: true, provider: "x_ads", reportingVerified: accounts.length > 0, liveActionsEnabled: false })]
    );
    return appRedirect(request, "connected");
  } catch (error) {
    await queryPostgres(
      `update public.integration_jobs set status='failed',error_message=$2,completed_at=now(),payload_json=payload_json-'oauthTokenSecret' where id=$1`,
      [job.id, error instanceof Error ? error.message : "X authorization failed."]
    );
    return appRedirect(request, "failed");
  }
}
