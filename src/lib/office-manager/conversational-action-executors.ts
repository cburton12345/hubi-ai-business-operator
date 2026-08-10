import crypto from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { getVoiceAgentProvider } from "@/lib/providers/voice-adapters";
import { ProviderBackedVoiceAgent } from "@/lib/phone/voice-agent";
import { composeOutboundCallVariables, prepareOutboundCallVariables } from "@/lib/phone/outbound-call-context";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import {
  defaultContactCommunicationPreference,
  getContactCommunicationPreference,
  type ContactCommunicationPreference
} from "@/lib/preferences/contact-communication-preferences";
import { saveScopedPreference } from "@/lib/preferences/saved-preferences";

export async function createOwnerConversationTask(input: {
  tenantId: string;
  userId: string;
  title: string;
  detail: string;
  dueAt?: string;
  targetType?: string;
  targetId?: string;
  eventId: string;
}) {
  const created = await queryPostgres<{ id: string }>(
    `insert into public.personal_ops_items (
       tenant_id,owner_user_id,category,title,notes,status,priority,owner_attention,
       due_at,recommended_action,metadata_json
     ) values ($1,$2,'today',$3,$4,'open','normal',true,$5,$6,$7::jsonb)
     returning id`,
    [
      input.tenantId, input.userId, input.title, input.detail, input.dueAt ?? null,
      input.detail,
      JSON.stringify({
        source: "owner_conversation",
        conversationalActionEventId: input.eventId,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null
      })
    ]
  );
  return created?.rows[0]
    ? { ok: true as const, taskId: created.rows[0].id, message: "The task is in your Ferocity task list." }
    : { ok: false as const, message: "Ferocity could not create the task." };
}

export async function pauseAgentWorkflowFromConversation(input: {
  tenantId: string;
  userId: string;
  workflowId: string;
  reason: string;
  eventId: string;
}) {
  const changed = await queryPostgres<{ id: string; agent_name: string }>(
    `update public.ai_agent_workflows
     set status='paused',next_run_at=null,
         metadata_json=metadata_json || $3::jsonb,updated_at=now()
     where tenant_id=$1 and id=$2 and status in ('active','draft')
     returning id,agent_name`,
    [input.tenantId, input.workflowId, JSON.stringify({
      pausedByUserId: input.userId,
      pausedByConversationEventId: input.eventId,
      pauseReason: input.reason,
      pausedAt: new Date().toISOString()
    })]
  );
  return changed?.rows[0]
    ? { ok: true as const, workflowId: changed.rows[0].id, workflowName: changed.rows[0].agent_name, message: `${changed.rows[0].agent_name} is paused.` }
    : { ok: false as const, message: "That workflow is missing, archived, or already paused." };
}

type ContactPreferenceName = "no_ai_calls" | "no_marketing_sms" | "human_only" | "preferred_channel";

function nextContactPreference(
  current: ContactCommunicationPreference,
  preference: ContactPreferenceName,
  value: boolean | string
): ContactCommunicationPreference | null {
  if (preference === "no_ai_calls" && typeof value === "boolean") return { ...current, noAiCalls: value };
  if (preference === "no_marketing_sms" && typeof value === "boolean") return { ...current, noMarketingTexts: value };
  if (preference === "human_only" && value === true) {
    return { ...current, noAiCalls: true, preferredMethod: "human_call" };
  }
  if (preference === "preferred_channel" && typeof value === "string") {
    const method = value as ContactCommunicationPreference["preferredMethod"];
    if (["automatic_sms","native_sms","google_voice","email","ai_voice_call","human_call"].includes(method)) {
      return { ...current, preferredMethod: method };
    }
  }
  return null;
}

