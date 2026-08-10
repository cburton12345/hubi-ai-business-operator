import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export const dynamic = "force-dynamic";

type Asset = { id?: unknown; storagePath?: unknown };

export async function GET(_request: Request, { params }: { params: Promise<{ videoJobId: string; assetId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session?.userId) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const [{ videoJobId, assetId }, tenantId] = await Promise.all([params, getCurrentWorkspaceId()]);
  const result = await queryPostgres<{ metadata_json: Record<string, unknown> | null }>(
    `select metadata_json from public.marketing_video_jobs where tenant_id = $1 and id = $2 limit 1`,
    [tenantId, videoJobId]
  );
  const assets = Array.isArray(result?.rows[0]?.metadata_json?.finishedAssets)
    ? result?.rows[0]?.metadata_json?.finishedAssets as Asset[]
    : [];
  const asset = assets.find((item) => item.id === assetId && typeof item.storagePath === "string");
  if (!asset || typeof asset.storagePath !== "string") {
    return NextResponse.json({ ok: false, error: "Finished asset not found." }, { status: 404 });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Private video storage is not configured." }, { status: 503 });
  const signed = await supabase.storage.from("marketing-video-assets").createSignedUrl(asset.storagePath, 60 * 5, { download: false });
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ ok: false, error: "Finished asset is temporarily unavailable." }, { status: 502 });
  }
  return NextResponse.redirect(signed.data.signedUrl, 307);
}
