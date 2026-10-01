import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { fetchTikTokPublishStatus } from "@/lib/integrations/tiktok-content-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function POST(request: Request) {
  await requirePermission("ai:queue");
  const parsed = z.object({ queueId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "A valid publishing queue ID is required." }, { status: 400 });
  const workspaceId = await getCurrentWorkspaceId();
  const item = await queryPostgres<{ id: string; external_reference: string }>(`select id,external_reference from public.publishing_queue where tenant_id=$1 and id=$2 and target_platform='tiktok' and external_reference is not null limit 1`, [workspaceId, parsed.data.queueId]);
  const row = item?.rows[0];
  if (!row) return Response.json({ ok: false, error: "TikTok publish job was not found." }, { status: 404 });
  const token = secretByAliases(await resolveTenantProviderSecrets(workspaceId, "tiktok_content"), ["oauth_access_token"], "auth_token");
  if (!token) return Response.json({ ok: false, error: "TikTok content authorization is missing." }, { status: 409 });
  try {
    const status = await fetchTikTokPublishStatus(token, row.external_reference);
    const completed = status.data.status === "PUBLISH_COMPLETE";
    const failed = status.data.status === "FAILED";
    await queryPostgres(
      `update public.publishing_queue set provider_status=$3,queue_status=$4,published_at=case when $4='published_manually' then now() else published_at end,
       metadata_json=metadata_json || $5::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [workspaceId, row.id, failed ? "error" : "ready", completed ? "published_manually" : failed ? "failed" : "approved", JSON.stringify({ providerStatus: status.data.status, providerFailure: status.data.fail_reason ?? null, publicPostIds: status.data.publicly_available_post_id ?? [], statusCheckedAt: new Date().toISOString() })]
    );
    return Response.json({ ok: true, ...status.data });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "TikTok status check failed." }, { status: 502 });
  }
}
