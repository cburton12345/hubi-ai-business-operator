import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";

const schema = z.object({
  sendingEnabled: z.boolean().optional(), pairingEnabled: z.boolean().optional(),
  reason: z.string().trim().max(300).nullable().optional()
}).refine((value) => value.sendingEnabled !== undefined || value.pairingEnabled !== undefined || value.reason !== undefined);

export async function GET() {
  await requirePermission("platform:manage");
  const result = await queryPostgres(`select sending_enabled,pairing_enabled,reason,updated_by,updated_at from public.ferocity_connect_service_control where singleton=true`);
  return NextResponse.json({ ok: true, control: result?.rows[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("platform:manage");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid service control update." }, { status: 400 });
  const result = await queryPostgres(
    `update public.ferocity_connect_service_control set sending_enabled=coalesce($1,sending_enabled),
     pairing_enabled=coalesce($2,pairing_enabled),reason=case when $3::boolean then $4 else reason end,
     updated_by=$5,updated_at=now() where singleton=true
     returning sending_enabled,pairing_enabled,reason,updated_by,updated_at`,
    [parsed.data.sendingEnabled ?? null, parsed.data.pairingEnabled ?? null, parsed.data.reason !== undefined, parsed.data.reason ?? null, actor.email]
  );
  return NextResponse.json({ ok: true, control: result?.rows[0] ?? null });
}
