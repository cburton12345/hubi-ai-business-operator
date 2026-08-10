import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { buildCommunicationFailoverOffers, recordCommunicationFailover } from "@/lib/preferences/communication-failover";
import type { CommunicationFallbackMode, CommunicationMethod } from "@/lib/preferences/communication-preferences";
import { ensureInvoiceReviewEnrollment } from "@/lib/reviews/invoice-review-enrollment";

export type ReadyMessageProcessingResult = {
  checked: number;
  sent: number;
  blocked: number;
  failed: number;
};

type ReadyMessageRow = {
  id: string;
  action_type: "email_send" | "sms_send";
  provider_key: string;
  recipient_label: string | null;
  subject: string | null;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  policy_status: string | null;
  requires_human_approval: boolean | null;
  retry_count: number;
  queue_status: string;
  communication_method: string | null;
  fallback_mode: CommunicationFallbackMode | null;
  fallback_method: CommunicationMethod | null;
  contact_email: string | null;
  contact_phone: string | null;
};

function engineProviderKey(actionType: ReadyMessageRow["action_type"], providerKey: string) {
  if (providerKey === "resend_shared") return "resend_email";
  if (providerKey === "twilio_shared") return "twilio_sms";
  return actionType === "email_send" ? "resend_email" : providerKey === "manual_sms" ? "manual_sms" : "twilio_sms";
}

