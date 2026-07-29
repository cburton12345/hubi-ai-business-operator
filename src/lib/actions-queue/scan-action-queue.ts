import { queryPostgres } from "@/lib/db/postgres";

export type ActionQueueScanResult = {
  tenantId: string;
  consentRecordsUpserted: number;
  messageActionsQueued: number;
  reviewActionsQueued: number;
  publishingActionsQueued: number;
  calendarActionsQueued: number;
  followUpActionsQueued: number;
  appointmentReminderActionsQueued: number;
  failedActionsReopened: number;
};

function count(row: Record<string, unknown> | undefined, key: string) {
  return Number(row?.[key] ?? 0);
}

export async function retryFailedOutboundActionsForTenant(tenantId: string) {
  const result = await queryPostgres<{ reopened: string }>(
    `
    with reopened as (
      update public.outbound_action_queue
      set status = 'needs_review',
          last_error = concat('Retry review required after failure: ', coalesce(last_error, 'Unknown failure')),
          metadata_json = metadata_json || jsonb_build_object(
            'retryCount',
            coalesce((metadata_json->>'retryCount')::int, 0) + 1,
            'lastRetryPreparedAt',
            now(),
            'retryMode',
            'human_review_before_live_action'
          ),
          updated_at = now()
      where tenant_id = $1
        and status = 'failed'
        and coalesce((metadata_json->>'retryCount')::int, 0) < 2
        and updated_at <= now() - interval '10 minutes'
      returning id
    )
    select count(*)::text as reopened from reopened
    `,
    [tenantId]
  );

  return Number(result?.rows[0]?.reopened ?? 0);
}

