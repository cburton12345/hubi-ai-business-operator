import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishStorageUpload, reserveStorageUpload } from "@/lib/usage/storage-quota";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export const dynamic = "force-dynamic";

const bucket = "marketing-video-assets";
const maxBytes = 8 * 1024 * 1024;
const allowedTypes = new Set(["video/mp4", "video/webm"]);

export async function POST(request: Request, { params }: { params: Promise<{ videoJobId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session?.userId) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const [{ videoJobId }, tenantId, form] = await Promise.all([params, getCurrentWorkspaceId(), request.formData()]);
  const file = form.get("file");
  const aspectRatio = String(form.get("aspectRatio") ?? "").slice(0, 10);
  const label = String(form.get("label") ?? "Finished video").slice(0, 100);
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json({ ok: false, error: "A finished MP4 or WebM file under 8 MB is required." }, { status: 400 });
  }
  if (!new Set(["16:9", "9:16", "1:1", "4:5"]).has(aspectRatio)) {
    return NextResponse.json({ ok: false, error: "The channel aspect ratio is invalid." }, { status: 400 });
  }

  const jobResult = await queryPostgres<{ brand_id: string | null; status: string; metadata_json: Record<string, unknown> | null }>(
    `select brand_id, status, metadata_json from public.marketing_video_jobs where tenant_id = $1 and id = $2 limit 1`,
    [tenantId, videoJobId]
  );
  const job = jobResult?.rows[0];
  const metadata = job?.metadata_json && typeof job.metadata_json === "object" ? job.metadata_json : {};
  const quality = metadata.qualityReview && typeof metadata.qualityReview === "object" ? metadata.qualityReview as Record<string, unknown> : {};
  if (!job || job.status !== "completed" || quality.status !== "complete" || quality.decision === "rerender_recommended") {
    return NextResponse.json({ ok: false, error: "This source has not passed the finishing gate." }, { status: 409 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Private video storage is not configured." }, { status: 503 });
  const assetId = crypto.randomUUID();
  const extension = file.type === "video/mp4" ? "mp4" : "webm";
  const storagePath = `${tenantId}/${videoJobId}/${assetId}.${extension}`;
  const storageEventId = await reserveStorageUpload({
    tenantId,
    bucket,
    storageKey: storagePath,
    sourceType: "marketing_video_finish",
    sourceId: videoJobId,
    byteCount: file.size,
    idempotencyKey: `video-finish:${videoJobId}:${aspectRatio}:${assetId}`,
    metadata: { assetId, aspectRatio, label, mimeType: file.type }
  });
  if (!storageEventId) return NextResponse.json({ ok: false, error: "The workspace storage limit would be exceeded." }, { status: 409 });

  const upload = await supabase.storage.from(bucket).upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false
  });
  if (upload.error) {
    await finishStorageUpload(storageEventId, "failed", { providerError: upload.error.message });
    return NextResponse.json({ ok: false, error: "The finished cut could not be stored." }, { status: 502 });
  }
  await finishStorageUpload(storageEventId, "active");
  const asset = {
    id: assetId,
    label,
    aspectRatio,
    mimeType: file.type,
    byteCount: file.size,
    storagePath,
    createdAt: new Date().toISOString(),
    status: extension === "mp4" ? "ready" : "conversion_may_be_required",
    url: `/api/video/${videoJobId}/finished/${assetId}`
  };
  await queryPostgres(
    `
    update public.marketing_video_jobs
    set metadata_json = jsonb_set(
          metadata_json || jsonb_build_object('productionStatus', 'finished_assets_ready'),
          '{finishedAssets}',
          coalesce(metadata_json->'finishedAssets', '[]'::jsonb) || $3::jsonb,
          true
        ),
        history_json = history_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      videoJobId,
      JSON.stringify([asset]),
      JSON.stringify([{ status: "finished_asset_ready", at: new Date().toISOString(), note: `${label} (${aspectRatio}) was finished and stored without another premium generation.` }])
    ]
  );
  return NextResponse.json({ ok: true, asset });
}
