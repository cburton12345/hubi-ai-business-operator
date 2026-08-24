import { createHash, randomBytes } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueGrowthConnectorSession(input: {
  tenantId: string; brandId: string; identityId: string; deviceId: string; scopes: string[];
  connectorVersion?: string; issuedByUserId?: string; lifetimeMinutes?: number;
}) {
  const token = randomBytes(32).toString("base64url");
  const lifetimeMinutes = Math.min(Math.max(input.lifetimeMinutes ?? 60, 5), 1440);
  await queryPostgres(`
    insert into public.growth_connector_sessions (
      tenant_id, brand_id, identity_id, device_id_hash, token_hash, scope_keys, connector_version,
      issued_by_user_id, expires_at, metadata_json
    ) values ($1,$2,$3,$4,$5,$6::text[],$7,$8,now() + ($9::text || ' minutes')::interval,
      '{"secretStorage":"hash_only","serviceRoleExposed":false}'::jsonb)
  `, [input.tenantId, input.brandId, input.identityId, hash(input.deviceId), hash(token), input.scopes,
    input.connectorVersion ?? null, input.issuedByUserId ?? null, String(lifetimeMinutes)]);
  return token;
}

export async function validateGrowthConnectorSession(input: { token: string; deviceId: string; requiredScope: string }) {
  const result = await queryPostgres<{ tenant_id: string; brand_id: string; identity_id: string }>(`
    update public.growth_connector_sessions set last_seen_at = now()
    where token_hash = $1 and device_id_hash = $2 and status = 'active' and expires_at > now()
      and $3 = any(scope_keys)
    returning tenant_id, brand_id, identity_id
  `, [hash(input.token), hash(input.deviceId), input.requiredScope]);
  return result?.rows[0] ?? null;
}

export async function revokeGrowthConnectorSession(input: { token: string; deviceId: string }) {
  const result = await queryPostgres(`
    update public.growth_connector_sessions set status = 'revoked', revoked_at = now()
    where token_hash = $1 and device_id_hash = $2 and status = 'active'
  `, [hash(input.token), hash(input.deviceId)]);
  return Boolean(result?.rowCount);
}