export async function updateContactPreferenceFromConversation(input: {
  tenantId: string;
  userId: string;
  contactType: "customer" | "lead";
  contactId: string;
  preference: ContactPreferenceName;
  value: boolean | string;
  eventId: string;
}) {
  const table = input.contactType === "customer" ? "customers" : "leads";
  const exists = await queryPostgres<{ id: string }>(
    `select id from public.${table} where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.contactId]
  );
  if (!exists?.rows[0]) return { ok: false as const, message: "That contact was not found in this workspace." };

  const contactKey = `${input.contactType}:${input.contactId}`;
  const current = await getContactCommunicationPreference(input.tenantId, contactKey)
    .catch(() => defaultContactCommunicationPreference);
  const value = nextContactPreference(current, input.preference, input.value);
  if (!value) return { ok: false as const, message: "That contact preference needs a clearer supported value." };
  await saveScopedPreference({
    tenantId: input.tenantId,
    domain: "communication",
    key: "contact_profile",
    scope: { type: "contact", key: contactKey },
    value,
    userId: input.userId,
    metadata: {
      source: "owner_conversation",
      conversationalActionEventId: input.eventId,
      changedInline: true
    }
  });
  return { ok: true as const, contactKey, preference: input.preference, message: "The contact preference is saved." };
}

export function adjustedCents(value: number, adjustmentPercent: number) {
  return Math.max(0, Math.round(value * (1 + adjustmentPercent / 100)));
}

export async function updateDraftEstimateFromConversation(input: {
  tenantId: string;
  userId: string;
  estimateId: string;
  adjustmentPercent: number;
  explanation: string;
  eventId: string;
}) {
  const estimate = await queryPostgres<{ id: string; status: string; total_cents: number }>(
    `select id,status,total_cents from public.service_estimates
     where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.estimateId]
  );
  const row = estimate?.rows[0];
  if (!row) return { ok: false as const, message: "That estimate was not found in this workspace." };
  if (row.status !== "draft") {
    return { ok: false as const, message: "Only a draft estimate can be repriced directly. Create a revision for a sent or approved estimate." };
  }

  await queryPostgres(
    `update public.estimate_line_items
     set unit_price_cents=greatest(0,round(unit_price_cents*(1+$3::numeric/100))::integer),
         total_cents=greatest(0,round(total_cents*(1+$3::numeric/100))::integer)
     where tenant_id=$1 and estimate_id=$2 and selected=true`,
    [input.tenantId, input.estimateId, input.adjustmentPercent]
  );
  const changed = await queryPostgres<{ id: string; total_cents: number }>(
    `update public.service_estimates e
     set subtotal_cents=totals.subtotal,
         total_cents=greatest(0,totals.subtotal-e.discount_cents+e.tax_cents),
         internal_notes=concat_ws(E'\n',nullif(e.internal_notes,''),$3),
         updated_at=now()
     from (
       select coalesce(sum(total_cents),0)::integer as subtotal
       from public.estimate_line_items where tenant_id=$1 and estimate_id=$2 and selected=true
     ) totals
     where e.tenant_id=$1 and e.id=$2
     returning e.id,e.total_cents`,
    [input.tenantId, input.estimateId,
      `Owner conversation: ${input.adjustmentPercent}% adjustment. ${input.explanation}`]
  );
  const updated = changed?.rows[0];
  return updated
    ? {
        ok: true as const,
        estimateId: updated.id,
        previousTotalCents: row.total_cents,
        totalCents: updated.total_cents,
        adjustmentPercent: input.adjustmentPercent,
        eventId: input.eventId,
        userId: input.userId,
        message: "The draft estimate pricing is updated."
      }
    : { ok: false as const, message: "The estimate could not be updated." };
}

export function validScheduleWindow(startsAt: string, endsAt?: string) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  return Number.isFinite(start.getTime()) && (!end || (Number.isFinite(end.getTime()) && end > start));
}

