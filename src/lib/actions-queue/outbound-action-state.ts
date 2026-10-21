import { queryPostgres } from "@/lib/db/postgres";
import { ensureInvoiceReviewEnrollment } from "@/lib/reviews/invoice-review-enrollment";

export type OutboundActionState = "provider_queued" | "sent" | "blocked" | "failed";

export type OutboundActionStateRow = {
  id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  recipient_label: string | null;
  body: string | null;
};

export async function updateOutboundActionState(input: {
  tenantId: string;
  row: OutboundActionStateRow;
  status: OutboundActionState;
  message: string | null;
  providerMessageId?: string | null;
  retryable?: boolean;
  processedBy?: string;
}) {
  const processedAt = new Date().toISOString();
  await queryPostgres(
    `update public.outbound_action_queue
     set status=$3,
         processed_at=case when $3='sent' then coalesce(processed_at,now()) else processed_at end,
         last_error=$4,
         metadata_json=metadata_json || $5::jsonb,
         updated_at=now()
     where tenant_id=$1 and id=$2`,
    [
      input.tenantId,
      input.row.id,
      input.status,
      input.message,
      JSON.stringify({
        processedBy: input.processedBy ?? "business_automation_loop",
        providerMessageId: input.providerMessageId ?? null,
        retryable: input.retryable ?? false,
        processedAt,
        transportState: input.status,
        ...(input.row.action_type === "voice_call" && input.status === "sent"
          ? { voiceCapacity: { status: "started", startedAt: processedAt } }
          : {}),
      }),
    ],
  );

  if (input.row.target_type === "revenue_appointment_reminder" && input.row.target_id) {
    const reminderStatus = input.status === "provider_queued" ? "queued" : input.status;
    await queryPostgres(
      `update public.revenue_appointment_reminders
       set status=$3,
           sent_at=case when $3='sent' then coalesce(sent_at,now()) else sent_at end,
           metadata_json=metadata_json || $4::jsonb,
           updated_at=now()
       where tenant_id=$1 and id=$2`,
      [
        input.tenantId,
        input.row.target_id,
        reminderStatus,
        JSON.stringify({
          outboundActionId: input.row.id,
          providerMessageId: input.providerMessageId ?? null,
          transportState: input.status,
          lastResult: input.message,
        }),
      ],
    );
  }

  if (input.status !== "sent") return;

  if (input.row.target_type === "follow_up_workflow" && input.row.target_id) {
    const workflowResult = await queryPostgres<{
      enrollment_id: string | null;
      lead_id: string | null;
      customer_id: string | null;
      workflow_type: string;
    }>(
      `update public.follow_up_workflows
       set status='completed',completed_at=coalesce(completed_at,now()),
           metadata_json=metadata_json || jsonb_build_object(
             'completedBy',$3::text,'providerMessageId',$4::text
           ),updated_at=now()
       where tenant_id=$1 and id=$2 and status<>'completed'
       returning metadata_json->>'enrollmentId' as enrollment_id,lead_id,customer_id,workflow_type`,
      [
        input.tenantId,
        input.row.target_id,
        input.processedBy ?? "business_automation_loop",
        input.providerMessageId ?? null,
      ],
    );
    const enrollmentId = workflowResult?.rows[0]?.enrollment_id;
    const completedWorkflow = workflowResult?.rows[0];
    if (completedWorkflow?.lead_id) {
      await queryPostgres(
        `update public.leads
         set status=case when status='new' then 'contacted' else status end,updated_at=now()
         where tenant_id=$1 and id=$2`,
        [input.tenantId, completedWorkflow.lead_id],
      );
    }
    if (completedWorkflow?.lead_id || completedWorkflow?.customer_id) {
      await queryPostgres(
        `with target_thread as (
           select id from public.communication_threads
           where tenant_id=$1
             and (($2::uuid is not null and lead_id=$2::uuid)
               or ($3::uuid is not null and customer_id=$3::uuid))
           order by case when status in ('open','waiting_on_team','waiting_on_customer') then 0 else 1 end,
             updated_at desc
           limit 1
         ), recorded as (
           insert into public.communication_messages (
             tenant_id,thread_id,direction,channel,visibility,recipient_label,body,status,
             ai_generated,provider_message_id,sent_at,metadata_json
           )
           select $1,id,'outbound',$4,'customer_visible',$5,$6,'sent',true,$7,now(),
             jsonb_build_object('outboundActionId',$8,'workflowType',$9,'recordedBy',$10::text)
           from target_thread
           where not exists (
             select 1 from public.communication_messages existing
             where existing.tenant_id=$1 and existing.metadata_json->>'outboundActionId'=$8
           )
           returning thread_id
         )
         update public.communication_threads thread
         set status='waiting_on_customer',last_message_at=now(),unanswered_since=now(),
           next_follow_up_at=null,updated_at=now()
         where thread.tenant_id=$1 and thread.id in (select id from target_thread)`,
        [
          input.tenantId,
          completedWorkflow.lead_id,
          completedWorkflow.customer_id,
          input.row.action_type === "email_send" ? "email" : "sms",
          input.row.recipient_label,
          input.row.body,
          input.providerMessageId ?? null,
          input.row.id,
          completedWorkflow.workflow_type,
          input.processedBy ?? "business_automation_loop",
        ],
      );
    }
    if (enrollmentId) {
      await queryPostgres(
        `update public.revenue_followup_enrollments enrollment
         set current_step=enrollment.current_step+1,
             next_step_due_at=(
               select enrollment.created_at+make_interval(mins=>step.delay_minutes)
               from public.revenue_followup_steps step
               where step.tenant_id=enrollment.tenant_id
                 and step.sequence_id=enrollment.sequence_id
                 and step.step_number=enrollment.current_step+1
               limit 1
             ),
             status=case when exists (
               select 1 from public.revenue_followup_steps step
               where step.tenant_id=enrollment.tenant_id
                 and step.sequence_id=enrollment.sequence_id
                 and step.step_number=enrollment.current_step+1
             ) then 'active' else 'completed' end,
             updated_at=now()
         where enrollment.tenant_id=$1 and enrollment.id=$2`,
        [input.tenantId, enrollmentId],
      );
    }
  }

  if (input.row.target_type === "review_request_workflow" && input.row.target_id) {
    await queryPostgres(
      `update public.review_request_workflows
       set status='completed',sent_at=coalesce(sent_at,now()),
           metadata_json=metadata_json || jsonb_build_object('completedBy',$3::text),updated_at=now()
       where tenant_id=$1 and id=$2 and status<>'completed'`,
      [input.tenantId, input.row.target_id, input.processedBy ?? "business_automation_loop"],
    );
  }

  if (input.row.target_type === "messaging_conversation" && input.row.target_id) {
    await queryPostgres(
      `with updated_conversation as (
         update public.messaging_conversations
         set status='waiting_on_customer',unread_count=0,first_response_due_at=null,
           last_outbound_at=now(),last_message_at=now(),updated_at=now()
         where tenant_id=$1 and id=$2
         returning source_thread_id
       )
       update public.communication_threads thread
       set status='waiting_on_customer',unanswered_since=now(),next_follow_up_at=null,
         last_message_at=now(),updated_at=now()
       where thread.tenant_id=$1 and thread.id in (
         select source_thread_id from updated_conversation where source_thread_id is not null
       )`,
      [input.tenantId, input.row.target_id],
    );
  }

  if (input.row.target_type === "service_invoice" && input.row.target_id) {
    await queryPostgres(
      `update public.service_invoices
       set status=case when status='draft' then 'sent_manually' else status end,updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, input.row.target_id],
    );
    await ensureInvoiceReviewEnrollment({
      tenantId: input.tenantId,
      invoiceId: input.row.target_id,
      event: "invoice_sent",
    });
  }
}

export async function reconcileOutboundActionDelivery(input: {
  tenantId: string;
  queueId: string;
  normalizedStatus: "accepted" | "sending" | "queued" | "sent" | "delivered" | "failed" | "undelivered" | "rejected" | "unknown" | "suspected_filtered";
  providerMessageId: string;
  safeReason?: string | null;
  isFinal: boolean;
}) {
  const actionResult = await queryPostgres<OutboundActionStateRow & { status: string }>(
    `select id,action_type,target_type,target_id,recipient_label,
       coalesce(payload_json->>'body',payload_json->>'message',subject,'') as body,status
     from public.outbound_action_queue
     where tenant_id=$1 and id=$2
     limit 1`,
    [input.tenantId, input.queueId],
  );
  const action = actionResult?.rows[0];
  if (!action) return { reconciled: false, reason: "action_not_found" as const };

  if (["sent", "delivered"].includes(input.normalizedStatus) && action.status === "provider_queued") {
    await updateOutboundActionState({
      tenantId: input.tenantId,
      row: action,
      status: "sent",
      message: null,
      providerMessageId: input.providerMessageId,
      processedBy: "provider_delivery_receipt",
    });
  }

  if (input.normalizedStatus === "delivered") {
    await Promise.all([
      queryPostgres(
        `update public.outbound_action_queue
         set metadata_json=metadata_json || $3::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2`,
        [
          input.tenantId,
          input.queueId,
          JSON.stringify({ transportState: "delivered", deliveredAt: new Date().toISOString() }),
        ],
      ),
      queryPostgres(
        `update public.communication_messages
         set status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
         where tenant_id=$1 and metadata_json->>'outboundActionId'=$2`,
        [input.tenantId, input.queueId],
      ),
    ]);
  }

  if (
    input.isFinal
    && ["failed", "undelivered", "rejected", "suspected_filtered"].includes(input.normalizedStatus)
    && action.status !== "sent"
  ) {
    await updateOutboundActionState({
      tenantId: input.tenantId,
      row: action,
      status: "failed",
      message: input.safeReason ?? `Provider delivery ended as ${input.normalizedStatus}.`,
      providerMessageId: input.providerMessageId,
      retryable: false,
      processedBy: "provider_delivery_receipt",
    });
  }

  return { reconciled: true, actionId: action.id };
}
