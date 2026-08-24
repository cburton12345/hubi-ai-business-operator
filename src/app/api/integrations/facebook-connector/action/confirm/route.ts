import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { authenticateFacebookConnector, facebookActionConfirmationSchema } from "@/lib/growth/facebook-connector-protocol";
import { recordGrowthEvent, type GrowthEventType } from "@/lib/growth/growth-events";
import { applyIdentityHealthEvent } from "@/lib/growth/identity-health";

type CompletedAction = {
  id: string; brand_id: string; objective_id: string | null; opportunity_id: string | null;
  queue_id: string; action_key: string;
};

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:action:confirm");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });
  const parsed = facebookActionConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid action confirmation." }, { status: 400 });
  const success = parsed.data.outcome === "succeeded";
  const actionStatus = success ? "succeeded" : parsed.data.outcome === "canceled" ? "canceled" : parsed.data.outcome;
  const queueStatus = success ? "sent" : parsed.data.outcome === "canceled" ? "canceled" : parsed.data.outcome;
  const completed = await queryPostgres<CompletedAction>(`
    with updated_action as (
      update public.growth_action_attempts set status = $4, provider_reference = $5,
        failure_code = $6, failure_message = $7,
        result_json = result_json || $8::jsonb, completed_at = now()
      where tenant_id = $1 and identity_id = $2 and id = $3 and channel_key = 'facebook' and status = 'running'
      returning id, brand_id, objective_id, opportunity_id, queue_id, action_key
    ), updated_queue as (
      update public.outbound_action_queue q set status = $9, last_error = $7,
        processed_at = now(),
        metadata_json = q.metadata_json || jsonb_build_object('providerReference', $5::text, 'failureCode', $6::text),
        updated_at = now()
      from updated_action a where q.tenant_id = $1 and q.id = a.queue_id returning q.id
    ) select a.* from updated_action a join updated_queue q on q.id = a.queue_id
  `, [auth.tenant_id, auth.identity_id, parsed.data.actionId, actionStatus, parsed.data.providerReference ?? null,
    parsed.data.failureCode ?? null, parsed.data.failureMessage ?? null,
    JSON.stringify({ observedUrl: parsed.data.observedUrl, confirmedBy: "assisted_connector", requiresHumanConfirmation: true }), queueStatus]);
  const action = completed?.rows[0];
  if (!action) return NextResponse.json({ ok: false, error: "Action is not running or does not belong to this connector." }, { status: 409 });

  if (action.opportunity_id) {
    await queryPostgres(`update public.growth_opportunities set status = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [auth.tenant_id, action.opportunity_id, success ? "responded" : "blocked"]);
  }
  const eventType: GrowthEventType = success ? "publish_succeeded" : "publish_failed";
  await recordGrowthEvent({ tenantId: auth.tenant_id, brandId: action.brand_id, identityId: auth.identity_id,
    objectiveId: action.objective_id, opportunityId: action.opportunity_id, actionAttemptId: action.id,
    eventType, channelKey: "facebook", actionType: action.action_key, automationMode: "assisted_browser",
    outcome: parsed.data.outcome, failureReason: parsed.data.failureMessage,
    dimensions: { providerReference: parsed.data.providerReference, observedUrl: parsed.data.observedUrl },
    idempotencyKey: `facebook-action-confirmed:${action.id}:${parsed.data.outcome}` });
  await applyIdentityHealthEvent({ tenantId: auth.tenant_id, identityId: auth.identity_id,
    event: success ? "success" : "transient_failure", reason: parsed.data.failureMessage,
    providerCode: parsed.data.failureCode, idempotencyKey: `facebook-action-health:${action.id}:${parsed.data.outcome}` });
  return NextResponse.json({ ok: true, status: actionStatus }, { headers: { "Cache-Control": "no-store" } });
}
