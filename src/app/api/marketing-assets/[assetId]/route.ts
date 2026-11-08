import { authorizeApiPermission } from "@/lib/auth/api-permission";
import { queryPostgresRequired } from "@/lib/db/postgres";
import { authorizedManagedImageLocation, isBoundedUuid } from "@/lib/marketing-os/managed-image-asset-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const [{ assetId }, authorization] = await Promise.all([params, authorizeApiPermission("approval:review_high")]);
  if (!authorization.ok) return new Response(authorization.status === 401 ? "Authentication required." : "Permission denied.", { status: authorization.status });
  if (!isBoundedUuid(assetId)) return new Response("Asset not found.", { status: 404 });
  const tenantId = authorization.actor.workspace.id;
  const result = await queryPostgresRequired<{ storage_bucket: string | null; storage_path: string | null; job_id: string }>(
    `select a.storage_bucket,a.storage_path,j.id as job_id
     from public.marketing_media_assets a
     join public.marketing_graphic_jobs j on j.tenant_id=a.tenant_id and j.output_media_asset_id=a.id
     where a.tenant_id=$1 and a.id=$2 and a.status in ('needs_review','active')
       and j.job_type='image_ad' and j.status in ('generated','exported')
       and a.metadata_json->>'source'='managed_image_ad' and a.metadata_json->>'graphicJobId'=j.id::text
     limit 1`,
    [tenantId, assetId],
    "marketing-asset-private-review"
  );
  const asset = result.rows[0];
  const location = asset ? authorizedManagedImageLocation({ tenantId, assetId, jobId: asset.job_id, bucket: asset.storage_bucket, path: asset.storage_path }) : null;
  if (!location) return new Response("Asset not found.", { status: 404 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return new Response("Private media storage is unavailable.", { status: 503 });
  const signed = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 60 * 5, { download: false });
  if (signed.error || !signed.data.signedUrl) return new Response("Asset access could not be authorized.", { status: 502 });
  return Response.redirect(signed.data.signedUrl, 307);
}
