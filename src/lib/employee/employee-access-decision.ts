import type { PoolClient } from "pg";
import { employeeInviteEventId, employeeInviteLockKey } from "./employee-invite-identity";

type DecisionClient = Pick<PoolClient, "query">;

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  preferred_language: "en" | "es";
  status: "pending" | "approved" | "declined" | "spam";
};

export type EmployeeAccessDecisionResult =
  | { outcome: "not_pending" }
  | { outcome: "declined"; request: AccessRequest }
  | {
      outcome: "approved";
      request: AccessRequest;
      workerId: string;
      alreadyLinked: boolean;
      inviteRequired: boolean;
    };

export async function decideEmployeeAccessRequest(
  client: DecisionClient,
  input: {
    tenantId: string;
    requestId: string;
    decision: "approved" | "declined";
    ownerNote: string | null;
    reviewerUserId: string | null;
  }
): Promise<EmployeeAccessDecisionResult> {
  const locked = await client.query<AccessRequest>(
    `select id, name, email, phone, preferred_language, status
     from public.employee_access_requests
     where tenant_id = $1 and id = $2
     for update`,
    [input.tenantId, input.requestId]
  );
  const request = locked.rows[0];
  if (!request || request.status !== "pending") return { outcome: "not_pending" };

  if (input.decision === "declined") {
    const updated = await client.query(
      `update public.employee_access_requests
       set status = 'declined', owner_note = $3, reviewed_by_user_id = $4,
           reviewed_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2 and status = 'pending'`,
      [input.tenantId, request.id, input.ownerNote, input.reviewerUserId]
    );
    if (updated.rowCount !== 1) throw new Error("The employee access request changed during review.");
    await resolveOwnerEvent(client, input, request.id);
    await prepareDeliveryEvent(client, {
      tenantId: input.tenantId,
      externalEventId: `employee-access-decline-delivery-${request.id}`,
      eventType: "employee.decline_delivery_pending",
      title: `${request.name}'s decline notice is awaiting delivery`,
      summary: "The access request is declined. Ferocity has not yet confirmed delivery of the notice.",
      aiSummary: "No access was granted. The decline notice still needs a confirmed email outcome.",
      recommendedAction: "If delivery fails, contact the person directly about the declined request. Do not send an employee invite.",
      metadata: { accessRequestId: request.id, declineDelivery: "pending" }
    });
    return { outcome: "declined", request };
  }

  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    employeeInviteLockKey(input.tenantId, request.email)
  ]);

  const workerResult = await client.query<{ id: string; user_id: string | null }>(
    `with existing as (
       select id, user_id from public.operations_workers
       where tenant_id = $1 and lower(email) = lower($2) and availability_status <> 'inactive'
       order by updated_at desc limit 1
     ), inserted as (
       insert into public.operations_workers (
         tenant_id, name, role_type, phone, email, payroll_type, preferred_language, metadata_json
       )
       select $1,$3,'employee',$4,lower($2),'hourly',$5,$6::jsonb
       where not exists (select 1 from existing)
       returning id, user_id
     )
     select id, user_id from existing union all select id, user_id from inserted limit 1`,
    [
      input.tenantId,
      request.email,
      request.name,
      request.phone,
      request.preferred_language,
      JSON.stringify({ source: "employee_self_service", accessRequestId: request.id })
    ]
  );
  const worker = workerResult.rows[0];
  if (!worker) throw new Error("The employee record could not be prepared.");

  const inviteRequired = !worker.user_id;

  const updated = await client.query(
    `update public.employee_access_requests
     set status = 'approved', owner_note = $3, reviewed_by_user_id = $4, reviewed_at = now(),
         metadata_json = metadata_json || $5::jsonb, updated_at = now()
     where tenant_id = $1 and id = $2 and status = 'pending'`,
    [
      input.tenantId,
      request.id,
      input.ownerNote,
      input.reviewerUserId,
      JSON.stringify({ workerId: worker.id, alreadyLinked: Boolean(worker.user_id) })
    ]
  );
  if (updated.rowCount !== 1) throw new Error("The employee access request changed during review.");
  await resolveOwnerEvent(client, input, request.id);
  if (inviteRequired) {
    await prepareDeliveryEvent(client, {
      tenantId: input.tenantId,
      externalEventId: employeeInviteEventId(input.tenantId, request.email),
      eventType: "employee.invite_delivery_pending",
      title: `${request.name}'s secure employee invite is awaiting delivery`,
      summary: "Employee access was approved and the invite token was saved. Email delivery is not confirmed yet.",
      aiSummary: "The employee was approved, but invitation delivery is still pending.",
      recommendedAction: "Ferocity will attempt delivery. If this remains unresolved, review the employee in Workforce.",
      preserveSending: true,
      metadata: {
        workerId: worker.id,
        accessRequestId: request.id,
        inviteDelivery: "pending"
      }
    });
  }
  return {
    outcome: "approved",
    request,
    workerId: worker.id,
    alreadyLinked: Boolean(worker.user_id),
    inviteRequired
  };
}

async function prepareDeliveryEvent(
  client: DecisionClient,
  input: {
    tenantId: string;
    externalEventId: string;
    eventType: string;
    title: string;
    summary: string;
    aiSummary: string;
    recommendedAction: string;
    metadata: Record<string, unknown>;
    preserveSending?: boolean;
  }
) {
  if (input.preserveSending) {
    const current = await client.query<{ delivery_state: string | null }>(
      `select metadata_json->>'inviteDelivery' as delivery_state
       from public.owner_command_events
       where tenant_id=$1 and platform_key='ferocity-workforce' and external_event_id=$2
       limit 1`,
      [input.tenantId, input.externalEventId]
    );
    if (current.rows[0]?.delivery_state === "sending") return;
  }
  const result = await client.query(
    `insert into public.owner_command_events (
       tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
       severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
       action_href, risk_type, confidence_score, metadata_json
     ) values ($1,'ferocity-workforce','Ferocity Workforce',$2,$3,$4,$5,
       'high','needs_owner',true,false,$6,$7,'/app/operations-workforce','approval',100,$8::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update
     set event_type=excluded.event_type,title=excluded.title,summary=excluded.summary,
         severity='high',status='needs_owner',owner_attention=true,ai_handled=false,
         ai_summary=excluded.ai_summary,recommended_action=excluded.recommended_action,
         action_href=excluded.action_href,
         metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json,updated_at=now()
     returning id`,
    [
      input.tenantId,
      input.externalEventId,
      input.eventType,
      input.title,
      input.summary,
      input.aiSummary,
      input.recommendedAction,
      JSON.stringify(input.metadata)
    ]
  );
  if (result.rowCount !== 1) throw new Error("The delivery recovery state could not be prepared.");
}

async function resolveOwnerEvent(
  client: DecisionClient,
  input: { tenantId: string; decision: "approved" | "declined"; reviewerUserId: string | null },
  requestId: string
) {
  await client.query(
    `update public.owner_command_events
     set status = 'resolved', owner_attention = false, ai_handled = true,
         ai_summary = $3, metadata_json = metadata_json || $4::jsonb, updated_at = now()
     where tenant_id = $1 and platform_key = 'ferocity-workforce'
       and external_event_id = $2`,
    [
      input.tenantId,
      `employee-access-request-${requestId}`,
      input.decision === "approved"
        ? "An authorized user approved the request and Ferocity prepared secure employee access."
        : "An authorized user declined the request; no access was granted.",
      JSON.stringify({ decision: input.decision, reviewedByUserId: input.reviewerUserId })
    ]
  );
}
