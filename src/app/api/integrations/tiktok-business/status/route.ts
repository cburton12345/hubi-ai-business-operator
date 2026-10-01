import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { listTikTokAdvertisers, listTikTokCampaigns, getTikTokIntegratedReport } from "@/lib/integrations/tiktok-business-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(request: Request) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const secrets = await resolveTenantProviderSecrets(workspaceId, "tiktok_business");
  const accessToken = secretByAliases(secrets, ["oauth_access_token"], "auth_token");
  if (!accessToken) return Response.json({ ok: false, status: "not_connected" }, { status: 409 });

  const url = new URL(request.url);
  const advertiserId = url.searchParams.get("advertiser_id");
  const view = url.searchParams.get("view") ?? "advertisers";
  try {
    if (view === "advertisers") {
      const result = await listTikTokAdvertisers(accessToken);
      return Response.json({ ok: true, advertisers: result.data.list, requestId: result.requestId });
    }
    if (!advertiserId) return Response.json({ ok: false, error: "advertiser_id is required" }, { status: 400 });
    if (view === "campaigns") {
      const result = await listTikTokCampaigns({ accessToken, advertiserId });
      return Response.json({ ok: true, ...result.data, requestId: result.requestId });
    }
    if (view === "report") {
      const today = new Date().toISOString().slice(0, 10);
      const start = dateSchema.safeParse(url.searchParams.get("start_date") ?? today);
      const end = dateSchema.safeParse(url.searchParams.get("end_date") ?? today);
      if (!start.success || !end.success) return Response.json({ ok: false, error: "Dates must use YYYY-MM-DD." }, { status: 400 });
      const result = await getTikTokIntegratedReport({ accessToken, advertiserId, startDate: start.data, endDate: end.data });
      return Response.json({ ok: true, ...result.data, requestId: result.requestId });
    }
    return Response.json({ ok: false, error: "Unsupported view." }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "TikTok API request failed." }, { status: 502 });
  }
}
