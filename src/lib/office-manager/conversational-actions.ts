import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import {
  createOwnerConversationTask,
  callContactFromConversation,
  pauseAgentWorkflowFromConversation,
  rescheduleJobFromConversation,
  updateContactPreferenceFromConversation,
  updateDraftEstimateFromConversation
} from "@/lib/office-manager/conversational-action-executors";

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(500);

const sendMessageAction = z.object({
  type: z.literal("send_message"),
  channel: z.enum(["sms", "email"]),
  recipientType: z.enum(["customer", "lead"]),
  recipientId: uuid,
  message: z.string().trim().min(1).max(5_000),
  subject: z.string().trim().max(240).optional()
});

const callContactAction = z.object({
  type: z.literal("call_contact"),
  contactType: z.enum(["customer", "lead"]),
  contactId: uuid,
  purpose: shortText
});

const createTaskAction = z.object({
  type: z.literal("create_task"),
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(2_000),
  dueAt: z.string().datetime().optional(),
  targetType: z.string().trim().max(80).optional(),
  targetId: uuid.optional()
});

const approveActionRequest = z.object({
  type: z.literal("approve_action"),
  actionRequestId: uuid,
  reason: z.string().trim().max(1_000).optional()
});

const rejectActionRequest = z.object({
  type: z.literal("reject_action"),
  actionRequestId: uuid,
  reason: z.string().trim().max(1_000).optional()
});

const recordDecisionAction = z.object({
  type: z.literal("record_decision"),
  title: z.string().trim().min(1).max(180),
  decision: z.string().trim().min(1).max(2_000),
  permanence: z.enum(["one_time", "temporary", "permanent"]).default("one_time"),
  targetType: z.string().trim().max(80).optional(),
  targetId: uuid.optional()
});

const rescheduleJobAction = z.object({
  type: z.literal("reschedule_job"),
  jobId: uuid,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  notifyCustomer: z.boolean().default(true),
  notifyCrew: z.boolean().default(true)
});

const updateEstimateAction = z.object({
  type: z.literal("update_estimate"),
  estimateId: uuid,
  adjustmentPercent: z.number().min(-100).max(500),
  explanation: shortText
});

const pauseAutomationAction = z.object({
  type: z.literal("pause_automation"),
  workflowId: uuid,
  reason: shortText
});

const contactPreferenceAction = z.object({
  type: z.literal("update_contact_preference"),
  contactType: z.enum(["customer", "lead"]),
  contactId: uuid,
  preference: z.enum(["no_ai_calls", "no_marketing_sms", "human_only", "preferred_channel"]),
  value: z.union([z.boolean(), z.string().trim().max(80)])
});

export const conversationalActionSchema = z.discriminatedUnion("type", [
  sendMessageAction,
  callContactAction,
  createTaskAction,
  approveActionRequest,
  rejectActionRequest,
  recordDecisionAction,
  rescheduleJobAction,
  updateEstimateAction,
  pauseAutomationAction,
  contactPreferenceAction
]);

export type ConversationalAction = z.infer<typeof conversationalActionSchema>;
export type ConversationalRisk = "low" | "medium" | "high" | "prohibited";

export type ConversationalActionAssessment = {
  riskLevel: ConversationalRisk;
  requiresExplicitApproval: boolean;
  requiresSecondaryConfirmation: boolean;
  reversible: boolean;
  consequence: string;
};

export function conversationalActionNeedsStrongAuthentication(
  riskLevel: ConversationalRisk,
  trustLevel: "standard" | "strong"
) {
  return riskLevel !== "low" && trustLevel !== "strong";
}