export async function scanActionQueueForTenant(tenantId: string): Promise<ActionQueueScanResult> {
  const consent = await queryPostgres<{ upserted: string }>(
    `
    with source_contacts as (
      select tenant_id, brand_id, id as lead_id, 'sms' as channel, phone as contact_value, consent_to_contact
      from public.leads
      where tenant_id = $1 and phone is not null and phone <> ''
      union all
      select tenant_id, brand_id, id as lead_id, 'email' as channel, email as contact_value, consent_to_contact
      from public.leads
      where tenant_id = $1 and email is not null and email <> ''
    ),
    upserted as (
      insert into public.contact_consent_records (tenant_id, brand_id, lead_id, channel, contact_value, status, source, metadata_json)
      select tenant_id, brand_id, lead_id, channel, contact_value,
        case when consent_to_contact then 'granted' else 'unknown' end,
        'lead_intake',
        jsonb_build_object('createdByScan', 'production_action_queue')
      from source_contacts
      on conflict (tenant_id, channel, contact_value) do update
      set status = case
            when public.contact_consent_records.status = 'revoked' then 'revoked'
            when excluded.status = 'granted' then 'granted'
            else public.contact_consent_records.status
          end,
          updated_at = now()
      returning id
    )
    select count(*)::text as upserted from upserted
    `,
    [tenantId]
  );

  const messages = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, recipient_label, payload_json, policy_id, metadata_json
      )
      select m.tenant_id, m.brand_id,
        case when m.channel = 'sms' then 'sms_send' else 'email_send' end,
        coalesce(route.default_provider_key, case when m.channel = 'sms' then 'twilio_shared' else 'resend_shared' end),
        case when p.status = 'live' and p.requires_human_approval = false then 'queued' else 'needs_review' end,
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
        jsonb_build_object('createdByScan', 'production_action_queue', 'liveActionRequiresPolicy', true)
      from public.communication_messages m
      join public.communication_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
      left join public.leads l on l.tenant_id = t.tenant_id and l.id = t.lead_id
      left join public.provider_routing_rules route on route.tenant_id = m.tenant_id
        and route.action_type = case when m.channel = 'sms' then 'sms_send' else 'email_send' end
        and route.status = 'active'
      left join public.live_action_policies p on p.tenant_id = m.tenant_id
        and p.action_key = case when m.channel = 'sms' then 'sms_send' else 'email_send' end
      where m.tenant_id = $1
        and m.direction = 'draft'
        and m.visibility = 'customer_visible'
        and m.channel in ('sms', 'email')
        and not exists (
          select 1 from public.outbound_action_queue q
          where q.tenant_id = m.tenant_id and q.target_type = 'communication_message' and q.target_id = m.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const followUps = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, recipient_label, scheduled_for, payload_json, policy_id, metadata_json
      )
      select f.tenant_id, f.brand_id,
        case when f.channel = 'sms' then 'sms_send' else 'email_send' end,
        case when f.channel = 'sms' then 'twilio_shared' else 'resend_shared' end,
        case when p.status = 'live' and p.requires_human_approval = false then 'queued' else 'needs_review' end,
        case when f.workflow_type = 'invoice_followup' then 'high' else 'medium' end,
        'follow_up_workflow',
        f.id,
        initcap(replace(f.workflow_type, '_', ' ')),
        case
          when f.channel = 'sms' then coalesce(l.phone, c.phone)
          else coalesce(l.email, c.email)
        end,
        f.due_at,
        jsonb_build_object('message', f.ai_suggested_message, 'workflowType', f.workflow_type, 'channel', f.channel),
        p.id,
        jsonb_build_object('createdByScan', 'production_action_queue', 'source', 'follow_up_workflows')
      from public.follow_up_workflows f
      left join public.leads l on l.tenant_id = f.tenant_id and l.id = f.lead_id
      left join public.customers c on c.tenant_id = f.tenant_id and c.id = f.customer_id
      left join public.live_action_policies p on p.tenant_id = f.tenant_id
        and p.action_key = case when f.channel = 'sms' then 'sms_send' when f.channel = 'email' then 'email_send' else 'manual_followup' end
      where f.tenant_id = $1
        and f.status in ('open', 'scheduled', 'missed')
        and f.channel in ('sms', 'email')
        and not exists (
          select 1 from public.outbound_action_queue q
          where q.tenant_id = f.tenant_id and q.target_type = 'follow_up_workflow' and q.target_id = f.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const reviews = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, recipient_label, scheduled_for, payload_json, policy_id, metadata_json
      )
      select r.tenant_id, r.brand_id,
        case when r.channel = 'email' then 'email_send' when r.channel = 'sms' then 'sms_send' else 'review_request' end,
        case when r.channel = 'email' then 'resend_shared' else 'twilio_shared' end,
        case
          when p.status = 'live'
            and p.requires_human_approval = false
            and r.negative_interception_status <> 'needs_service_recovery'
          then 'queued'
          else 'needs_review'
        end,
        'high',
        'review_request_workflow',
        r.id,
        'Review request',
        case when r.channel = 'email' then coalesce(l.email, c.email)
          when r.channel = 'sms' then coalesce(l.phone, c.phone) else c.name end,
        r.scheduled_for,
        jsonb_build_object(
          'channel', r.channel,
          'triggerEvent', r.trigger_event,
          'negativeInterceptionStatus', r.negative_interception_status,
          'message', coalesce(r.ai_response_draft, 'Thanks again for choosing us. If everything looks good, we would appreciate an honest review.')
        ),
        p.id,
        jsonb_build_object(
          'createdByScan', 'production_action_queue',
          'requiresServiceRecoveryCheck', true,
          'automaticAuthority',
            p.status = 'live'
            and p.requires_human_approval = false
            and r.negative_interception_status <> 'needs_service_recovery'
        )
      from public.review_request_workflows r
      left join public.leads l on l.tenant_id = r.tenant_id and l.id = r.lead_id
      left join public.customers c on c.tenant_id = r.tenant_id and c.id = r.customer_id
      left join public.live_action_policies p on p.tenant_id = r.tenant_id and p.action_key = 'review_request'
      where r.tenant_id = $1
        and r.status in ('draft', 'scheduled')
        and not exists (
          select 1 from public.outbound_action_queue q
          where q.tenant_id = r.tenant_id and q.target_type = 'review_request_workflow' and q.target_id = r.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const appointmentReminders = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, recipient_label, scheduled_for, payload_json, policy_id, metadata_json
      )
      select
        r.tenant_id,
        r.brand_id,
        case when r.channel = 'sms' then 'sms_send' else 'email_send' end,
        coalesce(route.default_provider_key, case when r.channel = 'sms' then 'twilio_shared' else 'resend_shared' end),
        case when p.status = 'live' and p.requires_human_approval = false then 'queued' else 'needs_review' end,
        'medium',
        'revenue_appointment_reminder',
        r.id,
        coalesce(r.metadata_json->>'actionLabel', 'Appointment reminder'),
        case when r.channel = 'sms' then coalesce(l.phone, c.phone) else coalesce(l.email, c.email) end,
        r.scheduled_for,
        jsonb_build_object(
          'message', r.message_draft,
          'channel', r.channel,
          'appointmentId', r.appointment_id,
          'reminderKey', r.reminder_key
        ),
        p.id,
        jsonb_build_object(
          'createdByScan', 'production_action_queue',
          'source', 'revenue_appointment_reminders',
          'automaticAuthority', p.status = 'live' and p.requires_human_approval = false
        )
      from public.revenue_appointment_reminders r
      join public.revenue_appointments a on a.tenant_id = r.tenant_id and a.id = r.appointment_id
      left join public.leads l on l.tenant_id = a.tenant_id and l.id = a.lead_id
      left join public.customers c on c.tenant_id = a.tenant_id and c.id = a.customer_id
      left join public.provider_routing_rules route on route.tenant_id = r.tenant_id
        and route.action_type = case when r.channel = 'sms' then 'sms_send' else 'email_send' end
        and route.status = 'active'
      left join public.live_action_policies p on p.tenant_id = r.tenant_id
        and p.action_key = case when r.channel = 'sms' then 'sms_send' else 'email_send' end
      where r.tenant_id = $1
        and r.channel in ('sms', 'email')
        and r.status in ('planned', 'needs_approval', 'queued', 'failed')
        and not exists (
          select 1 from public.outbound_action_queue q
          where q.tenant_id = r.tenant_id
            and q.target_type = 'revenue_appointment_reminder'
            and q.target_id = r.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const publishing = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, scheduled_for, payload_json, policy_id, metadata_json
      )
      select q.tenant_id, q.brand_id, 'publish_content',
        case when q.target_platform = 'google_business_profile' then 'google_business_profile' else 'external_publishing' end,
        'needs_review',
        'high',
        'publishing_queue',
        q.id,
        coalesce(d.title, c.title, 'Publish content'),
        q.scheduled_for,
        jsonb_build_object('targetPlatform', q.target_platform, 'queueStatus', q.queue_status),
        p.id,
        jsonb_build_object('createdByScan', 'production_action_queue', 'publicPublishingRequiresApproval', true)
      from public.publishing_queue q
      left join public.ai_drafts d on d.tenant_id = q.tenant_id and d.id = q.draft_id
      left join public.marketing_calendar_items c on c.tenant_id = q.tenant_id and c.id = q.calendar_item_id
      left join public.live_action_policies p on p.tenant_id = q.tenant_id
        and p.action_key = case when q.target_platform = 'google_business_profile' then 'gbp_publish' else 'publish_content' end
      where q.tenant_id = $1
        and q.queue_status in ('approved', 'scheduled', 'needs_approval')
        and not exists (
          select 1 from public.outbound_action_queue a
          where a.tenant_id = q.tenant_id and a.target_type = 'publishing_queue' and a.target_id = q.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const calendar = await queryPostgres<{ queued: string }>(
    `
    with queued as (
      insert into public.outbound_action_queue (
        tenant_id, brand_id, action_type, provider_key, status, risk_level, target_type, target_id,
        subject, scheduled_for, payload_json, policy_id, metadata_json
      )
      select e.tenant_id, e.brand_id, 'calendar_sync', 'calendar_provider', 'needs_review', 'medium',
        'operator_schedule_event', e.id, e.title, e.starts_at,
        jsonb_build_object('eventType', e.event_type, 'startsAt', e.starts_at, 'endsAt', e.ends_at, 'location', e.location),
        p.id,
        jsonb_build_object('createdByScan', 'production_action_queue', 'autoBookingDisabled', true)
      from public.operator_schedule_events e
      left join public.live_action_policies p on p.tenant_id = e.tenant_id and p.action_key = 'calendar_sync'
      where e.tenant_id = $1
        and e.status = 'scheduled'
        and not exists (
          select 1 from public.outbound_action_queue q
          where q.tenant_id = e.tenant_id and q.target_type = 'operator_schedule_event' and q.target_id = e.id
        )
      limit 200
      returning id
    )
    select count(*)::text as queued from queued
    `,
    [tenantId]
  );

  const failedActionsReopened = await retryFailedOutboundActionsForTenant(tenantId);

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'system', 'action_queue_scan', 'Action queue scan completed', 'Ferocity checked customer drafts, follow-ups, reviews, publishing, calendar events, consent records, and failed retries.', $2::jsonb)
    `,
    [
      tenantId,
      JSON.stringify({
        consentRecordsUpserted: count(consent?.rows[0], "upserted"),
        messageActionsQueued: count(messages?.rows[0], "queued"),
        followUpActionsQueued: count(followUps?.rows[0], "queued"),
        appointmentReminderActionsQueued: count(appointmentReminders?.rows[0], "queued"),
        reviewActionsQueued: count(reviews?.rows[0], "queued"),
        publishingActionsQueued: count(publishing?.rows[0], "queued"),
        calendarActionsQueued: count(calendar?.rows[0], "queued"),
        failedActionsReopened
      })
    ]
  );

  return {
    tenantId,
    consentRecordsUpserted: count(consent?.rows[0], "upserted"),
    messageActionsQueued: count(messages?.rows[0], "queued"),
    followUpActionsQueued: count(followUps?.rows[0], "queued"),
    appointmentReminderActionsQueued: count(appointmentReminders?.rows[0], "queued"),
    reviewActionsQueued: count(reviews?.rows[0], "queued"),
    publishingActionsQueued: count(publishing?.rows[0], "queued"),
    calendarActionsQueued: count(calendar?.rows[0], "queued"),
    failedActionsReopened
  };
}
