import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { hasCredentialEncryptionKey } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { env, missingEnvVars } from "@/lib/env";
import { buildTikTokBusinessAuthorizationUrl } from "@/lib/integrations/tiktok-business-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { normalizeOAuthReturnTo } from "@/lib/onboarding/oauth-return";

function appRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/app/integrations", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  const missing = [
    ...missingEnvVars(["TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET", "TIKTOK_BUSINESS_REDIRECT_URI"]),
    ...(!hasCredentialEncryptionKey() ? ["CREDENTIAL_ENCRYPTION_KEY"] : [])
  ];
  if (missing.length) return appRedirect(request, { provider: "tiktok_business", setup: "missing_credentials", missing: missing.join(",") });

  const workspaceId = await getCurrentWorkspaceId();
  const returnTo = normalizeOAuthReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const state = randomUUID();
  await queryPostgres(
    `insert into public.integration_jobs (tenant_id, job_type, status, payload_json, result_json)
     values ($1, 'oauth_start_requested', 'queued', $2::jsonb, $3::jsonb)`,
    [
      workspaceId,
      JSON.stringify({ provider: "tiktok_business", oauthState: state, returnTo, requestedScopes: ["advertiser.read", "campaign.read", "report.read", "campaign.write"] }),
      JSON.stringify({ safeMode: true, liveActionsEnabled: false, reason: "redirected_to_provider_authorization" })
    ]
  );

  return NextResponse.redirect(buildTikTokBusinessAuthorizationUrl({
    appId: env.TIKTOK_BUSINESS_APP_ID!,
    state,
    redirectUri: env.TIKTOK_BUSINESS_REDIRECT_URI!
  }));
}