export async function rescheduleJobFromConversation(input: {
  tenantId: string;
  userId: string;
  jobId: string;
  startsAt: string;
  endsAt?: string;
  notifyCustomer: boolean;
  notifyCrew: boolean;
  eventId: string;
}) {
  if (!validScheduleWindow(input.startsAt, input.endsAt)) {
    return { ok: false as const, message: "The new schedule needs a valid start and an end after the start." };
  }
  const start = new Date(input.startsAt).toISOString();
  const end = input.endsAt ? new Date(input.endsAt).toISOString() : null;
  const result = await withPostgresTransaction(async (client) => {
    const job = await client.query<{
      id: string; title: string; status: string; customer_id: string; customer_name: string;
      customer_phone: string | null; assigned_user_id: string | null;
    }>(
      `select j.id,j.title,j.status,j.customer_id,c.name as customer_name,c.phone as customer_phone,j.assigned_user_id
       from public.service_jobs j join public.customers c on c.tenant_id=j.tenant_id and c.id=j.customer_id
       where j.tenant_id=$1 and j.id=$2 for update`,
      [input.tenantId, input.jobId]
    );
    const row = job.rows[0];
    if (!row) throw new Error("job_missing");
    if (["completed", "canceled", "lost"].includes(row.status)) throw new Error("job_locked");

    const visits = await client.query<{ id: string; scheduled_start: string | null; scheduled_end: string | null }>(
      `select id,scheduled_start,scheduled_end from public.service_visits
       where tenant_id=$1 and service_job_id=$2 and status not in ('completed','canceled','no_show')
       order by visit_number asc for update`,
      [input.tenantId, input.jobId]
    );
    if (visits.rows.length > 1) throw new Error("multiple_active_visits");
    const visit = visits.rows[0] ?? null;
    const previousStart = visit?.scheduled_start ?? null;
    const previousEnd = visit?.scheduled_end ?? null;

    await client.query(
      `update public.service_jobs set scheduled_start=$3,scheduled_end=$4,status='scheduled',
         dispatcher_notes=concat_ws(E'\n',nullif(dispatcher_notes,''),$5),updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, input.jobId, start, end, `Owner conversation rescheduled this job. Event ${input.eventId}.`]
    );
    if (visit) {
      await client.query(
        `update public.service_visits set scheduled_start=$3,scheduled_end=$4,
           arrival_window_start=$3,arrival_window_end=coalesce($4,$3::timestamptz + interval '2 hours'),
           status=case when status in ('unscheduled','tentative','scheduled','confirmed') then 'scheduled' else status end,
           metadata_json=metadata_json || $5::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2`,
        [input.tenantId, visit.id, start, end, JSON.stringify({ rescheduledByConversationEventId: input.eventId, rescheduledByUserId: input.userId })]
      );
    }
    await client.query(
      `update public.operations_assignments set scheduled_start=$3,scheduled_end=$4,
         metadata_json=metadata_json || $5::jsonb,updated_at=now()
       where tenant_id=$1 and service_job_id=$2 and status not in ('completed','archived')`,
      [input.tenantId, input.jobId, start, end, JSON.stringify({ rescheduledByConversationEventId: input.eventId })]
    );

    let customerQueueId: string | null = null;
    if (input.notifyCustomer) {
      const phone = row.customer_phone?.trim();
      if (!phone) throw new Error("customer_phone_missing");
      const route = await client.query<{ policy_id: string; provider_key: string }>(
        `select p.id as policy_id,coalesce(r.default_provider_key,p.provider_key) as provider_key
         from public.live_action_policies p
         left join public.provider_routing_rules r on r.tenant_id=p.tenant_id and r.action_type='sms_send' and r.status='active'
         where p.tenant_id=$1 and p.action_key='sms_send' and p.status='live'
           and exists (select 1 from public.contact_consent_records c where c.tenant_id=p.tenant_id and c.channel='sms' and lower(c.contact_value)=lower($2) and c.status='granted')
           and not exists (select 1 from public.contact_suppression_list s where s.tenant_id=p.tenant_id and s.channel='sms' and lower(s.contact_value)=lower($2) and s.active=true)
         limit 1`,
        [input.tenantId, phone]
      );
      if (!route.rows[0]) throw new Error("customer_notification_not_authorized");
      const queued = await client.query<{ id: string }>(
        `insert into public.outbound_action_queue (
           tenant_id,action_type,provider_key,status,risk_level,target_type,target_id,subject,
           recipient_label,scheduled_for,payload_json,policy_id,approved_by_user_id,approved_at,metadata_json
         ) values ($1,'sms_send',$2,'approved','medium','customer',$3,'Schedule update',$4,now(),$5::jsonb,$6,$7,now(),$8::jsonb)
         returning id`,
        [input.tenantId, route.rows[0].provider_key, row.customer_id, phone,
          JSON.stringify({ channel: "sms", destination: phone, message: `Your ${row.title} appointment has been moved to ${new Date(start).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" })}. Reply if this no longer works for you.` }),
          route.rows[0].policy_id, input.userId,
          JSON.stringify({ source: "owner_conversation_reschedule", conversationalActionEventId: input.eventId, serviceJobId: input.jobId })]
      );
      customerQueueId = queued.rows[0]?.id ?? null;
      if (!customerQueueId) throw new Error("customer_notification_queue_failed");
    }
    return { row, visitId: visit?.id ?? null, previousStart, previousEnd, customerQueueId };
  });

  if (!result) {
    return { ok: false as const, message: "The schedule was not changed. Ferocity could not safely update every required record and notification." };
  }
  let crewNotification = { sent: 0, failed: 0, skipped: true };
  if (input.notifyCrew) {
    const workers = await queryPostgres<{ user_id: string }>(
      `select distinct w.user_id from public.operations_assignments a
       left join public.operations_workers w on w.tenant_id=a.tenant_id and w.id=a.worker_id
       where a.tenant_id=$1 and a.service_job_id=$2 and w.user_id is not null and a.status not in ('completed','archived')`,
      [input.tenantId, input.jobId]
    );
    const recipients = new Set((workers?.rows ?? []).map((row) => row.user_id));
    if (result.row.assigned_user_id) recipients.add(result.row.assigned_user_id);
    const outcomes = await Promise.all([...recipients].map((recipientUserId) => sendWorkspacePushNotifications({
      tenantId: input.tenantId,
      recipientUserId,
      eventType: "service_job_rescheduled",
      title: "Job schedule changed",
      body: `${result.row.title} is now scheduled for ${new Date(start).toLocaleString()}.`,
      url: `/app/service/jobs/${input.jobId}`,
      metadata: { serviceJobId: input.jobId, conversationalActionEventId: input.eventId }
    })));
    crewNotification = {
      sent: outcomes.reduce((sum, value) => sum + value.sent, 0),
      failed: outcomes.reduce((sum, value) => sum + value.failed, 0),
      skipped: outcomes.length === 0 || outcomes.every((value) => value.skipped)
    };
  }
  return {
    ok: true as const,
    jobId: input.jobId,
    visitId: result.visitId,
    previousStart: result.previousStart,
    previousEnd: result.previousEnd,
    startsAt: start,
    endsAt: end,
    customerNotificationQueueId: result.customerQueueId,
    crewNotification,
    message: input.notifyCrew && crewNotification.sent === 0
      ? "The job was rescheduled and the customer update was prepared. No crew device accepted a push, so the schedule remains visible in Ferocity."
      : "The job, field visit, dispatch assignment, and requested notifications were updated."
  };
}

