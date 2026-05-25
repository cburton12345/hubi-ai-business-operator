import { NextResponse } from "next/server";
import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { logAppError } from "@/lib/observability/log-error";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return request.headers.get("x-ferocity-webhook-token")?.trim() ?? "";
}

export async function POST(request: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "Missing webhook token." }, { status: 401 });
  }

  const endpointResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    status: string;
    direction: string;
    event_types_json: string[] | null;
  }>(
    `
    select id, tenant_id, status, direction, event_types_json
    from public.webhook_endpoints
    where id = $1 and inbound_token_hash = $2
    limit 1
    `,
    [endpointId, hashSessionToken(token)]
  );
  const endpoint = endpointResult?.rows[0];

  if (!endpoint || endpoint.direction !== "inbound" || endpoint.status !== "active") {
    return NextResponse.json({ error: "Webhook endpoint is not active." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch (error) {
    await logAppError({
      source: "api.webhooks",
      tenantId: endpoint.tenant_id,
      message: "Invalid webhook JSON payload.",
      severity: "warning",
      metadata: { endpointId, error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const requestedEventType = typeof payload.event_type === "string" ? payload.event_type : "inbound.received";
  const allowedEventTypes = endpoint.event_types_json ?? [];
  const eventType = allowedEventTypes.length === 0 || allowedEventTypes.includes(requestedEventType)
    ? requestedEventType
    : "inbound.unmatched";

  await queryPostgres(
    `
    insert into public.webhook_events (
      tenant_id,
      endpoint_id,
      event_type,
      payload_json,
      status
    )
    values ($1, $2, $3, $4::jsonb, 'queued')
    `,
    [endpoint.tenant_id, endpoint.id, eventType, JSON.stringify(payload)]
  );

  await queryPostgres(
    "update public.webhook_endpoints set last_received_at = now(), updated_at = now() where id = $1",
    [endpoint.id]
  );

  return NextResponse.json({ ok: true, eventType });
}
