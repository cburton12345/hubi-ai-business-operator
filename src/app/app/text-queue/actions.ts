"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const idSchema = z.object({ id: z.string().uuid() });
const outcomeSchema = z.object({
  id: z.string().uuid(),
  outcome: z.enum(["replied", "paid", "scheduled", "not_interested", "stop_follow_up", "no_answer"])
});

async function refresh() {
  revalidatePath("/app/text-queue");
  revalidatePath("/app/actions");
  revalidatePath("/app/leads");
  revalidatePath("/app/cash-collection");
}

export async function prepareLeadTextQueueAction() {
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with candidates as (
      select
        l.id,
        l.tenant_id,
        l.brand_id,
        l.name,
        l.phone,
        b.name as brand_name,
        coalesce(sent.sent_count, 0) as sent_count,
        sent.last_sent_at
      from public.leads l
      join public.brands b on b.id = l.brand_id
      left join lateral (
        select count(*)::int as sent_count, max(processed_at) as last_sent_at
        from public.outbound_action_queue q
        where q.tenant_id = l.tenant_id
          and q.action_type = 'sms_send'
          and q.provider_key = 'manual_sms'
          and q.target_type = 'lead'
          and q.target_id = l.id
          and q.status = 'sent_manually'
      ) sent on true
      where l.tenant_id = $1
        and l.phone is not null
        and l.phone <> ''
        and l.status in ('new','contacted','qualified')
        and coalesce(sent.sent_count, 0) < 3
        and (sent.last_sent_at is null or sent.last_sent_at < now() - interval '2 days')
        and not exists (
          select 1
          from public.outbound_delivery_events e
          join public.outbound_action_queue q on q.id = e.queue_id
          where q.tenant_id = l.tenant_id
            and q.target_type = 'lead'
            and q.target_id = l.id
            and e.event_type = 'manual_sms_outcome'
            and e.metadata_json->>'manualOutcome' in ('replied','scheduled','not_interested','stop_follow_up')
        )
        and not exists (
          select 1
          from public.outbound_action_queue existing
          where existing.tenant_id = l.tenant_id
            and existing.action_type = 'sms_send'
            and existing.provider_key = 'manual_sms'
            and existing.target_type = 'lead'
            and existing.target_id = l.id
            and existing.status in ('needs_review','approved','queued')
        )
      order by
        case l.priority when 'high' then 1 when 'normal' then 2 else 3 end,
        l.created_at asc
      limit 25
    )
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level,
      target_type, target_id, subject, recipient_label, scheduled_for, payload_json, metadata_json
    )
    select
      tenant_id,
      brand_id,
      'sms_send',
      'manual_sms',
      'needs_review',
      'medium',
      'lead',
      id,
      'Manual lead follow-up',
      phone,
      now(),
      jsonb_build_object(
        'body',
        'Hi ' || coalesce(nullif(name, ''), 'there') || ', this is a quick follow-up from ' || brand_name || '. Are you still looking for help? Reply here and we can get you taken care of.'
      ),
      jsonb_build_object(
        'source', 'manual_text_queue',
        'queueType', 'lead_follow_up',
        'attemptNumber', sent_count + 1,
        'maxAttempts', 3,
        'liveProviderSend', false
      )
    from candidates
    `,
    [tenantId]
  );
  await refresh();
}

export async function prepareInvoiceTextQueueAction() {
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with candidates as (
      select
        i.id,
        i.tenant_id,
        i.brand_id,
        i.title,
        i.total_cents,
        i.amount_paid_cents,
        i.due_date,
        c.name as customer_name,
        c.phone,
        coalesce(sent.sent_count, 0) as sent_count,
        sent.last_sent_at
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      left join lateral (
        select count(*)::int as sent_count, max(processed_at) as last_sent_at
        from public.outbound_action_queue q
        where q.tenant_id = i.tenant_id
          and q.action_type = 'sms_send'
          and q.provider_key = 'manual_sms'
          and q.target_type = 'service_invoice'
          and q.target_id = i.id
          and q.status = 'sent_manually'
      ) sent on true
      where i.tenant_id = $1
        and c.phone is not null
        and c.phone <> ''
        and i.status in ('sent_manually','partially_paid','overdue')
        and i.total_cents > i.amount_paid_cents
        and coalesce(sent.sent_count, 0) < 3
        and (sent.last_sent_at is null or sent.last_sent_at < now() - interval '3 days')
        and not exists (
          select 1
          from public.outbound_delivery_events e
          join public.outbound_action_queue q on q.id = e.queue_id
          where q.tenant_id = i.tenant_id
            and q.target_type = 'service_invoice'
            and q.target_id = i.id
            and e.event_type = 'manual_sms_outcome'
            and e.metadata_json->>'manualOutcome' in ('paid','replied','stop_follow_up')
        )
        and not exists (
          select 1
          from public.outbound_action_queue existing
          where existing.tenant_id = i.tenant_id
            and existing.action_type = 'sms_send'
            and existing.provider_key = 'manual_sms'
            and existing.target_type = 'service_invoice'
            and existing.target_id = i.id
            and existing.status in ('needs_review','approved','queued')
        )
      order by
        case when coalesce(i.due_date, i.created_at::date) < current_date then 1 else 2 end,
        coalesce(i.due_date, i.created_at::date) asc
      limit 25
    )
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level,
      target_type, target_id, subject, recipient_label, scheduled_for, payload_json, metadata_json
    )
    select
      tenant_id,
      brand_id,
      'sms_send',
      'manual_sms',
      'needs_review',
      'high',
      'service_invoice',
      id,
      'Manual payment reminder',
      phone,
      now(),
      jsonb_build_object(
        'body',
        'Hi ' || coalesce(nullif(customer_name, ''), 'there') || ', quick reminder that ' || title || ' has a balance of ' ||
        ($2::text) || to_char(((total_cents - amount_paid_cents)::numeric / 100), 'FM999,999,990.00') ||
        case when due_date is not null then ' due ' || to_char(due_date, 'Mon DD, YYYY') else '' end ||
        '. Please reply if you already paid or need the payment link resent.'
      ),
      jsonb_build_object(
        'source', 'manual_text_queue',
        'queueType', 'invoice_payment_reminder',
        'attemptNumber', sent_count + 1,
        'maxAttempts', 3,
        'liveProviderSend', false,
        'balanceCents', total_cents - amount_paid_cents
      )
    from candidates
    `,
    [tenantId, "$"]
  );
  await refresh();
}

