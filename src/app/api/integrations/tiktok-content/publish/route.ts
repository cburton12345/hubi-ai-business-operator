import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { initializeTikTokDirectPost, queryTikTokCreatorInfo } from "@/lib/integrations/tiktok-content-api";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const requestSchema = z.object({ queueId: z.string().uuid() });

export async function POST(request: Request) {
  await requirePermission("ai:queue");
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ ok: false, error: "A valid publishing queue ID is required." }, { status: 400 });
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string; queue_status: string; video_url: string | null; title: string | null; privacy_level: string | null;
    disable_comment: boolean; disable_duet: boolean; disable_stitch: boolean; ai_generated: boolean; live_actions_enabled: boolean;
  }>(
    `select q.id,q.queue_status,q.metadata_json->>'videoUrl' as video_url,q.metadata_json->>'title' as title,
       q.metadata_json->>'privacyLevel' as privacy_level,coalesce((q.metadata_json->>'disableComment')::boolean,false) as disable_comment,
       coalesce((q.metadata_json->>'disableDuet')::boolean,false) as disable_duet,
       coalesce((q.metadata_json->>'disableStitch')::boolean,false) as disable_stitch,
       coalesce((q.metadata_json->>'aiGenerated')::boolean,false) as ai_generated,a.live_actions_enabled
     from public.publishing_queue q
     join public.provider_accounts a on a.tenant_id=q.tenant_id and a.provider_key='tiktok_content' and a.status='connected' and a.credentials_status='configured'
     where q.tenant_id=$1 and q.id=$2 and q.target_platform='tiktok' and q.queue_status in ('approved','scheduled') limit 1`,
    [workspaceId, body.data.queueId]
  );
  const row = result?.rows[0];
  if (!row) return Response.json({ ok: false, error: "This item is not approved or TikTok Content Publishing is not connected." }, { status: 409 });
  if (!row.live_actions_enabled) return Response.json({ ok: false, error: "TikTok live publishing is still disabled for this workspace." }, { status: 409 });
  if (!row.video_url || !row.title || !row.privacy_level) return Response.json({ ok: false, error: "Video URL, title, and privacy choice are required before publishing." }, { status: 400 });

  const secrets = await resolveTenantProviderSecrets(workspaceId, "tiktok_content");
  const accessToken = secretByAliases(secrets, ["oauth_access_token"], "auth_token");
  if (!accessToken) return Response.json({ ok: false, error: "TikTok content authorization is missing." }, { status: 409 });
  try {
    const creator = await queryTikTokCreatorInfo(accessToken);
    if (!creator.data.privacy_level_options.includes(row.privacy_level)) {
      return Response.json({ ok: false, error: "The selected privacy option is no longer allowed. Review the current creator settings." }, { status: 409 });
    }
    const initialized = await initializeTikTokDirectPost({
      accessToken, title: row.title, privacyLevel: row.privacy_level, videoUrl: row.video_url,
      disableComment: row.disable_comment || creator.data.comment_disabled,
      disableDuet: row.disable_duet || creator.data.duet_disabled,
      disableStitch: row.disable_stitch || creator.data.stitch_disabled,
      aiGenerated: row.ai_generated
    });
    await queryPostgres(
      `update public.publishing_queue set provider_status='ready',external_reference=$3,
       metadata_json=metadata_json || $4::jsonb,updated_at=now() where tenant_id=$1 and id=$2`,
      [workspaceId, row.id, initialized.data.publish_id, JSON.stringify({ provider: "tiktok_content", publishId: initialized.data.publish_id, providerStatus: "processing", initializedAt: new Date().toISOString(), creatorUsername: creator.data.creator_username })]
    );
    return Response.json({ ok: true, publishId: initialized.data.publish_id, status: "processing" }, { status: 202 });
  } catch (error) {
    await queryPostgres(`update public.publishing_queue set provider_status='error',queue_status='failed',metadata_json=metadata_json || $3::jsonb,updated_at=now() where tenant_id=$1 and id=$2`, [workspaceId, row.id, JSON.stringify({ providerError: error instanceof Error ? error.message : "TikTok publishing failed.", failedAt: new Date().toISOString() })]);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "TikTok publishing failed." }, { status: 502 });
  }
}
