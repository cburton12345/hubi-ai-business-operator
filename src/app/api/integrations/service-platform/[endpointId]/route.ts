import { NextResponse } from "next/server";
import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { applyServicePlatformEvent, servicePlatformEventSchema, servicePlatformProviders, type ServicePlatformProvider } from "@/lib/integrations/service-platform-bridge";

function token(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : request.headers.get("x-ferocity-webhook-token")?.trim() ?? "";
}

export async function POST(request: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  const secret = token(request);
  if (!secret) return NextResponse.json({ ok: false, error: "Missing bridge token." }, { status: 401 });
  const endpointResult = await queryPostgres<{ id: string; tenant_id: string; provider_key: string; connection_id: string | null }>(
    `select e.id,e.tenant_id,e.provider_key,c.id as connection_id from public.webhook_endpoints e
     left join public.integration_connections c on c.tenant_id=e.tenant_id and c.provider=e.provider_key
     where e.id=$1 and e.inbound_token_hash=$2 and e.direction='inbound' and e.status='active' and e.connection_mode='middleware_bridge' limit 1`,
    [endpointId, hashSessionToken(secret)]
  );
  const endpoint = endpointResult?.rows[0];
  if (!endpoint || !servicePlatformProviders.includes(endpoint.provider_key as ServicePlatformProvider) || !endpoint.connection_id) {
    return NextResponse.json({ ok: false, error: "Bridge is not active." }, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 131_072) return NextResponse.json({ ok: false, error: "Event is too large." }, { status: 413 });
  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > 131_072) return NextResponse.json({ ok: false, error: "Event is too large." }, { status: 413 });
  const body = rawBody ? (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })() : null;
  const parsed = servicePlatformEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Event did not match the Ferocity coexistence contract." }, { status: 400 });
  const receipt = await queryPostgres<{ id: string }>(
    `insert into public.webhook_events (tenant_id,endpoint_id,event_type,external_event_id,payload_json,status)
     values ($1,$2,$3,$4,$5::jsonb,'queued')
     on conflict (endpoint_id,external_event_id) where endpoint_id is not null and external_event_id is not null
     do update set status='queued',last_error=null
       where public.webhook_events.status='failed'
     returning id`,
    [endpoint.tenant_id, endpoint.id, `${endpoint.provider_key}.${parsed.data.objectType}.${parsed.data.operation}`, parsed.data.eventId, JSON.stringify({ externalId: parsed.data.externalId, objectType: parsed.data.objectType, operation: parsed.data.operation })]
  );
  if (!receipt?.rows[0]) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const result = await applyServicePlatformEvent({ tenantId: endpoint.tenant_id, connectionId: endpoint.connection_id, providerKey: endpoint.provider_key as ServicePlatformProvider, event: parsed.data });
    await queryPostgres("update public.webhook_events set status='sent',delivered_at=now() where id=$1", [receipt.rows[0].id]);
    await queryPostgres("update public.webhook_endpoints set last_received_at=now(),updated_at=now() where id=$1", [endpoint.id]);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Bridge processing failed.";
    await queryPostgres("update public.webhook_events set status='failed',attempts=attempts+1,last_error=$2 where id=$1", [receipt.rows[0].id, message]);
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