export async function markManualTextSentAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.outbound_action_queue
    set status = 'sent_manually',
        processed_at = now(),
        metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1
      and id = $2
      and action_type = 'sms_send'
      and provider_key = 'manual_sms'
      and status in ('needs_review','approved','queued')
    `,
    [tenantId, parsed.data.id, JSON.stringify({ markedSentAt: new Date().toISOString(), sentBy: "manual_sms_link" })]
  );
  await refresh();
}

export async function cancelManualTextAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.outbound_action_queue
    set status = 'canceled',
        updated_at = now(),
        metadata_json = metadata_json || $3::jsonb
    where tenant_id = $1
      and id = $2
      and action_type = 'sms_send'
      and provider_key = 'manual_sms'
      and status in ('needs_review','approved','queued')
    `,
    [tenantId, parsed.data.id, JSON.stringify({ canceledFrom: "manual_text_queue", canceledAt: new Date().toISOString() })]
  );
  await refresh();
}

export async function markManualTextOutcomeAction(formData: FormData) {
  const parsed = outcomeSchema.safeParse({
    id: formData.get("id"),
    outcome: formData.get("outcome")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const label = parsed.data.outcome.replaceAll("_", " ");
  const metadata = JSON.stringify({ manualOutcome: parsed.data.outcome, manualOutcomeAt: new Date().toISOString() });

  await queryPostgres(
    `
    with updated as (
      update public.outbound_action_queue
      set status = case
            when $3 in ('replied','paid','scheduled','not_interested','stop_follow_up') then 'sent_manually'
            else status
          end,
          processed_at = case when processed_at is null then now() else processed_at end,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where tenant_id = $1
        and id = $2
        and action_type = 'sms_send'
        and provider_key = 'manual_sms'
      returning id, provider_key
    )
    insert into public.outbound_delivery_events (
      tenant_id, queue_id, provider_key, event_type, status, message, metadata_json
    )
    select $1, id, provider_key, 'manual_sms_outcome', 'logged', $5, $4::jsonb
    from updated
    `,
    [tenantId, parsed.data.id, parsed.data.outcome, metadata, `Manual text outcome: ${label}`]
  );
  await refresh();
}