export function assessConversationalAction(action: ConversationalAction): ConversationalActionAssessment {
  switch (action.type) {
    case "create_task":
    case "record_decision":
      return {
        riskLevel: "low",
        requiresExplicitApproval: false,
        requiresSecondaryConfirmation: false,
        reversible: true,
        consequence: "This records internal work without contacting anyone or changing money or schedules."
      };
    case "reject_action":
      return {
        riskLevel: "low",
        requiresExplicitApproval: true,
        requiresSecondaryConfirmation: false,
        reversible: true,
        consequence: "This stops the prepared action and records the owner's decision."
      };
    case "send_message":
    case "call_contact":
    case "update_contact_preference":
      return {
        riskLevel: "medium",
        requiresExplicitApproval: true,
        requiresSecondaryConfirmation: false,
        reversible: action.type === "update_contact_preference",
        consequence: action.type === "update_contact_preference"
          ? "This changes how Ferocity may contact this person."
          : "This contacts a person outside Ferocity and cannot be unsent."
      };
    case "approve_action":
    case "reschedule_job":
    case "update_estimate":
    case "pause_automation":
      return {
        riskLevel: "high",
        requiresExplicitApproval: true,
        requiresSecondaryConfirmation: true,
        reversible: action.type !== "approve_action",
        consequence: action.type === "reschedule_job"
          ? "This changes committed work and may notify the customer and assigned crew."
          : action.type === "update_estimate"
            ? "This changes customer-facing pricing."
            : action.type === "pause_automation"
              ? "This stops future automated work until someone resumes it."
              : "This authorizes a prepared action whose external effects depend on its type."
      };
  }
}

type AuthenticatedActionInput = {
  tenantId: string;
  brandId?: string | null;
  authSessionId: string;
  conversationSessionId?: string | null;
  providerKey?: string | null;
  providerSessionId?: string | null;
  idempotencyKey: string;
  originalInstruction: string;
  action: unknown;
  explicitApproval: boolean;
  secondaryConfirmation: boolean;
};

type AuthSessionRow = {
  id: string;
  user_id: string;
  trust_level: "standard" | "strong";
  conversation_session_id: string | null;
};

function officeManagerActionType(action: ConversationalAction) {
  if (action.type === "send_message") return "send_reminder";
  if (action.type === "call_contact") return "marketing_followup";
  if (action.type === "create_task") return "create_task";
  if (action.type === "reschedule_job") return "schedule_appointment";
  if (action.type === "update_estimate") return "create_estimate";
  if (action.type === "update_contact_preference") return "update_record";
  return "custom";
}

function actionTitle(action: ConversationalAction) {
  switch (action.type) {
    case "send_message": return `Send ${action.channel.toUpperCase()} from owner conversation`;
    case "call_contact": return "Call contact from owner conversation";
    case "create_task": return action.title;
    case "approve_action": return "Approve prepared Ferocity action";
    case "reject_action": return "Reject prepared Ferocity action";
    case "record_decision": return action.title;
    case "reschedule_job": return "Reschedule job from owner conversation";
    case "update_estimate": return "Update estimate from owner conversation";
    case "pause_automation": return "Pause automation from owner conversation";
    case "update_contact_preference": return "Update contact preference from owner conversation";
  }
}

function actionTarget(action: ConversationalAction) {
  switch (action.type) {
    case "send_message": return { type: action.recipientType, id: action.recipientId };
    case "call_contact": return { type: action.contactType, id: action.contactId };
    case "create_task": return { type: action.targetType ?? null, id: action.targetId ?? null };
    case "record_decision": return { type: action.targetType ?? null, id: action.targetId ?? null };
    case "approve_action":
    case "reject_action": return { type: "office_manager_action_request", id: action.actionRequestId };
    case "reschedule_job": return { type: "service_job", id: action.jobId };
    case "update_estimate": return { type: "service_estimate", id: action.estimateId };
    case "pause_automation": return { type: "ai_agent_workflow", id: action.workflowId };
    case "update_contact_preference": return { type: action.contactType, id: action.contactId };
  }
}

