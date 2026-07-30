import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import {
  canAccessEmployeeAssignment,
  getEmployeeAccessContext
} from "@/lib/employee/employee-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MediaRow = {
  assignment_id: string | null;
  worker_id: string | null;
  file_url: string | null;
};

function privateStorageLocation(value: string) {
  if (!value.startsWith("supabase://")) return null;
  const location = value.slice("supabase://".length);
  const separator = location.indexOf("/");
  if (separator < 1 || separator === location.length - 1) return null;
  return {
    bucket: location.slice(0, separator),
    path: location.slice(separator + 1)
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  const context = await getEmployeeAccessContext();
  const result = await queryPostgres<MediaRow>(
    `
    select assignment_id, worker_id, file_url
    from public.operations_field_media
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [context.tenantId, mediaId]
  );
  const media = result?.rows[0];
  if (!media?.file_url) return new NextResponse("File not found.", { status: 404 });

  const ownsMedia = Boolean(context.workerId && media.worker_id === context.workerId);
  const canAccessAssignment = Boolean(
    media.assignment_id &&
    (await canAccessEmployeeAssignment(context, media.assignment_id))
  );
  if (!context.canManageAll && !ownsMedia && !canAccessAssignment) {
    return new NextResponse("Not authorized.", { status: 403 });
  }

  const storage = privateStorageLocation(media.file_url);
  if (storage) {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return new NextResponse("Storage is not configured.", { status: 503 });
    const signed = await supabase.storage.from(storage.bucket).createSignedUrl(storage.path, 60 * 5);
    if (signed.error || !signed.data?.signedUrl) {
      return new NextResponse("File is temporarily unavailable.", { status: 503 });
    }
    return NextResponse.redirect(signed.data.signedUrl, 303);
  }

  try {
    const external = new URL(media.file_url);
    if (!["http:", "https:"].includes(external.protocol)) throw new Error("Unsupported protocol");
    return NextResponse.redirect(external, 303);
  } catch {
    return new NextResponse("File location is invalid.", { status: 400 });
  }
}
