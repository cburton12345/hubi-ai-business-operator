import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export async function GET() {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres(
    `select d.id,d.display_name,d.status,d.app_version,d.android_version,d.manufacturer,d.model,
       d.battery_percent,d.charging,d.network_type,d.last_heartbeat_at,d.last_success_at,d.consecutive_failures,
       coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.subscription_id,'slotIndex',s.slot_index,
         'carrierName',s.carrier_name,'phoneNumber',s.phone_number_masked,'status',s.status)
         order by s.slot_index) filter (where s.id is not null),'[]'::jsonb) sims
     from public.ferocity_connect_devices d left join public.ferocity_connect_sims s on s.device_id=d.id
     where d.tenant_id=$1 group by d.id order by d.created_at desc`,
    [tenantId]
  );
  const releaseResult = await queryPostgres<{ version_name: string; version_code: number; sha256: string }>(
    `select version_name,version_code,sha256 from public.ferocity_connect_releases
      where status='published' and published_at is not null order by version_code desc limit 1`
  );
  return NextResponse.json(
    { ok: true, devices: result?.rows ?? [], latestRelease: releaseResult?.rows[0] ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
