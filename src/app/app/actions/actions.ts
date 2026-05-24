"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const queueStatusSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["needs_review", "approved", "queued", "sent_manually", "failed", "canceled", "blocked"]),
  note: z.string().optional()
});

async function logDelivery(input: {
  tenantId: string;
  queueId: string;
  providerKey: string;
  eventType: string;
  status?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.outbound_delivery_events (
      tenant_id, queue_id, provider_key, event_type, status, message, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.tenantId,
      input.queueId,
      input.providerKey,
      input.eventType,
      input.status ?? "logged",
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
      coalesce(m.recipient_label, l.phone, l.email),
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

export async function updateOutboundActionStatusAction(formData: FormData) {
  await requirePermission("approval:review_low");
  const parsed = queueStatusSchema.safeParse({
    actionId: formData.get("actionId"),
    status: formData.get("status"),
    note: formData.get("note")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
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