async function queueApprovedMessage(input: {
  tenantId: string;
  brandId: string | null;
  userId: string;
  eventId: string;
  action: z.infer<typeof sendMessageAction>;
}) {
  const table = input.action.recipientType === "customer" ? "customers" : "leads";
  const contact = await queryPostgres<{ destination: string | null }>(
    `select ${input.action.channel === "sms" ? "phone" : "email"} as destination
     from public.${table} where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.action.recipientId]
  );
  const destination = contact?.rows[0]?.destination?.trim();
  if (!destination) return { status: "blocked" as const, reason: `The ${input.action.channel} destination is missing.` };

  const allowed = await queryPostgres<{ policy_id: string; provider_key: string }>(
    `select p.id as policy_id,
       coalesce(r.default_provider_key, p.provider_key) as provider_key
     from public.live_action_policies p
     left join public.provider_routing_rules r
       on r.tenant_id=p.tenant_id and r.action_type=$2 and r.status='active'
     where p.tenant_id=$1 and p.action_key=$2 and p.status='live'
       and not exists (
         select 1 from public.contact_suppression_list s
         where s.tenant_id=p.tenant_id and s.channel=$3 and s.contact_value=$4 and s.active=true
       )
       and exists (
         select 1 from public.contact_consent_records c
         where c.tenant_id=p.tenant_id and c.channel=$3 and c.contact_value=$4 and c.status='granted'
       )
     limit 1`,
    [input.tenantId, input.action.channel === "sms" ? "sms_send" : "email_send", input.action.channel, destination]
  );
  const route = allowed?.rows[0];
  if (!route) {
    return { status: "needs_approval" as const, reason: "The provider, live-action policy, consent, or suppression check is not ready." };
  }

  const queued = await queryPostgres<{ id: string }>(
    `insert into public.outbound_action_queue (
       tenant_id, brand_id, action_type, provider_key, status, risk_level,
       target_type, target_id, subject, recipient_label, scheduled_for,
       payload_json, policy_id, approved_by_user_id, approved_at, metadata_json
     ) values ($1,$2,$3,$4,'approved','medium',$5,$6,$7,$8,now(),$9::jsonb,$10,$11,now(),$12::jsonb)
     returning id`,
    [
      input.tenantId,
      input.brandId,
      input.action.channel === "sms" ? "sms_send" : "email_send",
      route.provider_key,
      input.action.recipientType,
      input.action.recipientId,
      input.action.subject ?? "Owner-approved message",
      destination,
      JSON.stringify({ channel: input.action.channel, message: input.action.message, destination }),
      route.policy_id,
      input.userId,
      JSON.stringify({ source: "owner_conversation", conversationalActionEventId: input.eventId })
    ]
  );
  return queued?.rows[0]
    ? { status: "queued" as const, queueId: queued.rows[0].id }
    : { status: "failed" as const, reason: "The message could not be added to the guarded action queue." };
}

export async function recordAuthenticatedConversationalAction(input: AuthenticatedActionInput) {
  const parsed = conversationalActionSchema.safeParse(input.action);
  if (!parsed.success) {
    return { ok: false as const, status: "clarification_required" as const, message: "I need a clearer action before I can prepare or perform that." };
  }
  const action = parsed.data;
  const assessment = assessConversationalAction(action);
  const auth = await queryPostgres<AuthSessionRow>(
    `select s.id, s.user_id, s.trust_level, s.conversation_session_id
     from public.owner_conversation_auth_sessions s
     join public.tenant_users tu on tu.tenant_id=s.tenant_id and tu.user_id=s.user_id
     where s.tenant_id=$1 and s.id=$2 and s.status='verified' and s.expires_at>now()
       and tu.status='active' and tu.role in ('owner','admin','operator')
     limit 1`,
    [input.tenantId, input.authSessionId]
  );
  const session = auth?.rows[0];
  if (!session) {
    return { ok: false as const, status: "blocked" as const, message: "I cannot verify an authorized Ferocity user for this conversation." };
  }

  const existing = await queryPostgres<{ id: string; status: string; result_json: Record<string, unknown> }>(
    `select id,status,result_json from public.conversational_action_events
     where tenant_id=$1 and idempotency_key=$2 limit 1`,
    [input.tenantId, input.idempotencyKey]
  );
  if (existing?.rows[0]) {
    return { ok: true as const, status: existing.rows[0].status, eventId: existing.rows[0].id, duplicate: true, result: existing.rows[0].result_json };
  }

  const target = actionTarget(action);
  const missingStrongAuthentication = conversationalActionNeedsStrongAuthentication(assessment.riskLevel, session.trust_level);
  const missingApproval = assessment.requiresExplicitApproval && !input.explicitApproval;
  const missingSecondary = assessment.requiresSecondaryConfirmation && !input.secondaryConfirmation;
  const initialStatus = missingStrongAuthentication || missingApproval || missingSecondary ? "needs_approval" : "approved";
  const officeStatus = initialStatus === "approved" ? "approved" : "needs_review";
  const office = await queryPostgres<{ id: string }>(
    `insert into public.office_manager_action_requests (
       tenant_id, brand_id, session_id, action_type, status, priority, confidence_score,
       title, summary, recommended_action, target_table, target_id, idempotency_key,
       requires_owner, metadata_json
     ) values ($1,$2,$3,$4,$5,$6,90,$7,$8,$9,$10,$11,$12,true,$13::jsonb)
     on conflict (tenant_id,idempotency_key) do update set updated_at=now()
     returning id`,
    [
      input.tenantId,
      input.brandId ?? null,
      input.conversationSessionId ?? session.conversation_session_id,
      officeManagerActionType(action),
      officeStatus,
      assessment.riskLevel === "high" ? "high" : "normal",
      actionTitle(action),
      input.originalInstruction,
      assessment.consequence,
      target.type,
      target.id,
      `conversation:${input.idempotencyKey}`,
      JSON.stringify({ source: "owner_conversation", action, assessment })
    ]
  );

  const event = await queryPostgres<{ id: string }>(
    `insert into public.conversational_action_events (
       tenant_id,brand_id,user_id,conversation_session_id,auth_session_id,
       office_manager_action_request_id,action_type,original_instruction,
       interpreted_action_json,target_type,target_id,risk_level,approval_source,
       explicit_approval,secondary_confirmation,status,idempotency_key,provider_key,
       reversible,metadata_json
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
     returning id`,
    [
      input.tenantId, input.brandId ?? null, session.user_id,
      input.conversationSessionId ?? session.conversation_session_id, session.id,
      office?.rows[0]?.id ?? null, action.type, input.originalInstruction,
      JSON.stringify(action), target.type, target.id, assessment.riskLevel,
      input.explicitApproval ? "authenticated_owner_conversation" : null,
      input.explicitApproval, input.secondaryConfirmation, initialStatus,
      input.idempotencyKey, input.providerKey ?? null, assessment.reversible,
      JSON.stringify({ providerSessionId: input.providerSessionId ?? null, consequence: assessment.consequence })
    ]
  );
  const eventId = event?.rows[0]?.id;
  if (!eventId) return { ok: false as const, status: "failed" as const, message: "The instruction could not be recorded safely." };

  let finalStatus: "needs_approval" | "queued" | "completed" | "failed" = "needs_approval";
  let result: Record<string, unknown> = missingStrongAuthentication
    ? { message: assessment.consequence, next: "strong_authentication_required" }
    : missingSecondary
    ? { message: assessment.consequence, next: "secondary_confirmation_required" }
    : missingApproval
      ? { message: assessment.consequence, next: "explicit_approval_required" }
      : { message: "The instruction is recorded and prepared, but this action does not yet have a connected execution path.", next: "execution_path_required" };

  if (initialStatus === "approved" && action.type === "send_message") {
    const queued = await queueApprovedMessage({
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      userId: session.user_id,
      eventId,
      action
    });
    finalStatus = queued.status === "queued" ? "queued" : queued.status === "failed" ? "failed" : "needs_approval";
    result = queued;
  } else if (initialStatus === "approved" && (action.type === "approve_action" || action.type === "reject_action")) {
    const nextStatus = action.type === "approve_action" ? "approved" : "dismissed";
    const changed = await queryPostgres<{ id: string }>(
      `update public.office_manager_action_requests
       set status=$4, metadata_json=metadata_json || $5::jsonb, updated_at=now()
       where tenant_id=$1 and id=$2 and id<>coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         and status in ('draft','needs_review','blocked') returning id`,
      [input.tenantId, action.actionRequestId, office?.rows[0]?.id ?? null, nextStatus, JSON.stringify({ decidedByConversationEventId: eventId, decidedByUserId: session.user_id })]
    );
    finalStatus = changed?.rows[0] ? "completed" : "failed";
    result = changed?.rows[0] ? { actionRequestId: changed.rows[0].id, status: nextStatus } : { message: "That prepared action was not available to change." };
  } else if (initialStatus === "approved" && action.type === "record_decision") {
    await queryPostgres(
      `insert into public.office_manager_memory_facts (
         tenant_id,brand_id,source_session_id,fact_type,status,title,fact_text,sensitivity,expires_at,metadata_json
       ) values ($1,$2,$3,'owner_rule',$4,$5,$6,'internal',$7,$8::jsonb)`,
      [
        input.tenantId, input.brandId ?? null,
        input.conversationSessionId ?? session.conversation_session_id,
        action.permanence === "permanent" ? "active" : "needs_review",
        action.title, action.decision,
        action.permanence === "temporary" ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
        JSON.stringify({ source: "owner_conversation", conversationalActionEventId: eventId, permanence: action.permanence })
      ]
    );
    finalStatus = "completed";
    result = { message: "The owner decision was recorded in Ferocity memory.", permanence: action.permanence };
  } else if (initialStatus === "approved" && action.type === "create_task") {
    const executed = await createOwnerConversationTask({
      tenantId: input.tenantId,
      userId: session.user_id,
      title: action.title,
      detail: action.detail,
      dueAt: action.dueAt,
      targetType: action.targetType,
      targetId: action.targetId,
      eventId
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  } else if (initialStatus === "approved" && action.type === "pause_automation") {
    const executed = await pauseAgentWorkflowFromConversation({
      tenantId: input.tenantId,
      userId: session.user_id,
      workflowId: action.workflowId,
      reason: action.reason,
      eventId
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  } else if (initialStatus === "approved" && action.type === "update_contact_preference") {
    const executed = await updateContactPreferenceFromConversation({
      tenantId: input.tenantId,
      userId: session.user_id,
      contactType: action.contactType,
      contactId: action.contactId,
      preference: action.preference,
      value: action.value,
      eventId
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  } else if (initialStatus === "approved" && action.type === "update_estimate") {
    const executed = await updateDraftEstimateFromConversation({
      tenantId: input.tenantId,
      userId: session.user_id,
      estimateId: action.estimateId,
      adjustmentPercent: action.adjustmentPercent,
      explanation: action.explanation,
      eventId
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  } else if (initialStatus === "approved" && action.type === "reschedule_job") {
    const executed = await rescheduleJobFromConversation({
      tenantId: input.tenantId,
      userId: session.user_id,
      jobId: action.jobId,
      startsAt: action.startsAt,
      endsAt: action.endsAt,
      notifyCustomer: action.notifyCustomer,
      notifyCrew: action.notifyCrew,
      eventId
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  } else if (initialStatus === "approved" && action.type === "call_contact") {
    const executed = await callContactFromConversation({
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      userId: session.user_id,
      contactType: action.contactType,
      contactId: action.contactId,
      purpose: action.purpose,
      eventId,
      idempotencyKey: `conversation-call:${input.idempotencyKey}`
    });
    finalStatus = executed.ok ? "completed" : "failed";
    result = executed;
  }

  await queryPostgres(
    `update public.conversational_action_events
     set status=$3,result_json=$4::jsonb,error_message=$5,
       executed_at=case when $3 in ('queued','completed') then now() else null end,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, eventId, finalStatus, JSON.stringify(result), finalStatus === "failed" ? String(result.message ?? "Action failed") : null]
  );
  await queryPostgres(
    `update public.office_manager_action_requests
     set status=case when $3='completed' then 'completed' when $3='queued' then 'queued'
       when $3='failed' then 'failed' else status end,
       completed_at=case when $3='completed' then now() else null end,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, office?.rows[0]?.id ?? null, finalStatus]
  );
  await queryPostgres(
    `insert into public.operator_timeline_events (
       tenant_id,brand_id,event_family,event_type,title,body,primary_entity_type,
       primary_entity_id,source_table,source_id,metadata_json
     ) values ($1,$2,'ai','owner.conversational_action',$3,$4,$5,$6,
       'conversational_action_events',$7,$8::jsonb)`,
    [input.tenantId, input.brandId ?? null, actionTitle(action), input.originalInstruction, target.type, target.id, eventId, JSON.stringify({ status: finalStatus, riskLevel: assessment.riskLevel, userId: session.user_id })]
  );

  return {
    ok: finalStatus !== "failed",
    status: finalStatus,
    eventId,
    message: finalStatus === "needs_approval"
      ? missingStrongAuthentication || missingSecondary || missingApproval
        ? `${assessment.consequence} I need ${missingStrongAuthentication ? "fresh owner verification" : missingSecondary ? "a second confirmation" : "clear approval"} before continuing.`
        : String(result.message ?? "The action is prepared but not connected for execution yet.")
      : finalStatus === "queued"
        ? String(result.message ?? "Approved. The action is in Ferocity's guarded queue.")
        : finalStatus === "completed"
          ? "Done. The action and result are recorded in Ferocity."
          : "Ferocity recorded the instruction, but the action did not complete."
  };
}
