import { NextResponse } from "next/server";
import { hashSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { applyServicePlatformEvent, servicePlatformEventSchema, servicePlatformProviders, type ServicePlatformProvider } from "@/lib/integrations/service-platform-bridge";
import { captureIntegrationGoalObservation } from "@/lib/integrations/goal-observation";
import { safeLogAppError } from "@/lib/observability/log-error";

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
    try {
      const normalizedStatus = parsed.data.data.status?.toLowerCase().replaceAll(" ", "_") ?? "";
      const verifiedCompletedJob = parsed.data.objectType === "job" && ["completed", "closed", "done", "won"].includes(normalizedStatus);
      const goalStatus = verifiedCompletedJob ? "resolved" as const : "open" as const;
      const internalId = "internalId" in result && typeof result.internalId === "string" ? result.internalId : null;
      await captureIntegrationGoalObservation({
        tenantId: endpoint.tenant_id,
        platformKey: endpoint.provider_key,
        platformName: endpoint.provider_key.replaceAll("_", " "),
        externalEventId: parsed.data.eventId,
        eventType: `${endpoint.provider_key}.${parsed.data.objectType}.${parsed.data.operation}`,
        title: parsed.data.data.title || `${endpoint.provider_key.replaceAll("_", " ")} ${parsed.data.objectType} updated`,
        summary: parsed.data.data.message || `The connected service platform reported a ${parsed.data.objectType} ${parsed.data.operation}.`,
        severity: parsed.data.operation === "delete" ? "high" : "low",
        status: goalStatus,
        recommendedAction:
          parsed.data.objectType === "lead"
            ? "Qualify the lead and advance the next authorized follow-up."
            : parsed.data.objectType === "job" && !verifiedCompletedJob
              ? "Keep the job moving to a verified service outcome."
              : null,
        metadata: {
          connectionId: endpoint.connection_id,
          externalId: parsed.data.externalId,
          leadId: parsed.data.objectType === "lead" ? internalId : null,
          jobId: parsed.data.objectType === "job" ? internalId : null,
          authoritativeOutcomeVerified: verifiedCompletedJob,
          outcomeEvidence: verifiedCompletedJob
            ? { internalJobId: internalId, externalJobId: parsed.data.externalId, providerStatus: parsed.data.data.status }
            : null,
        },
      });
    } catch (goalError) {
      await safeLogAppError({
        tenantId: endpoint.tenant_id,
        source: "api.integrations.service-platform.goal-observation",
        message: goalError instanceof Error ? goalError.message : "Service-platform goal observation failed.",
        severity: "warning",
        retryable: true,
        metadata: { endpointId: endpoint.id, providerKey: endpoint.provider_key, eventId: parsed.data.eventId },
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Bridge processing failed.";
    await queryPostgres("update public.webhook_events set status='failed',attempts=attempts+1,last_error=$2 where id=$1", [receipt.rows[0].id, message]);
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
