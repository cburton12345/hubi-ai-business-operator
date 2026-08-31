import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { queryPostgres } from "@/lib/db/postgres";
import { maskPhoneNumber } from "@/lib/ferocity-connect/crypto";

const simSchema = z.object({ subscriptionId: z.number().int(), slotIndex: z.number().int().nullable().optional(), carrierName: z.string().max(100).nullable().optional(), phoneNumber: z.string().max(32).nullable().optional(), countryIso: z.string().max(3).nullable().optional(), available: z.boolean().default(true) });
const schema = z.object({ appVersion: z.string().max(40), androidVersion: z.string().max(40), batteryPercent: z.number().int().min(0).max(100).nullable().optional(), charging: z.boolean().nullable().optional(), networkType: z.string().max(40).nullable().optional(), sims: z.array(simSchema).max(4) });

export async function POST(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid heartbeat." }, { status: 400 });
  const { identity } = auth;
  await queryPostgres(
    `update public.ferocity_connect_devices set app_version=$3,android_version=$4,battery_percent=$5,
       charging=$6,network_type=$7,last_heartbeat_at=now(),status=case when status='paired' then 'active' else status end,updated_at=now()
     where id=$1 and tenant_id=$2`,
    [identity.deviceId, identity.tenantId, parsed.data.appVersion, parsed.data.androidVersion, parsed.data.batteryPercent ?? null, parsed.data.charging ?? null, parsed.data.networkType ?? null]
  );
  for (const sim of parsed.data.sims) {
    await queryPostgres(
      `insert into public.ferocity_connect_sims (tenant_id,device_id,subscription_id,slot_index,carrier_name,phone_number_masked,country_iso,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (device_id,subscription_id) do update set
       slot_index=excluded.slot_index,carrier_name=excluded.carrier_name,phone_number_masked=excluded.phone_number_masked,
       country_iso=excluded.country_iso,status=excluded.status,last_seen_at=now()`,
      [identity.tenantId, identity.deviceId, sim.subscriptionId, sim.slotIndex ?? null, sim.carrierName ?? null,
        maskPhoneNumber(sim.phoneNumber), sim.countryIso ?? null, sim.available ? "available" : "unavailable"]
    );
  }
  return NextResponse.json({ ok: true, serverTime: new Date().toISOString(), sendingEnabled: identity.sendingEnabled && identity.deviceStatus !== "paused" });
}