async function updateQueueResult(input: {
  tenantId: string;
  row: ReadyMessageRow;
  status: "sent" | "blocked" | "failed";
  message: string | null;
  providerMessageId?: string | null;
}) {
  await queryPostgres(
    `
    update public.outbound_action_queue
    set status = $3,
        processed_at = case when $3 = 'sent' then now() else processed_at end,
        last_error = $4,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      input.tenantId,
      input.row.id,
      input.status,
      input.message,
      JSON.stringify({
        processedBy: "business_automation_loop",
        providerMessageId: input.providerMessageId ?? null,
        processedAt: new Date().toISOString()
      })
    ]
  );

  if (input.row.target_type === "revenue_appointment_reminder" && input.row.target_id) {
    await queryPostgres(
      `
      update public.revenue_appointment_reminders
      set status = $3,
          sent_at = case when $3 = 'sent' then now() else sent_at end,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        input.tenantId,
        input.row.target_id,
        input.status,
        JSON.stringify({ outboundActionId: input.row.id, lastResult: input.message })
      ]
    );
  }

  if (input.status === "sent" && input.row.target_type === "follow_up_workflow" && input.row.target_id) {
    const workflowResult = await queryPostgres<{ enrollment_id: string | null }>(
      `
      update public.follow_up_workflows
      set status = 'completed',
          completed_at = now(),
          metadata_json = metadata_json || jsonb_build_object('completedBy', 'business_automation_loop'),
          updated_at = now()
      where tenant_id = $1 and id = $2
      returning metadata_json->>'enrollmentId' as enrollment_id
      `,
      [input.tenantId, input.row.target_id]
    );
    const enrollmentId = workflowResult?.rows[0]?.enrollment_id;
    if (enrollmentId) {
      await queryPostgres(
        `
        update public.revenue_followup_enrollments e
        set current_step = e.current_step + 1,
            next_step_due_at = (
              select e.created_at + make_interval(mins => st.delay_minutes)
              from public.revenue_followup_steps st
              where st.tenant_id = e.tenant_id
                and st.sequence_id = e.sequence_id
                and st.step_number = e.current_step + 1
              limit 1
            ),
            status = case
              when exists (
                select 1
                from public.revenue_followup_steps st
                where st.tenant_id = e.tenant_id
                  and st.sequence_id = e.sequence_id
                  and st.step_number = e.current_step + 1
              ) then 'active'
              else 'completed'
            end,
            updated_at = now()
        where e.tenant_id = $1 and e.id = $2
        `,
        [input.tenantId, enrollmentId]
      );
    }
  }

  if (input.status === "sent" && input.row.target_type === "review_request_workflow" && input.row.target_id) {
    await queryPostgres(
      `
      update public.review_request_workflows
      set status = 'completed', sent_at = now(),
          metadata_json = metadata_json || jsonb_build_object('completedBy', 'business_automation_loop'),
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [input.tenantId, input.row.target_id]
    );
  }

  if (input.status === "sent" && input.row.target_type === "service_invoice" && input.row.target_id) {
    await queryPostgres(
      "update public.service_invoices set status=case when status='draft' then 'sent_manually' else status end,updated_at=now() where tenant_id=$1 and id=$2",
      [input.tenantId, input.row.target_id]
    );
    await ensureInvoiceReviewEnrollment({ tenantId: input.tenantId, invoiceId: input.row.target_id, event: "invoice_sent" });
  }
}

export async function processReadyMessagesForTenant(tenantId: string, limit = 50): Promise<ReadyMessageProcessingResult> {
  const result = await queryPostgres<ReadyMessageRow>(
    `
    select
      q.id,
      q.action_type,
      q.provider_key,
      q.recipient_label,
      q.subject,
      coalesce(q.payload_json->>'body', q.payload_json->>'message') as body,
      q.target_type,
      q.target_id::text,
      p.status as policy_status,
      p.requires_human_approval,
      coalesce((q.metadata_json->>'retryCount')::int, 0) as retry_count
      ,q.status as queue_status
      ,q.metadata_json->>'communicationMethod' as communication_method
      ,q.metadata_json#>>'{communicationPreference,fallbackMode}' as fallback_mode
      ,q.metadata_json#>>'{communicationPreference,fallbackMethods,0}' as fallback_method
      ,coalesce(l.email, c.email, case when q.recipient_label like '%@%' then q.recipient_label end) as contact_email
      ,coalesce(l.phone, c.phone, case when q.recipient_label not like '%@%' then q.recipient_label end) as contact_phone
    from public.outbound_action_queue q
    left join public.live_action_policies p on p.id = q.policy_id and p.tenant_id = q.tenant_id
    left join public.leads l on l.tenant_id = q.tenant_id and q.target_type = 'lead' and l.id = q.target_id
    left join public.service_invoices i on i.tenant_id = q.tenant_id and q.target_type = 'service_invoice' and i.id = q.target_id
    left join public.customers c on c.tenant_id = q.tenant_id and c.id = i.customer_id
    where q.tenant_id = $1
      and q.action_type in ('email_send', 'sms_send')
      and coalesce(q.scheduled_for, now()) <= now()
      and (
        q.status = 'approved'
        or (
          q.status = 'queued'
          and p.status = 'live'
          and p.requires_human_approval = false
        )
      )
    order by coalesce(q.scheduled_for, q.created_at) asc
    limit $2
    `,
    [tenantId, limit]
  );
  const rows = result?.rows ?? [];
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  for (const row of rows) {
    const recipient = row.recipient_label?.trim() ?? "";
    const body = row.body?.trim() ?? "";
    const channel = row.action_type === "email_send" ? "email" : "sms";
    if (!recipient || !body) {
      blocked += 1;
      await updateQueueResult({ tenantId, row, status: "blocked", message: "Missing recipient or message body." });
      continue;
    }

    const consent = await queryPostgres<{ id: string }>(
      `
      select id
      from public.contact_consent_records
      where tenant_id = $1
        and channel = $2
        and lower(contact_value) = lower($3)
        and status = 'granted'
      limit 1
      `,
      [tenantId, channel, recipient]
    );
    if (!consent?.rows[0]) {
      blocked += 1;
      await updateQueueResult({ tenantId, row, status: "blocked", message: `${channel.toUpperCase()} consent is not granted.` });
      continue;
    }

    const idempotencyKey = row.retry_count > 0
      ? `outbound-action:${row.id}:attempt:${row.retry_count}`
      : `outbound-action:${row.id}`;
    const sendResult = await sendMessage({
      tenantId,
      channel,
      to: recipient,
      body,
      subject: row.subject ?? undefined,
      providerKey: engineProviderKey(row.action_type, row.provider_key),
      queueId: row.id,
      idempotencyKey,
      authorization: {
        source: row.queue_status === "approved" ? "approved_action_queue" : "live_action_policy",
        humanApproved: row.queue_status === "approved",
        policyAllowsAuto: row.queue_status === "queued"
          && row.policy_status === "live"
          && row.requires_human_approval === false
      },
      metadata: {
        aiGenerated: true,
        source: "outbound_action_queue",
        targetType: row.target_type,
        targetId: row.target_id
      }
    });

    if (sendResult.ok && sendResult.status === "sent") {
      sent += 1;
      await updateQueueResult({
        tenantId,
        row,
        status: "sent",
        message: null,
        providerMessageId: sendResult.providerMessageId
      });
    } else if (sendResult.ok) {
      blocked += 1;
      await updateQueueResult({
        tenantId,
        row,
        status: "blocked",
        message: "The provider prepared a manual send instead of completing a live send."
      });
    } else {
      failed += 1;
      const offers = buildCommunicationFailoverOffers({
        originalMethod: row.communication_method ?? row.action_type,
        hasPhone: Boolean(row.contact_phone),
        hasEmail: Boolean(row.contact_email)
      });
      const automaticFallback = row.fallback_mode === "automatic"
        ? offers.find((offer) => offer.method === row.fallback_method)
        : null;
      await recordCommunicationFailover({
        tenantId,
        queueId: row.id,
        providerKey: row.provider_key,
        originalMethod: row.communication_method ?? row.action_type,
        reason: sendResult.error,
        offers,
        mode: row.fallback_mode ?? "ask",
        selected: automaticFallback?.method,
        outcome: automaticFallback ? "selected" : "pending"
      });
      if (automaticFallback) {
        const next = automaticFallback.method === "email"
          ? { actionType: "email_send", providerKey: "resend_email", recipient: row.contact_email }
          : automaticFallback.method === "human_call"
            ? { actionType: "phone_call", providerKey: "manual_phone", recipient: row.contact_phone }
            : automaticFallback.method === "copy_message"
              ? { actionType: "manual_message", providerKey: "copy_message", recipient: row.recipient_label }
              : { actionType: "sms_send", providerKey: "manual_sms", recipient: row.contact_phone };
        await queryPostgres(
          `update public.outbound_action_queue
           set action_type=$3, provider_key=$4, recipient_label=coalesce($5,recipient_label),
               status='needs_review', last_error=$6,
               metadata_json=metadata_json || $7::jsonb, updated_at=now()
           where tenant_id=$1 and id=$2`,
          [tenantId, row.id, next.actionType, next.providerKey, next.recipient, sendResult.error,
            JSON.stringify({ failoverSelected: automaticFallback.method, failoverReason: sendResult.error })]
        );
        continue;
      }
      await updateQueueResult({
        tenantId,
        row,
        status: sendResult.retryable ? "failed" : "blocked",
        message: sendResult.error
      });
    }
  }

  return { checked: rows.length, sent, blocked, failed };
}
