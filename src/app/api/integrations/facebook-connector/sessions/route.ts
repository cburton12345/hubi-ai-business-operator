import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const identitySchema = z.string().uuid();
const revokeSchema = z.object({ identityId: z.string().uuid(), sessionId: z.string().uuid() });

export async function GET(request: Request) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const identityId = new URL(request.url).searchParams.get("identityId") ?? "";
  if (!identitySchema.safeParse(identityId).success) {
    return NextResponse.json({ ok: false, error: "Invalid Facebook identity." }, { status: 400 });
  }
  await queryPostgres(`
    update public.growth_connector_sessions set status = 'expired'
    where tenant_id = $1 and identity_id = $2 and status = 'active' and expires_at <= now()
  `, [tenantId, identityId]);
  const result = await queryPostgres<{
    id: string; status: string; connector_version: string | null; issued_at: string; expires_at: string;
    last_seen_at: string | null; revoked_at: string | null; metadata_json: Record<string, unknown>;
  }>(`
    select id,status,connector_version,issued_at,expires_at,last_seen_at,revoked_at,metadata_json
    from public.growth_connector_sessions
    where tenant_id = $1 and identity_id = $2
    order by issued_at desc limit 20
  `, [tenantId, identityId]);
  const devices = (result?.rows ?? []).map((row) => ({
    id: row.id,
    name: typeof row.metadata_json?.deviceName === "string" ? row.metadata_json.deviceName : "Facebook browser connector",
    status: row.status,
    connectorVersion: row.connector_version,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at
  }));
  return NextResponse.json({ ok: true, devices }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  await requirePermission("tenant:manage");
  const tenantId = await getCurrentWorkspaceId();
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid connector session." }, { status: 400 });
  const result = await queryPostgres<{ id: string }>(`
    update public.growth_connector_sessions set status = 'revoked', revoked_at = now()
    where tenant_id = $1 and identity_id = $2 and id = $3 and status = 'active'
    returning id
  `, [tenantId, parsed.data.identityId, parsed.data.sessionId]);
  if (!result?.rows[0]) return NextResponse.json({ ok: false, error: "Active connector device not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
