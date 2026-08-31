import { queryPostgres } from "@/lib/db/postgres";
import { hashOpaqueToken } from "./crypto";

export type ConnectDeviceIdentity = {
  credentialId: string;
  deviceId: string;
  tenantId: string;
  deviceStatus: "paired" | "active" | "paused" | "needs_attention";
  sendingEnabled: boolean;
};

export type DeviceAuthResult =
  | { ok: true; identity: ConnectDeviceIdentity }
  | { ok: false; status: number; error: string };

export async function authenticateConnectDevice(request: Request): Promise<DeviceAuthResult> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const nonce = request.headers.get("x-ferocity-device-nonce")?.trim();
  const timestampRaw = request.headers.get("x-ferocity-device-timestamp")?.trim();
  const timestamp = Number(timestampRaw);

  if (!token || token.length < 40 || !nonce || nonce.length < 16 || nonce.length > 160 || !timestampRaw) {
    return { ok: false, status: 401, error: "Device authentication is required." };
  }
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000) {
    return { ok: false, status: 401, error: "Device request timestamp is stale." };
  }

  const credential = await queryPostgres<{
    credential_id: string;
    device_id: string;
    tenant_id: string;
    device_status: ConnectDeviceIdentity["deviceStatus"];
    sending_enabled: boolean;
  }>(
    `select c.id credential_id,c.device_id,c.tenant_id,d.status device_status,control.sending_enabled
     from public.ferocity_connect_device_credentials c
     join public.ferocity_connect_devices d on d.id=c.device_id and d.tenant_id=c.tenant_id
     cross join public.ferocity_connect_service_control control
     where c.token_hash=$1 and c.revoked_at is null and c.expires_at > now()
       and d.status <> 'revoked' and control.singleton=true
     limit 1`,
    [hashOpaqueToken(token)]
  );
  const row = credential?.rows[0];
  if (!row) return { ok: false, status: 401, error: "Device credential is invalid or expired." };

  const replay = await queryPostgres<{ credential_id: string }>(
    `insert into public.ferocity_connect_request_nonces (credential_id,nonce_hash)
     values ($1,$2) on conflict do nothing returning credential_id`,
    [row.credential_id, hashOpaqueToken(nonce)]
  );
  if (!replay?.rows[0]) return { ok: false, status: 409, error: "Duplicate device request rejected." };

  await queryPostgres(`delete from public.ferocity_connect_request_nonces where created_at < now()-interval '1 day'`);
  await queryPostgres(
    `update public.ferocity_connect_device_credentials set last_used_at=now() where id=$1`,
    [row.credential_id]
  );
  return {
    ok: true,
    identity: {
      credentialId: row.credential_id,
      deviceId: row.device_id,
      tenantId: row.tenant_id,
      deviceStatus: row.device_status,
      sendingEnabled: row.sending_enabled
    }
  };
}