export async function callContactFromConversation(input: {
  tenantId: string;
  brandId?: string | null;
  userId: string;
  contactType: "customer" | "lead";
  contactId: string;
  purpose: string;
  eventId: string;
  idempotencyKey: string;
}) {
  const table = input.contactType === "customer" ? "customers" : "leads";
  const contact = await queryPostgres<{ id: string; name: string; phone: string | null }>(
    `select id,name,phone from public.${table} where tenant_id=$1 and id=$2 limit 1`,
    [input.tenantId, input.contactId]
  );
  const row = contact?.rows[0];
  const phone = row?.phone?.trim();
  if (!row || !phone) return { ok: false as const, message: "That contact does not have a callable phone number." };
  const preference = await getContactCommunicationPreference(input.tenantId, `${input.contactType}:${input.contactId}`)
    .catch(() => defaultContactCommunicationPreference);
  if (preference.noAiCalls || preference.preferredMethod === "human_call") {
    return { ok: false as const, message: "This contact's saved preference does not allow an AI call." };
  }
  const authorization = await queryPostgres<{ provider_key: string; assistant_id: string | null }>(
    `select coalesce(r.default_provider_key,p.provider_key) as provider_key,
       nullif(a.metadata_json->>'outboundAssistantId','') as assistant_id
     from public.live_action_policies p
     left join public.provider_routing_rules r on r.tenant_id=p.tenant_id and r.action_type='voice_call' and r.status='active'
     join public.provider_accounts a on a.tenant_id=p.tenant_id
       and a.provider_key=coalesce(r.default_provider_key,p.provider_key)
       and a.status='connected' and a.credentials_status='configured' and a.live_actions_enabled=true
     where p.tenant_id=$1 and p.action_key='voice_call' and p.status='live'
       and exists (select 1 from public.contact_consent_records c where c.tenant_id=p.tenant_id and c.channel='phone' and lower(c.contact_value)=lower($2) and c.status='granted')
       and not exists (select 1 from public.contact_suppression_list s where s.tenant_id=p.tenant_id and s.channel='phone' and lower(s.contact_value)=lower($2) and s.active=true)
     limit 1`,
    [input.tenantId, phone]
  );
  const route = authorization?.rows[0];
  if (!route) return { ok: false as const, message: "The live voice route, contact consent, provider, or suppression check is not ready." };
  if (!route.assistant_id) {
    return { ok: false as const, message: "A customer-facing outbound voice agent has not been provisioned. Ferocity will not use the private owner agent or inbound receptionist for this call." };
  }
  const provider = getVoiceAgentProvider(route.provider_key);
  if (!provider || provider.adapterStatus !== "live") return { ok: false as const, message: "The selected voice provider adapter is not live." };
  const context = {
    tenantId: input.tenantId,
    brandId: input.brandId ?? null,
    correlationId: crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey,
    liveActionsEnabled: true,
    purpose: "production" as const
  };
  const connection = await provider.getConnection(context, true);
  if (!connection.ok) return { ok: false as const, message: connection.safeMessage };
  const voice = new ProviderBackedVoiceAgent(provider);
  const callVariables = await prepareOutboundCallVariables({
    tenantId: input.tenantId,
    brandId: input.brandId,
    contactType: input.contactType,
    contactId: input.contactId,
    callPurpose: input.purpose
  }).catch(() => null) ?? composeOutboundCallVariables({
    contactName: row.name,
    contactType: input.contactType,
    callPurpose: input.purpose,
    businessName: "the business"
  });
  const started = await voice.startConversation(context, {
    toNumber: phone,
    fromNumber: connection.data.phoneNumber,
    assistantId: route.assistant_id,
    dynamicVariables: callVariables
  });
  if (!started.ok) return { ok: false as const, message: started.safeMessage };
  await queryPostgres(
    `insert into public.receptionist_calls (
       tenant_id,brand_id,customer_id,lead_id,provider_key,provider_call_id,direction,
       caller_number,called_number,status,summary,idempotency_key,metadata_json
     ) values ($1,$2,$3,$4,$5,$6,'outbound',$7,$8,'ringing',$9,$10,$11::jsonb)
     on conflict (provider_key,provider_call_id) do nothing`,
    [input.tenantId, input.brandId ?? null,
      input.contactType === "customer" ? input.contactId : null,
      input.contactType === "lead" ? input.contactId : null,
      provider.providerKey, started.data.providerCallId, connection.data.phoneNumber, phone,
      input.purpose, input.idempotencyKey,
      JSON.stringify({
        source: "owner_conversation",
        conversationalActionEventId: input.eventId,
        approvedByUserId: input.userId,
        purpose: input.purpose,
        callScenario: callVariables.call_scenario,
        contextQuality: callVariables.context_quality
      })]
  );
  return { ok: true as const, providerCallId: started.data.providerCallId, message: `The approved AI call to ${row.name} is starting.` };
}
