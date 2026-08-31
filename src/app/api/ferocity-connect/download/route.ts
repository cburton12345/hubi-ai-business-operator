import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ConnectRelease = {
  version_name: string;
  version_code: number;
  storage_bucket: string;
  storage_path: string;
  sha256: string;
};

export async function GET() {
  const actor = await requirePermission("tenant:view");
  const gate = await getServiceGate(actor.workspace.id, "sms_send");

  if (!gate.enabled) {
    return NextResponse.json(
      { error: gate.planAllowed ? "Ferocity Connect must be activated for this workspace before downloading." : "Your current plan does not include Ferocity Connect." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const result = await queryPostgres<ConnectRelease>(
    `select version_name,version_code,storage_bucket,storage_path,sha256
       from public.ferocity_connect_releases
      where status='published' and published_at is not null
      order by version_code desc
      limit 1`
  );
  const release = result?.rows[0];
  if (!release) {
    return NextResponse.json(
      { error: "The Ferocity Connect download is being prepared. No published release is available yet." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Secure release storage is not configured." }, { status: 503 });
  }

  const fileName = `Ferocity-Connect-${release.version_name}.apk`;
  const { data, error } = await supabase.storage
    .from(release.storage_bucket)
    .createSignedUrl(release.storage_path, 60, { download: fileName });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "The secure download could not be created." }, { status: 503 });
  }

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Ferocity-Connect-Version", String(release.version_code));
  response.headers.set("X-Ferocity-Connect-SHA256", release.sha256.toUpperCase());
  return response;
}

