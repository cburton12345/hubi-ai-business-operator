import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { encryptSecret, hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { requestXOAuthToken } from "@/lib/integrations/x-ads-oauth1";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { normalizeOAuthReturnTo } from "@/lib/onboarding/oauth-return";

function appRedirect(request: Request, setup: string) {
  const url = new URL("/app/integrations", request.url);
  url.searchParams.set("provider", "x_ads");
  url.searchParams.set("setup", setup);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  if (!env.X_ADS_CONSUMER_KEY || !env.X_ADS_CONSUMER_SECRET || !env.X_ADS_OAUTH_REDIRECT_URI || !hasCredentialEncryptionKey()) {
    return appRedirect(request, "missing_credentials");
  }
  const workspaceId = await getCurrentWorkspaceId();
  const returnTo = normalizeOAuthReturnTo(new URL(request.url).searchParams.get("returnTo"));
  try {
    const token = await requestXOAuthToken({
      consumerKey: env.X_ADS_CONSUMER_KEY,
      consumerSecret: env.X_ADS_CONSUMER_SECRET,
      callbackUrl: env.X_ADS_OAUTH_REDIRECT_URI
    });
    const sealed = encryptSecret(token.tokenSecret);
    if (!sealed) return appRedirect(request, "encryption_required");
    await queryPostgres(
      `insert into public.integration_jobs (tenant_id, job_type, status, payload_json, result_json)
       values ($1,'oauth_start_requested','queued',$2::jsonb,$3::jsonb)`,
      [workspaceId, JSON.stringify({
        provider: "x_ads",
        oauthToken: token.token,
        returnTo,
        oauthTokenSecret: {
          encryptedSecret: sealed.encryptedSecret,
          encryptionIv: sealed.encryptionIv,
          encryptionTag: sealed.encryptionTag
        }
      }), JSON.stringify({ safeMode: true, liveActionsEnabled: false })]
    );
    return NextResponse.redirect(`https://api.x.com/oauth/authenticate?oauth_token=${encodeURIComponent(token.token)}`);
  } catch {
    return appRedirect(request, "failed");
  }
}
