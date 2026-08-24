import { NextResponse } from "next/server";
import { authenticateFacebookConnector } from "@/lib/growth/facebook-connector-protocol";
import { queryPostgres } from "@/lib/db/postgres";
import { recordGrowthEvent } from "@/lib/growth/growth-events";

type ClaimedAction = {
  id: string; brand_id: string; objective_id: string | null; opportunity_id: string | null;
  queue_id: string; action_key: string; payload_json: Record<string, unknown>;
  queue_payload: Record<string, unknown>; recipient_label: string | null;
};

export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:action:claim");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });

  const claimed = await queryPostgres<ClaimedAction>(`
    with eligible as (
      select a.id
      from public.growth_action_attempts a
      join public.growth_distribution_identities i on i.id = a.identity_id and i.tenant_id = a.tenant_id
      join public.outbound_action_queue q on q.id = a.queue_id and q.tenant_id = a.tenant_id
      where a.tenant_id = $1 and a.identity_id = $2 and a.channel_key = 'facebook'
        and a.execution_mode = 'assisted_browser' and a.status = 'approved' and q.status = 'approved'
        and i.authorization_status = 'connected' and i.risk_state = 'healthy'
        and i.verification_status in ('verified','not_required')
        and (i.cooldown_until is null or i.cooldown_until <= now())
        and coalesce(a.next_attempt_at, now()) <= now()
        and exists (
          select 1 from public.growth_policies p
          where p.tenant_id = a.tenant_id and p.brand_id = a.brand_id and p.status = 'active' and p.rollout_stage >= 3
            and p.action_policy_json #>> '{facebook,assistedApprovedActions}' = 'true'
        )
      order by a.created_at asc for update of a skip locked limit 1
    ), action_update as (
      update public.growth_action_attempts a set status = 'running', attempts = attempts + 1, started_at = now()
      from eligible e where a.id = e.id
      returning a.*
    ), queue_update as (
      update public.outbound_action_queue q set status = 'queued', updated_at = now()
      from action_update a where q.id = a.queue_id
      returning q.id, q.payload_json, q.recipient_label
    )
    select a.id, a.brand_id, a.objective_id, a.opportunity_id, a.queue_id, a.action_key,
      a.payload_json, q.payload_json as queue_payload, q.recipient_label
    from action_update a join queue_update q on q.id = a.queue_id
  `, [auth.tenant_id, auth.identity_id]);
  const action = claimed?.rows[0];
  if (!action) return NextResponse.json({ ok: true, action: null, message: "No approved Facebook action is ready." }, { headers: { "Cache-Control": "no-store" } });

  await recordGrowthEvent({ tenantId: auth.tenant_id, brandId: action.brand_id, identityId: auth.identity_id,
    objectiveId: action.objective_id, opportunityId: action.opportunity_id, actionAttemptId: action.id,
    eventType: "publish_attempted", channelKey: "facebook", actionType: action.action_key,
    automationMode: "assisted_browser", outcome: "claimed_by_connector",
    idempotencyKey: `facebook-action-claimed:${action.id}` });
  return NextResponse.json({
    ok: true,
    action: {
      id: action.id, actionKey: action.action_key, destination: action.recipient_label,
      sourceUrl: action.queue_payload.sourceUrl ?? null, body: action.queue_payload.body ?? null,
      requiresHumanConfirmation: true,
      instruction: "Open the legitimate destination, review the prepared text, complete the action, then confirm the actual outcome."
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
