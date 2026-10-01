import { NextResponse } from "next/server";
import { authenticateFacebookConnector } from "@/lib/growth/facebook-connector-protocol";
import { queryPostgres } from "@/lib/db/postgres";

type PendingAction = { id: string; ready_at: string };

/**
 * Read-only wake signal for demand-started connector workers. It deliberately
 * does not claim work, reveal message contents, or change queue state.
 */
export async function POST(request: Request) {
  const auth = await authenticateFacebookConnector(request, "facebook:action:claim");
  if (!auth) return NextResponse.json({ ok: false, error: "Connector session is invalid or expired." }, { status: 401 });

  const pending = await queryPostgres<PendingAction>(`
    select a.id, coalesce(a.next_attempt_at, a.created_at)::text as ready_at
    from public.growth_action_attempts a
    join public.growth_distribution_identities i on i.id=a.identity_id and i.tenant_id=a.tenant_id
    join public.outbound_action_queue q on q.id=a.queue_id and q.tenant_id=a.tenant_id
    left join public.growth_communities c on c.id=a.community_id and c.tenant_id=a.tenant_id
    where a.tenant_id=$1 and a.identity_id=$2 and a.channel_key='facebook'
      and a.execution_mode='assisted_browser' and a.status='approved' and q.status='approved'
      and i.authorization_status='connected' and i.risk_state='healthy'
      and i.verification_status in ('verified','not_required')
      and (i.cooldown_until is null or i.cooldown_until <= now())
      and coalesce(a.next_attempt_at, now()) <= now()
      and (a.action_key <> 'publish_group_post' or (
        c.id is not null and c.status='active' and c.posting_policy in ('approval_required','autopilot_allowed')
        and nullif(trim(c.rules_text),'') is not null and c.rules_checked_at >= now() - interval '30 days'
        and coalesce(c.metadata_json->>'membershipState','unknown')='joined'
        and (c.last_posted_at is null or c.last_posted_at + make_interval(hours => coalesce((c.metadata_json->>'minimumHoursBetweenPosts')::int,72)) <= now())
        and not exists (
          select 1 from public.growth_action_attempts recent
          where recent.tenant_id=a.tenant_id and recent.identity_id=a.identity_id
            and recent.action_key='publish_group_post' and recent.status='succeeded'
            and recent.completed_at >= now() - interval '8 hours'
        )
      ))
      and (a.action_key <> 'request_group_join' or (
        c.id is not null and c.status='active'
        and coalesce(c.metadata_json->>'membershipState','unknown') in ('available','unknown')
      ))
      and exists (
        select 1 from public.growth_policies p
        where p.tenant_id=a.tenant_id and p.brand_id=a.brand_id and p.status='active' and p.rollout_stage >= 3
          and p.action_policy_json #>> '{facebook,assistedApprovedActions}' = 'true'
      )
    order by coalesce(a.next_attempt_at, a.created_at), a.created_at
    limit 1
  `, [auth.tenant_id, auth.identity_id]);

  const action = pending?.rows[0] ?? null;
  return NextResponse.json({
    ok: true,
    hasPendingAction: Boolean(action),
    pendingActionId: action?.id ?? null,
    readyAt: action?.ready_at ?? null
  }, { headers: { "Cache-Control": "no-store" } });
}
