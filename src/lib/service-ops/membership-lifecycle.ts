import { withPostgresTransactionResult } from "@/lib/db/postgres";

export type MembershipStatus = "active" | "paused" | "canceled";

export function membershipTransitionAllowed(current: MembershipStatus, next: MembershipStatus) {
  if (current === next) return true;
  if (current === "canceled") return false;
  return next === "active" || next === "paused" || next === "canceled";
}

export type MembershipLifecycleResult = {
  status: "updated" | "existing" | "not_found" | "invalid_transition";
  planId: string;
  customerId: string | null;
  currentStatus: MembershipStatus | null;
};

export async function updateMembershipLifecycle(input: {
  tenantId: string;
  planId: string;
  nextStatus: MembershipStatus;
  idempotencyKey: string;
  cancellationReason?: string | null;
  renewsAt?: string | null;
}) {
  const transaction = await withPostgresTransactionResult<MembershipLifecycleResult>(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`membership:${input.tenantId}:${input.planId}`]);
    const currentResult = await client.query<{ customer_id: string; status: MembershipStatus; metadata_json: Record<string, unknown> | null }>(
      `select customer_id,status,coalesce(metadata_json,'{}'::jsonb) metadata_json
       from public.recurring_service_plans where tenant_id=$1 and id=$2 limit 1 for update`,
      [input.tenantId, input.planId]
    );
    const current = currentResult.rows[0];
    if (!current) return { status: "not_found", planId: input.planId, customerId: null, currentStatus: null };
    if (current.metadata_json?.lastLifecycleIdempotencyKey === input.idempotencyKey) {
      return { status: "existing", planId: input.planId, customerId: current.customer_id, currentStatus: current.status };
    }
    if (!membershipTransitionAllowed(current.status, input.nextStatus)) {
      return { status: "invalid_transition", planId: input.planId, customerId: current.customer_id, currentStatus: current.status };
    }

    await client.query(
      `update public.recurring_service_plans
       set status=$3,
         paused_at=case when $3='paused' then coalesce(paused_at,now()) when $3='active' then null else paused_at end,
         canceled_at=case when $3='canceled' then coalesce(canceled_at,now()) else canceled_at end,
         cancellation_reason=case when $3='canceled' then nullif($4,'') when $3='active' then null else cancellation_reason end,
         renews_at=coalesce($5::date,renews_at),
         billing_status=case when $3='canceled' then 'canceled' when $3='active' and billing_status='canceled' then 'manual' else billing_status end,
         ai_next_action=case
           when $3='active' then 'Confirm the next promised service date and create a visit when it is due.'
           when $3='paused' then 'Membership is paused. Do not generate visits or renewal activity until resumed.'
           else 'Membership is canceled. Preserve its service and billing history.' end,
         metadata_json=coalesce(metadata_json,'{}'::jsonb)||jsonb_build_object('lastLifecycleIdempotencyKey',$6,'lastLifecycleChangedAt',now()),
         updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, input.planId, input.nextStatus, input.cancellationReason ?? "", input.renewsAt ?? null, input.idempotencyKey]
    );
    await client.query(
      `insert into public.service_operating_events
         (tenant_id,customer_id,event_type,source_type,source_id,title,previous_state_json,next_state_json,metadata_json)
       values ($1,$2,'membership_status_changed','user',$3,$4,$5::jsonb,$6::jsonb,jsonb_build_object('idempotencyKey',$7))`,
      [
        input.tenantId,
        current.customer_id,
        input.planId,
        `Membership ${input.nextStatus}`,
        JSON.stringify({ status: current.status }),
        JSON.stringify({ status: input.nextStatus, renewsAt: input.renewsAt ?? null }),
        input.idempotencyKey
      ]
    );
    return { status: "updated", planId: input.planId, customerId: current.customer_id, currentStatus: input.nextStatus };
  });
  if (!transaction.ok) throw new Error("Ferocity could not update the membership safely.", { cause: transaction.error });
  return transaction.value;
}
