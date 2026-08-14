import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ callId: string }> }) {
  await requirePermission("tenant:view");
  const [{ callId }, tenantId] = await Promise.all([params, getCurrentWorkspaceId()]);
  const result = await queryPostgres<{ storage_key: string | null }>(
    `select storage_key from public.receptionist_call_recordings
     where tenant_id=$1 and call_id=$2 and status='available'
       and consent_status in ('granted','not_required')
     order by updated_at desc limit 1`,
    [tenantId, callId]
  );
  const value = result?.rows[0]?.storage_key;
  if (!value) return NextResponse.json({ ok: false, error: "Recording is not available." }, { status: 404 });
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("unsupported_protocol");
    return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Recording storage is not available." }, { status: 404 });
  }
}
