import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authorizeApiPermission } from "@/lib/auth/api-permission";

export async function GET(_: Request, context: { params: Promise<{ documentId: string }> }) {
  const authorization = await authorizeApiPermission("lead:manage");
  if (!authorization.ok) {
    return NextResponse.json({ error: "Document unavailable" }, {
      status: authorization.status,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  const { documentId } = await context.params;
  const workspaceId = authorization.actor.workspace.id;
  const result = await queryPostgres<{ original_bucket: string; original_storage_path: string }>(`
    select original_bucket, original_storage_path from public.document_intelligence_documents
    where tenant_id = $1 and id = $2`, [workspaceId, documentId]);
  const document = result?.rows[0];
  const supabase = createSupabaseAdminClient();
  if (!document || !supabase) return NextResponse.json({ error: "Document unavailable" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const signed = await supabase.storage.from(document.original_bucket).createSignedUrl(document.original_storage_path, 60 * 5, { download: false });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Document unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.redirect(signed.data.signedUrl);
}
