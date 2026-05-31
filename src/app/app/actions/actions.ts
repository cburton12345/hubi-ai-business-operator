"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { sendEmailWithResend } from "@/lib/email/resend";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const queueStatusSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["needs_review", "approved", "queued", "sent_manually", "failed", "canceled", "blocked"]),
  note: z.string().optional()
});

const serviceForActionType: Record<string, string> = {
  sms_send: "sms_send",
  email_send: "email_send",
  publish_content: "publishing_queue",
  calendar_sync: "calendar_sync",
  review_request: "review_requests",
  billing_sync: "growth_attribution"
};

async function logDelivery(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  eventType: string;
  status?: string;
  providerEventId?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.outbound_delivery_events (
      tenant_id, queue_id, provider_key, event_type, status, provider_event_id, message, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.tenantId,
      input.queueId,
      input.providerKey,
      input.eventType,
      input.status ?? "logged",
      input.providerEventId ?? null,
      input.message ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

async function logProviderUsage(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  actionType: string;
  billingStatus: "included" | "billable" | "blocked" | "manual";
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.provider_usage_events (
      tenant_id, provider_account_id, provider_key, action_type, unit_count, billing_status, source_queue_id, metadata_json
    )
    select $1, pa.id, $3, $4, 1, $5, $2, $6::jsonb
    from (select 1) seed
    left join public.provider_accounts pa on pa.tenant_id = $1 and pa.provider_key = $3
    `,
    [
      input.tenantId,
      input.queueId,
      input.providerKey,
      input.actionType,
      input.billingStatus,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  await queryPostgres(
    `
    update public.provider_accounts
    set monthly_used_units = monthly_used_units + 1,
        updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [input.tenantId, input.providerKey]
  );
}

export async function scanActionQueueAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    insert into public.contact_consent_records (tenant_id, brand_id, lead_id, channel, contact_value, status, source, metadata_json)
    select l.tenant_id, l.brand_id, l.id, 'sms', l.phone,
      case when l.consent_to_contact then 'granted' else 'unknown' end,
      'lead_intake',
      jsonb_build_object('createdByScan', 'action_queue')
    from public.leads l
    where l.tenant_id = $1 and l.phone is not null and l.phone <> ''
    on conflict (tenant_id, channel, contact_value) do update
    set status = case
          when public.contact_consent_records.status = 'revoked' then 'revoked'
          when excluded.status = 'granted' then 'granted'
          else public.contact_consent_records.status
        end,
        updated_at = now()
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.contact_consent_records (tenant_id, brand_id, lead_id, channel, contact_value, status, source, metadata_json)
    select l.tenant_id, l.brand_id, l.id, 'email', l.email,
      case when l.consent_to_contact then 'granted' else 'unknown' end,
      'lead_intake',
      jsonb_build_object('createdByScan', 'action_queue')
    from public.leads l
    where l.tenant_id = $1 and l.email is not null and l.email <> ''
    on conflict (tenant_id, channel, contact_value) do update
    set status = case
          when public.contact_consent_records.status = 'revoked' then 'revoked'
          when excluded.status = 'granted' then 'granted'
          else public.contact_consent_records.status
        end,
        updated_at = now()
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
      subject, recipient_label, payload_json, policy_id, metadata_json
    )
    select m.tenant_id, m.brand_id,
      coalesce(route.action_type, case when m.channel = 'sms' then 'sms_send' else 'email_send' end),
      coalesce(route.default_provider_key, case when m.channel = 'sms' then 'twilio_shared' else 'resend_shared' end),
      'needs_review',
      'high',
      'communication_message',
      m.id,
      coalesce(t.subject, 'Customer message'),
      case
        when m.channel = 'sms' then coalesce(m.recipient_label, l.phone)
        when m.channel = 'email' then coalesce(m.recipient_label, l.email)
        else m.recipient_label
      end,
      jsonb_build_object('body', m.body, 'channel', m.channel, 'visibility', m.visibility),
      p.id,
      jsonb_build_object(
        'createdByScan', 'action_queue',
        'sendDisabledUntilProviderConnected', true,
        'ownershipMode', coalesce(route.ownership_mode, 'ferocity_managed'),
        'fallbackProviderKey', route.fallback_provider_key
      )
    from public.communication_messages m
    join public.communication_threads t on t.id = m.thread_id
    left join public.leads l on l.id = t.lead_id
    left join lateral (
      select
        case when m.channel = 'sms' then 'sms_send' else 'email_send' end as action_type,
        r.default_provider_key,
        r.ownership_mode,
        r.fallback_provider_key
      from public.provider_routing_rules r
      where r.tenant_id = m.tenant_id
        and r.action_type = case when m.channel = 'sms' then 'sms_send' else 'email_send' end
        and r.status = 'active'
      limit 1
    ) route on true
    left join public.live_action_policies p on p.tenant_id = m.tenant_id
      and p.action_key = coalesce(route.action_type, case when m.channel = 'sms' then 'sms_send' else 'email_send' end)
    where m.tenant_id = $1
      and m.direction = 'draft'
      and m.visibility = 'customer_visible'
      and m.channel in ('sms', 'email')
      and not exists (
        select 1 from public.outbound_action_queue q
        where q.tenant_id = m.tenant_id and q.target_type = 'communication_message' and q.target_id = m.id
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
      subject, scheduled_for, payload_json, policy_id, metadata_json
    )
    select q.tenant_id, q.brand_id,
      case when q.target_platform = 'google_business_profile' then 'publish_content' else 'publish_content' end,
      case
        when q.target_platform = 'google_business_profile' then 'google_business_profile'
        else coalesce(route.default_provider_key, 'external_publishing')
      end,
      'needs_review',
      'high',
      'publishing_queue',
      q.id,
      coalesce(d.title, c.title, 'Publish content'),
      q.scheduled_for,
      jsonb_build_object('targetPlatform', q.target_platform, 'queueStatus', q.queue_status),
      p.id,
      jsonb_build_object(
        'createdByScan', 'action_queue',
        'publishingRequiresApproval', true,
        'ownershipMode', coalesce(route.ownership_mode, 'workspace'),
        'fallbackProviderKey', route.fallback_provider_key
      )
    from public.publishing_queue q
    left join public.ai_drafts d on d.id = q.draft_id
    left join public.marketing_calendar_items c on c.id = q.calendar_item_id
    left join public.provider_routing_rules route on route.tenant_id = q.tenant_id
      and route.action_type = 'publish_content'
      and route.status = 'active'
    left join public.live_action_policies p on p.tenant_id = q.tenant_id and p.action_key = case when q.target_platform = 'google_business_profile' then 'gbp_publish' else 'publish_content' end
    where q.tenant_id = $1
      and q.queue_status in ('approved', 'scheduled', 'needs_approval')
      and not exists (
        select 1 from public.outbound_action_queue a
        where a.tenant_id = q.tenant_id and a.target_type = 'publishing_queue' and a.target_id = q.id
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
      subject, scheduled_for, payload_json, policy_id, metadata_json
    )
    select r.tenant_id, r.brand_id, 'review_request', coalesce(route.default_provider_key, 'twilio_shared'), 'needs_review', 'high',
      'review_request_workflow', r.id, 'Review request', r.scheduled_for,
      jsonb_build_object('channel', r.channel, 'triggerEvent', r.trigger_event, 'negativeInterceptionStatus', r.negative_interception_status),
      p.id,
      jsonb_build_object(
        'createdByScan', 'action_queue',
        'requiresServiceRecoveryCheck', true,
        'ownershipMode', coalesce(route.ownership_mode, 'ferocity_managed'),
        'fallbackProviderKey', route.fallback_provider_key
      )
    from public.review_request_workflows r
    left join public.provider_routing_rules route on route.tenant_id = r.tenant_id
      and route.action_type = 'review_request'
      and route.status = 'active'
    left join public.live_action_policies p on p.tenant_id = r.tenant_id and p.action_key = 'review_request'
    where r.tenant_id = $1
      and r.status in ('draft', 'scheduled')
      and not exists (
        select 1 from public.outbound_action_queue q
        where q.tenant_id = r.tenant_id and q.target_type = 'review_request_workflow' and q.target_id = r.id
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.outbound_action_queue (
      tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
      subject, scheduled_for, payload_json, policy_id, metadata_json
    )
    select e.tenant_id, e.brand_id, 'calendar_sync', coalesce(route.default_provider_key, 'calendar_provider'), 'needs_review', 'medium',
      'operator_schedule_event', e.id, e.title, e.starts_at,
      jsonb_build_object('eventType', e.event_type, 'startsAt', e.starts_at, 'endsAt', e.ends_at, 'location', e.location),
      p.id,
      jsonb_build_object(
        'createdByScan', 'action_queue',
        'autoBookingDisabled', true,
        'ownershipMode', coalesce(route.ownership_mode, 'workspace'),
        'fallbackProviderKey', route.fallback_provider_key
      )
    from public.operator_schedule_events e
    left join public.provider_routing_rules route on route.tenant_id = e.tenant_id
      and route.action_type = 'calendar_sync'
      and route.status = 'active'
    left join public.live_action_policies p on p.tenant_id = e.tenant_id and p.action_key = 'calendar_sync'
    where e.tenant_id = $1
      and e.status = 'scheduled'
      and not exists (
        select 1 from public.outbound_action_queue q
        where q.tenant_id = e.tenant_id and q.target_type = 'operator_schedule_event' and q.target_id = e.id
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'action_queue_scan', 'Action queue scan completed', 'Ferocity checked messages, publishing, reviews, calendar events, and consent records.', $2::jsonb)
    `,
    [workspaceId, JSON.stringify({ scan: "action_queue" })]
  );

  revalidatePath("/app/actions");
}

export async function sendApprovedEmailAction(formData: FormData) {
  await requirePermission("approval:review_high");
  const parsed = z.object({ actionId: z.string().uuid() }).safeParse({
    actionId: formData.get("actionId")
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const gate = await getServiceGate(workspaceId, "email_send");
  if (!gate.enabled) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = $3,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2 and action_type = 'email_send'
      `,
      [
        workspaceId,
        parsed.data.actionId,
        gate.reason,
        JSON.stringify({
          blockedByServiceControl: "email_send",
          mode: gate.mode,
          currentUsage: gate.currentUsage,
          usageLimit: gate.usageLimit
        })
      ]
    );
    revalidatePath("/app/actions");
    return;
  }

  const result = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string | null;
    provider_key: string;
    status: string;
    subject: string | null;
    recipient_label: string | null;
    payload_body: string | null;
    target_id: string | null;
    message_body: string | null;
    message_recipient: string | null;
    thread_subject: string | null;
    lead_email: string | null;
    customer_email: string | null;
  }>(
    `
    select
      q.id,
      q.tenant_id,
      q.brand_id,
      q.provider_key,
      q.status,
      q.subject,
      q.recipient_label,
      q.payload_json->>'body' as payload_body,
      q.target_id,
      m.body as message_body,
      m.recipient_label as message_recipient,
      t.subject as thread_subject,
      l.email as lead_email,
      c.email as customer_email
    from public.outbound_action_queue q
    left join public.communication_messages m on m.id = q.target_id and q.target_type = 'communication_message'
    left join public.communication_threads t on t.id = m.thread_id
    left join public.leads l on l.id = t.lead_id
    left join public.customers c on c.id = t.customer_id
    where q.tenant_id = $1
      and q.id = $2
      and q.action_type = 'email_send'
    limit 1
    `,
    [workspaceId, parsed.data.actionId]
  );

  const row = result?.rows[0];
  if (!row) return;

  if (row.status !== "approved" && row.status !== "queued") {
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: "Email must be approved before sending.",
      metadata: { currentStatus: row.status }
    });
    revalidatePath("/app/actions");
    return;
  }

  const recipient = row.message_recipient ?? row.recipient_label ?? row.lead_email ?? row.customer_email ?? "";
  const email = z.string().email().safeParse(recipient.trim());
  if (!email.success) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = 'Missing valid email recipient.',
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: "Missing valid email recipient.",
      metadata: { recipient }
    });
    revalidatePath("/app/actions");
    return;
  }

  const consent = await queryPostgres<{ id: string }>(
    `
    select id
    from public.contact_consent_records
    where tenant_id = $1
      and channel = 'email'
      and lower(contact_value) = lower($2)
      and status = 'granted'
    limit 1
    `,
    [workspaceId, email.data]
  );
  const suppressed = await queryPostgres<{ id: string }>(
    `
    select id
    from public.contact_suppression_list
    where tenant_id = $1
      and channel = 'email'
      and lower(contact_value) = lower($2)
      and active = true
    limit 1
    `,
    [workspaceId, email.data]
  );

  if (!consent?.rows[0] || suppressed?.rows[0]) {
    const reason = suppressed?.rows[0] ? "Email recipient is suppressed." : "Email consent is not granted.";
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id, reason]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: "send.blocked",
      message: reason,
      metadata: { recipient: email.data }
    });
    revalidatePath("/app/actions");
    return;
  }

  const body = (row.payload_body ?? row.message_body ?? "").trim();
  const subject = (row.subject ?? row.thread_subject ?? "Message from Ferocity").trim();
  if (!body) {
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'blocked',
          last_error = 'Missing email body.',
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id]
    );
    revalidatePath("/app/actions");
    return;
  }

  const sendResult = await sendEmailWithResend({
    to: email.data,
    subject,
    text: body,
    queueId: row.id,
    tenantId: workspaceId
  });

  if (!sendResult.ok) {
    const blocked = sendResult.status === 0;
    await queryPostgres(
      `
      update public.outbound_action_queue
      set status = $3,
          last_error = $4,
          processed_at = case when $3 = 'failed' then now() else processed_at end,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, row.id, blocked ? "blocked" : "failed", sendResult.error]
    );
    await logDelivery({
      tenantId: workspaceId,
      queueId: row.id,
      providerKey: row.provider_key,
      eventType: blocked ? "send.blocked" : "send.failed",
      status: "failed",
      message: sendResult.error,
      metadata: { providerStatus: sendResult.status }
    });
    revalidatePath("/app/actions");
    return;
  }

  await queryPostgres(
    `
    update public.outbound_action_queue
    set status = 'sent',
        approved_by_user_id = coalesce(approved_by_user_id, $3),
        approved_at = coalesce(approved_at, now()),
        processed_at = now(),
        last_error = null,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      row.id,
      session?.userId ?? null,
      JSON.stringify({
        sentWith: "resend",
        providerMessageId: sendResult.providerMessageId,
        sentAt: new Date().toISOString()
      })
    ]
  );

  if (row.target_id) {
    await queryPostgres(
      `
      update public.communication_messages
      set direction = 'outbound',
          status = 'sent_manually',
          provider_message_id = $3,
          sent_at = now(),
          metadata_json = metadata_json || $4::jsonb
      where tenant_id = $1 and id = $2 and channel = 'email'
      `,
      [
        workspaceId,
        row.target_id,
        sendResult.providerMessageId,
        JSON.stringify({ sentWith: "resend", outboundQueueId: row.id })
      ]
    );
  }

  await logDelivery({
    tenantId: workspaceId,
    queueId: row.id,
    providerKey: row.provider_key,
    eventType: "provider.accepted",
    status: "received",
    providerEventId: sendResult.providerMessageId,
    message: "Resend accepted the email.",
    metadata: { recipient: email.data }
  });
  await logProviderUsage({
    tenantId: workspaceId,
    queueId: row.id,
    providerKey: row.provider_key,
    actionType: "email_send",
    billingStatus: "included",
    metadata: { providerMessageId: sendResult.providerMessageId }
  });
  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, user_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, $3, 'user', 'email_sent_resend', 'outbound_action_queue', $4, $5::jsonb)
    `,
    [
      workspaceId,
      row.brand_id,
      session?.userId ?? null,
      row.id,
      JSON.stringify({ providerMessageId: sendResult.providerMessageId, recipient: email.data })
    ]
  );

  revalidatePath("/app/actions");
  revalidatePath("/app/operator");
}

export async function updateOutboundActionStatusAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const parsed = queueStatusSchema.safeParse({
    actionId: formData.get("actionId"),
    status: formData.get("status"),
    note: formData.get("note")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  if (parsed.data.status === "queued" || parsed.data.status === "sent_manually") {
    const current = await queryPostgres<{ provider_key: string; action_type: string }>(
      "select provider_key, action_type from public.outbound_action_queue where tenant_id = $1 and id = $2 limit 1",
      [workspaceId, parsed.data.actionId]
    );
    const actionType = current?.rows[0]?.action_type;
    const featureKey = actionType ? serviceForActionType[actionType] : null;
    if (featureKey) {
      const gate = await getServiceGate(workspaceId, featureKey);
      if (!gate.enabled) {
        await queryPostgres(
          `
          update public.outbound_action_queue
          set status = 'blocked',
              last_error = $3,
              metadata_json = metadata_json || $4::jsonb,
              updated_at = now()
          where tenant_id = $1 and id = $2
          `,
          [
            workspaceId,
            parsed.data.actionId,
            gate.reason,
            JSON.stringify({
              blockedByServiceControl: featureKey,
              mode: gate.mode,
              currentUsage: gate.currentUsage,
              usageLimit: gate.usageLimit
            })
          ]
        );
        await logDelivery({
          tenantId: workspaceId,
          queueId: parsed.data.actionId,
          providerKey: current?.rows[0]?.provider_key ?? "unknown",
          eventType: "status.blocked",
          status: "logged",
          message: gate.reason,
          metadata: { blockedByServiceControl: featureKey }
        });
        revalidatePath("/app/actions");
        return;
      }
    }
  }
  const result = await queryPostgres<{ provider_key: string; action_type: string }>(
    `
    update public.outbound_action_queue
    set status = $3,
        approved_by_user_id = case when $3 in ('approved', 'queued', 'sent_manually') then $4 else approved_by_user_id end,
        approved_at = case when $3 in ('approved', 'queued', 'sent_manually') then coalesce(approved_at, now()) else approved_at end,
        processed_at = case when $3 in ('sent_manually', 'sent', 'failed', 'canceled', 'blocked') then now() else processed_at end,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning provider_key, action_type
    `,
    [
      workspaceId,
      parsed.data.actionId,
      parsed.data.status,
      session?.userId ?? null,
      JSON.stringify({ lastReviewNote: parsed.data.note ?? "", reviewedAt: new Date().toISOString() })
    ]
  );

  const row = result?.rows[0];
  if (row) {
    await logDelivery({
      tenantId: workspaceId,
      queueId: parsed.data.actionId,
      providerKey: row.provider_key,
      eventType: `status.${parsed.data.status}`,
      message: parsed.data.note ?? "",
      metadata: { status: parsed.data.status }
    });

    if (parsed.data.status === "queued" || parsed.data.status === "sent_manually") {
      await logProviderUsage({
        tenantId: workspaceId,
        queueId: parsed.data.actionId,
        providerKey: row.provider_key,
        actionType: row.action_type,
        billingStatus: parsed.data.status === "sent_manually" ? "manual" : "included",
        metadata: { status: parsed.data.status, note: parsed.data.note ?? "" }
      });
    }
  }

  revalidatePath("/app/actions");
}
