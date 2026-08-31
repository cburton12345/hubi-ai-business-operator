import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const schema = z.object({ action: z.enum(["activate", "pause", "revoke"]), makeDefault: z.boolean().default(true) });

export async function PATCH(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  await requirePermission("tenant:manage");
  const [tenantId, { deviceId }] = await Promise.all([getCurrentWorkspaceId(), params]);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(deviceId).success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const nextStatus = parsed.data.action === "activate" ? "active" : parsed.data.action === "pause" ? "paused" : "revoked";
  const result = await queryPostgres<{ id: string }>(
    `update public.ferocity_connect_devices set status=$3,revoked_at=case when $3='revoked' then now() else revoked_at end,updated_at=now()
     where id=$1 and tenant_id=$2 and status<>'revoked'
       and ($3<>'active' or exists (select 1 from public.ferocity_connect_sims s where s.device_id=$1 and s.status in ('available','default')))
     returning id`,
    [deviceId, tenantId, nextStatus]
  );
  if (!result?.rows[0]) return NextResponse.json({ ok: false, error: "Device not found." }, { status: 404 });
  if (nextStatus === "revoked") {
    await queryPostgres(`update public.ferocity_connect_device_credentials set revoked_at=now() where device_id=$1 and tenant_id=$2 and revoked_at is null`, [deviceId, tenantId]);
  }
  if (nextStatus === "active") {
    if (parsed.data.makeDefault) {
      await queryPostgres(
        `update public.tenant_messaging_accounts set metadata_json=metadata_json-'isDefault',updated_at=now()
         where tenant_id=$1 and default_channel='sms' and provider_key<>'ferocity_connect'`,
        [tenantId]
      );
    }
    await queryPostgres(
      `update public.tenant_messaging_accounts set connection_status='active',credentials_status='configured',
       live_sending_enabled=true,inbound_enabled=true,outbound_enabled=true,
       metadata_json=metadata_json || jsonb_build_object('isDefault',$2::boolean),updated_at=now()
       where tenant_id=$1 and provider_key='ferocity_connect' and ownership_mode='customer_owned'`,
      [tenantId, parsed.data.makeDefault]
    );
  }
  await queryPostgres(
    `insert into public.ferocity_connect_events (tenant_id,device_id,event_type,safe_detail)
     values ($1,$2,$3,$4)`,
    [tenantId, deviceId, nextStatus === "revoked" ? "revoked" : nextStatus === "active" ? "activated" : "paused", `Device ${nextStatus} by workspace administrator.`]
  );
  return NextResponse.json({ ok: true, status: nextStatus });
}
