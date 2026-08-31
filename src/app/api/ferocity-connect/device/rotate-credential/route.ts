import { NextResponse } from "next/server";
import { authenticateConnectDevice } from "@/lib/ferocity-connect/device-auth";
import { withPostgresTransaction } from "@/lib/db/postgres";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/ferocity-connect/crypto";

export async function POST(request: Request) {
  const auth = await authenticateConnectDevice(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const token = createOpaqueToken("fcd");
  const rotated = await withPostgresTransaction(async (client) => {
    const result = await client.query<{ id: string; expires_at: string }>(
      `insert into public.ferocity_connect_device_credentials (tenant_id,device_id,token_prefix,token_hash,expires_at)
       values ($1,$2,$3,$4,now()+interval '30 days') returning id,expires_at`,
      [auth.identity.tenantId, auth.identity.deviceId, token.slice(0, 12), hashOpaqueToken(token)]
    );
    await client.query(`update public.ferocity_connect_device_credentials set revoked_at=now() where id=$1`, [auth.identity.credentialId]);
    await client.query(
      `insert into public.ferocity_connect_events (tenant_id,device_id,event_type,safe_detail)
       values ($1,$2,'credential_rotated','Device credential rotated.')`,
      [auth.identity.tenantId, auth.identity.deviceId]
    );
    return result.rows[0];
  });
  if (!rotated) return NextResponse.json({ ok: false, error: "Credential rotation failed." }, { status: 503 });
  return NextResponse.json({ ok: true, accessToken: token, expiresAt: rotated.expires_at }, { headers: { "Cache-Control": "no-store" } });
}
