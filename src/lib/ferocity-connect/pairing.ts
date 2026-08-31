import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { createOpaqueToken, hashOpaqueToken, maskPhoneNumber } from "./crypto";

const pairingLifetimeMinutes = 10;
const credentialLifetimeDays = 30;

export async function issueConnectPairingToken(input: {
  tenantId: string;
  issuedByUserId?: string | null;
  displayNameHint?: string | null;
}) {
  const token = createOpaqueToken("fcp");
  const result = await queryPostgres<{ id: string; expires_at: string }>(
    `insert into public.ferocity_connect_pairing_tokens
      (tenant_id,token_hash,issued_by_user_id,display_name_hint,expires_at)
     select $1,$2,$3,$4,now()+($5::text || ' minutes')::interval
     from public.ferocity_connect_service_control where singleton=true and pairing_enabled=true
     returning id,expires_at`,
    [input.tenantId, hashOpaqueToken(token), input.issuedByUserId ?? null, input.displayNameHint ?? null, pairingLifetimeMinutes]
  );
  const row = result?.rows[0];
  return row ? { pairingToken: token, pairingId: row.id, expiresAt: row.expires_at } : null;
}

type SimInput = {
  subscriptionId: number;
  slotIndex?: number | null;
  carrierName?: string | null;
  phoneNumber?: string | null;
  countryIso?: string | null;
};

export async function pairConnectDevice(input: {
  pairingToken: string;
  displayName: string;
  installationFingerprint: string;
  appVersion: string;
  androidVersion: string;
  manufacturer?: string | null;
  model?: string | null;
  sims: SimInput[];
}) {
  const accessToken = createOpaqueToken("fcd");
  const tokenHash = hashOpaqueToken(input.pairingToken);
  const accessHash = hashOpaqueToken(accessToken);
  const fingerprintHash = hashOpaqueToken(input.installationFingerprint);

  const paired = await withPostgresTransaction(async (client) => {
    const pairing = await client.query<{ id: string; tenant_id: string; display_name_hint: string | null }>(
      `select p.id,p.tenant_id,p.display_name_hint
       from public.ferocity_connect_pairing_tokens p
       cross join public.ferocity_connect_service_control control
       where p.token_hash=$1 and p.consumed_at is null and p.expires_at>now()
         and control.singleton=true and control.pairing_enabled=true
       for update of p`,
      [tokenHash]
    );
    const claim = pairing.rows[0];
    if (!claim) return null;

    const entitlement = await client.query<{ allowed_devices: number; active_devices: number }>(
      `select
         1 + greatest(
           coalesce((select (metadata_json->>'additionalDeviceCount')::int
                     from public.tenant_messaging_accounts
                     where tenant_id=$1 and provider_key='ferocity_connect' and ownership_mode='customer_owned'
                     limit 1),0),
           coalesce((select sum(p.purchased_quantity)::int
                     from public.usage_bundle_purchases p
                     join public.usage_bundles b on b.id=p.bundle_id
                     where p.tenant_id=$1 and b.bundle_key='ferocity_connect_additional_device'
                       and p.status='active' and (p.expires_at is null or p.expires_at>now())),0)
         ) as allowed_devices,
         (select count(*)::int from public.ferocity_connect_devices
          where tenant_id=$1 and status <> 'revoked') as active_devices`,
      [claim.tenant_id]
    );
    const deviceAllowance = entitlement.rows[0] ?? { allowed_devices: 1, active_devices: 0 };
    if (deviceAllowance.active_devices >= deviceAllowance.allowed_devices) {
      throw new Error("FEROCITY_CONNECT_DEVICE_LIMIT_REACHED");
    }

    const hasAvailableSim = input.sims.length > 0;
    const device = await client.query<{ id: string }>(
      `insert into public.ferocity_connect_devices
        (tenant_id,display_name,status,app_version,android_version,manufacturer,model,installation_fingerprint_hash,last_heartbeat_at,default_sim_subscription_id)
       values ($1,$2,$8,$3,$4,$5,$6,$7,now(),$9) returning id`,
      [claim.tenant_id, input.displayName || claim.display_name_hint || "Android gateway", input.appVersion,
        input.androidVersion, input.manufacturer ?? null, input.model ?? null, fingerprintHash,
        hasAvailableSim ? "active" : "paired", input.sims[0]?.subscriptionId ?? null]
    );
    const deviceId = device.rows[0].id;
    await client.query(
      `update public.ferocity_connect_pairing_tokens set consumed_at=now(),consumed_by_device_id=$2 where id=$1`,
      [claim.id, deviceId]
    );
    const credential = await client.query<{ id: string; expires_at: string }>(
      `insert into public.ferocity_connect_device_credentials
        (tenant_id,device_id,token_prefix,token_hash,expires_at)
       values ($1,$2,$3,$4,now()+($5::text || ' days')::interval) returning id,expires_at`,
      [claim.tenant_id, deviceId, accessToken.slice(0, 12), accessHash, credentialLifetimeDays]
    );
    for (const sim of input.sims) {
      await client.query(
        `insert into public.ferocity_connect_sims
          (tenant_id,device_id,subscription_id,slot_index,carrier_name,phone_number_masked,country_iso,status)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (device_id,subscription_id) do update set slot_index=excluded.slot_index,
           carrier_name=excluded.carrier_name,phone_number_masked=excluded.phone_number_masked,
           country_iso=excluded.country_iso,last_seen_at=now()`,
        [claim.tenant_id, deviceId, sim.subscriptionId, sim.slotIndex ?? null, sim.carrierName ?? null,
          maskPhoneNumber(sim.phoneNumber), sim.countryIso ?? null,
          sim.subscriptionId === input.sims[0]?.subscriptionId ? "default" : "available"]
      );
    }
    await client.query(
      `insert into public.ferocity_connect_events (tenant_id,device_id,event_type,safe_detail)
       values ($1,$2,$3,$4)`,
      [claim.tenant_id, deviceId, hasAvailableSim ? "activated" : "paired",
        hasAvailableSim ? "Android gateway paired and activated with an available SIM." : "Android gateway paired; activation is waiting for an available SIM."]
    );
    await client.query(
      `update public.tenant_messaging_accounts set connection_status=$3,credentials_status='configured',
         live_sending_enabled=$4,inbound_enabled=true,outbound_enabled=$4,updated_at=now(),
         metadata_json=metadata_json || jsonb_build_object('pairedDeviceId',$2::text,'isDefault',$4)
       where tenant_id=$1 and provider_key='ferocity_connect' and ownership_mode='customer_owned'`,
      [claim.tenant_id, deviceId, hasAvailableSim ? "active" : "configured", hasAvailableSim]
    );
    return { tenantId: claim.tenant_id, deviceId, credentialId: credential.rows[0].id, expiresAt: credential.rows[0].expires_at };
  });
  return paired ? { ...paired, accessToken } : null;
}
