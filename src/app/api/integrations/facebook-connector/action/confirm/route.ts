import { NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { authenticateFacebookConnector, facebookActionConfirmationSchema } from "@/lib/growth/facebook-connector-protocol";
import { recordGrowthEvent, type GrowthEventType } from "@/lib/growth/growth-events";
import { applyIdentityHealthEvent } from "@/lib/growth/identity-health";
import { recordMessageDeliveryReceipt } from "@/lib/messaging/message-health";

type CompletedAction = {
  id: string; brand_id: string; objective_id: string | null; opportunity_id: string | null;
  queue_id: string; action_key: string; conversation_id: string | null; body: string | null; recipient_label: string | null;
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
      from updated_action a where q.tenant_id = $1 and q.id = a.queue_id
      returning q.id,q.payload_json,q.recipient_label
    ) select a.*,o.conversation_id,q.payload_json->>'body' body,q.recipient_label
      from updated_action a join updated_queue q on q.id = a.queue_id
      left join public.growth_opportunities o on o.tenant_id=$1 and o.id=a.opportunity_id
  `, [auth.tenant_id, auth.identity_id, parsed.data.actionId, actionStatus, parsed.data.providerReference ?? null,
    parsed.data.failureCode ?? null, parsed.data.failureMessage ?? null,
    JSON.stringify({ observedUrl: parsed.data.observedUrl, confirmedBy: "assisted_connector", requiresHumanConfirmation: true }), queueStatus]);
  const action = completed?.rows[0];
  if (!action) return NextResponse.json({ ok: false, error: "Action is not running or does not belong to this connector." }, { status: 409 });

  if (action.opportunity_id) {
    await queryPostgres(`update public.growth_opportunities set status = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [auth.tenant_id, action.opportunity_id, success ? "responded" : "blocked"]);
  }
  const providerReference = parsed.data.providerReference || action.id;
  if (action.conversation_id && action.body) {
    await queryPostgres(`
      insert into public.messages (
        tenant_id,conversation_id,direction,channel,provider_key,provider_message_ref,
        to_value,subject,body,status,ai_generated,idempotency_key,metadata_json,sent_at,
        delivery_status,delivery_raw_status,delivery_safe_reason,delivery_final,delivery_updated_at
      ) values ($1,$2,'outbound','facebook_messenger','facebook',$3,$4,'Facebook reply',$5,$6,true,$7,$8::jsonb,
        case when $6='sent' then now() else null end,$9,$10,$11,$12,now())
      on conflict (tenant_id,idempotency_key) do update set
        provider_message_ref=excluded.provider_message_ref,status=excluded.status,
        delivery_status=excluded.delivery_status,delivery_raw_status=excluded.delivery_raw_status,
        delivery_safe_reason=excluded.delivery_safe_reason,delivery_final=excluded.delivery_final,
        delivery_updated_at=excluded.delivery_updated_at,metadata_json=public.messages.metadata_json || excluded.metadata_json
    `, [auth.tenant_id, action.conversation_id, providerReference, action.recipient_label, action.body,
      success ? "sent" : "failed", `facebook-action:${action.id}`, JSON.stringify({
        growthActionId: action.id, outboundQueueId: action.queue_id, observedUrl: parsed.data.observedUrl,
        confirmationSource: "ferocity_facebook_connector", deliveryEvidence: success ? "browser_send_confirmation" : "connector_failure"
      }), success ? "sent" : "failed", success ? "browser_send_confirmed" : parsed.data.outcome,
      success ? "Facebook accepted the browser action; a delivery or read receipt has not yet been observed." : parsed.data.failureMessage,
      !success]);
    await recordMessageDeliveryReceipt({
      tenantId: auth.tenant_id, providerKey: "facebook", providerMessageId: providerReference,
      providerEventId: `facebook-action-confirmed:${action.id}:${parsed.data.outcome}`,
      normalizedStatus: success ? "sent" : "failed", rawStatus: success ? "browser_send_confirmed" : parsed.data.outcome,
      errorCode: parsed.data.failureCode, safeReason: success
        ? "Facebook accepted the browser action; delivery remains unconfirmed."
        : parsed.data.failureMessage,
      isFinal: !success,
      metadata: { actionId: action.id, observedUrl: parsed.data.observedUrl, evidenceType: "browser_connector" }
    });
  }
  const eventType: GrowthEventType = success ? "publish_succeeded" : "publish_failed";
  await recordGrowthEvent({ tenantId: auth.tenant_id, brandId: action.brand_id, identityId: auth.identity_id,
    objectiveId: action.objective_id, opportunityId: action.opportunity_id, actionAttemptId: action.id,
    eventType, channelKey: "facebook", actionType: action.action_key, automationMode: "assisted_browser",
    outcome: parsed.data.outcome, failureReason: parsed.data.failureMessage,
    dimensions: { providerReference, observedUrl: parsed.data.observedUrl },
    idempotencyKey: `facebook-action-confirmed:${action.id}:${parsed.data.outcome}` });
  await applyIdentityHealthEvent({ tenantId: auth.tenant_id, identityId: auth.identity_id,
    event: success ? "success" : "transient_failure", reason: parsed.data.failureMessage,
    providerCode: parsed.data.failureCode, idempotencyKey: `facebook-action-health:${action.id}:${parsed.data.outcome}` });
  return NextResponse.json({ ok: true, status: actionStatus }, { headers: { "Cache-Control": "no-store" } });
}
