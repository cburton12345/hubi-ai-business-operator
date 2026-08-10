import { queryPostgres } from "@/lib/db/postgres";
import { scoreLeadsForTenant } from "@/lib/revenue-growth/score-leads";

export type RevenueLoopAutomationResult = {
  leadsScored: number;
  appointmentsSynced: number;
  remindersPrepared: number;
  followupEnrollmentsCreated: number;
  followupStepsPrepared: number;
  conversionEventsPrepared: number;
};

function changedRows(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

export async function runRevenueLoopAutomationForTenant(tenantId: string): Promise<RevenueLoopAutomationResult> {
  const leadScoring = await scoreLeadsForTenant(tenantId);
  const appointmentResult = await queryPostgres(
    `
    insert into public.revenue_appointments (
      tenant_id, brand_id, lead_id, customer_id, service_job_id, appointment_type,
      status, scheduled_start, scheduled_end, booking_source, show_sequence_key, metadata_json, updated_at
    )
    select
      j.tenant_id,
      j.brand_id,
      j.source_lead_id,
      j.customer_id,
      j.id,
      case when j.status = 'scheduled' then 'service' else 'follow_up' end,
      case
        when j.status = 'completed' then 'completed'
        when j.status = 'in_progress' then 'showed'
        else 'booked'
      end,
      j.scheduled_start,
      j.scheduled_end,
      'service_job',
      'qualified_appointment_show_rate',
      jsonb_build_object('syncedBy', 'revenue_loop_automation'),
      now()
    from public.service_jobs j
    where j.tenant_id = $1
      and j.scheduled_start is not null
      and j.status in ('scheduled', 'in_progress', 'completed')
    on conflict (tenant_id, service_job_id) where service_job_id is not null do update set
      brand_id = excluded.brand_id,
      lead_id = excluded.lead_id,
      customer_id = excluded.customer_id,
      status = excluded.status,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      metadata_json = public.revenue_appointments.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [tenantId]
  );

  const reminderResult = await queryPostgres(
    `
    with candidates as (
      select
        a.tenant_id,
        a.brand_id,
        a.id as appointment_id,
        a.lead_id,
        case
          when st.step_number = 1 then 'confirmation'
          else concat('before_', st.delay_minutes, '_minutes')
        end as reminder_key,
        case
          when st.channel = 'email' and coalesce(l.email, c.email) is not null then 'email'
          when st.channel = 'sms' and coalesce(l.phone, c.phone) is not null then 'sms'
          when coalesce(l.phone, c.phone) is not null then 'sms'
          when coalesce(l.email, c.email) is not null then 'email'
          else 'task'
        end as channel,
        case
          when st.step_number = 1 then least(now(), a.scheduled_start)
          else a.scheduled_start - make_interval(mins => st.delay_minutes)
        end as scheduled_for,
        st.message_template,
        st.action_label,
        st.approval_required
      from public.revenue_appointments a
      join public.revenue_followup_sequences s
        on s.tenant_id = a.tenant_id
        and s.trigger_type = 'appointment_booked'
        and s.status = 'active'
        and (s.brand_id is null or s.brand_id = a.brand_id)
      join public.revenue_followup_steps st
        on st.tenant_id = s.tenant_id and st.sequence_id = s.id
      left join public.leads l on l.tenant_id = a.tenant_id and l.id = a.lead_id
      left join public.customers c on c.tenant_id = a.tenant_id and c.id = a.customer_id
      where a.tenant_id = $1
        and a.status in ('booked', 'confirmed')
        and a.scheduled_start > now() - interval '30 minutes'
    )
    insert into public.revenue_appointment_reminders (
      tenant_id, brand_id, appointment_id, lead_id, channel, reminder_key, status,
      scheduled_for, message_draft, metadata_json, updated_at
    )
    select
      tenant_id,
      brand_id,
      appointment_id,
      lead_id,
      channel,
      reminder_key,
      case
        when channel = 'task' then 'planned'
        when approval_required then 'needs_approval'
        else 'queued'
      end,
      scheduled_for,
      message_template,
      jsonb_build_object(
        'createdBy', 'revenue_loop_automation',
        'actionLabel', action_label,
        'approvalRequiredBySequence', approval_required
      ),
      now()
    from candidates
    on conflict (tenant_id, appointment_id, reminder_key) where appointment_id is not null do update set
      brand_id = excluded.brand_id,
      lead_id = excluded.lead_id,
      channel = excluded.channel,
      scheduled_for = excluded.scheduled_for,
      message_draft = excluded.message_draft,
      metadata_json = public.revenue_appointment_reminders.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [tenantId]
  );

  const conversionResult = await queryPostgres(
    `
    insert into public.revenue_conversion_event_queue (
      tenant_id, brand_id, event_key, event_type, provider, status, consent_checked,
      requires_manual_approval, idempotency_key, payload_json, updated_at
    )
    select
      a.tenant_id,
      a.brand_id,
      concat(
        case when a.status in ('showed','completed') then 'appointment_showed:' else 'appointment_booked:' end,
        a.id
      ),
      case when a.status in ('showed','completed') then 'appointment_showed' else 'appointment_booked' end,
      'provider_agnostic',
      'needs_review',
      coalesce(l.consent_to_contact, false),
      true,
      concat(
        case when a.status in ('showed','completed') then 'appointment_showed:' else 'appointment_booked:' end,
        a.id
      ),
      jsonb_build_object(
        'appointmentId', a.id,
        'leadId', a.lead_id,
        'serviceJobId', a.service_job_id,
        'noSensitiveCustomerPayload', true
      ),
      now()
    from public.revenue_appointments a
    left join public.leads l on l.tenant_id = a.tenant_id and l.id = a.lead_id
    where a.tenant_id = $1
      and a.status in ('booked', 'confirmed', 'showed', 'completed')
    on conflict (tenant_id, provider, idempotency_key) do nothing
    `,
    [tenantId]
  );

  const enrollmentResult = await queryPostgres(
    `
    insert into public.revenue_followup_enrollments (
      tenant_id, brand_id, sequence_id, lead_id, status, current_step,
      next_step_due_at, metadata_json, updated_at
    )
    select
      l.tenant_id,
      l.brand_id,
      s.id,
      l.id,
      'active',
      1,
      now() + make_interval(mins => coalesce(first_step.delay_minutes, 0)),
      jsonb_build_object('createdBy', 'revenue_loop_automation', 'trigger', 'qualified_lead'),
      now()
    from public.leads l
    join public.revenue_followup_sequences s
      on s.tenant_id = l.tenant_id
      and s.trigger_type = 'qualified_lead'
      and s.status = 'active'
      and (s.brand_id is null or s.brand_id = l.brand_id)
    left join public.revenue_followup_steps first_step
      on first_step.tenant_id = s.tenant_id
      and first_step.sequence_id = s.id
      and first_step.step_number = 1
    where l.tenant_id = $1
      and l.status <> 'spam'
      and l.qualification_status = 'qualified'
      and l.consent_to_contact = true
      and (l.email is not null or l.phone is not null)
    on conflict (tenant_id, sequence_id, lead_id)
      where sequence_id is not null and lead_id is not null
      do nothing
    `,
    [tenantId]
  );

  await queryPostgres(
    `
    update public.revenue_followup_enrollments e
    set status = case
          when l.consent_to_contact = false or l.status = 'spam' then 'opted_out'
          when exists (
            select 1 from public.service_estimates se
            where se.tenant_id = e.tenant_id and se.source_lead_id = e.lead_id and se.status = 'approved'
          ) then 'completed'
          else 'stopped'
        end,
        stop_reason = case
          when l.consent_to_contact = false or l.status = 'spam' then 'opt_out'
          when exists (
            select 1 from public.service_estimates se
            where se.tenant_id = e.tenant_id and se.source_lead_id = e.lead_id and se.status = 'approved'
          ) then 'sale_detected'
          when exists (
            select 1 from public.revenue_appointments a
            where a.tenant_id = e.tenant_id and a.lead_id = e.lead_id
              and a.status in ('booked','confirmed','showed','completed')
          ) then 'appointment_booked'
          else 'reply_detected'
        end,
        updated_at = now()
    from public.leads l
    where e.tenant_id = $1
      and e.status = 'active'
      and l.tenant_id = e.tenant_id
      and l.id = e.lead_id
      and (
        l.consent_to_contact = false
        or l.status = 'spam'
        or exists (
          select 1 from public.service_estimates se
          where se.tenant_id = e.tenant_id and se.source_lead_id = e.lead_id and se.status = 'approved'
        )
        or exists (
          select 1 from public.revenue_appointments a
          where a.tenant_id = e.tenant_id and a.lead_id = e.lead_id
            and a.status in ('booked','confirmed','showed','completed')
        )
        or exists (
          select 1
          from public.communication_threads t
          join public.communication_messages m on m.tenant_id = t.tenant_id and m.thread_id = t.id
          where t.tenant_id = e.tenant_id
            and t.lead_id = e.lead_id
            and m.direction = 'inbound'
            and m.created_at >= e.created_at
        )
      )
    `,
    [tenantId]
  );

  const followupResult = await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at,
      ai_suggested_message, metadata_json
    )
    select
      e.tenant_id,
      e.brand_id,
      e.lead_id,
      'nurture',
      case
        when st.channel = 'sms' and l.phone is not null then 'sms'
        when st.channel = 'email' and l.email is not null then 'email'
        when l.email is not null then 'email'
        else 'sms'
      end,
      'scheduled',
      e.next_step_due_at,
      st.message_template,
      jsonb_build_object(
        'createdBy', 'revenue_loop_automation',
        'enrollmentId', e.id,
        'sequenceId', e.sequence_id,
        'sequenceStep', e.current_step,
        'actionLabel', st.action_label
      )
    from public.revenue_followup_enrollments e
    join public.revenue_followup_steps st
      on st.tenant_id = e.tenant_id
      and st.sequence_id = e.sequence_id
      and st.step_number = e.current_step
    join public.leads l on l.tenant_id = e.tenant_id and l.id = e.lead_id
    where e.tenant_id = $1
      and e.status = 'active'
      and not exists (
        select 1
        from public.follow_up_workflows f
        where f.tenant_id = e.tenant_id
          and f.metadata_json->>'enrollmentId' = e.id::text
          and f.metadata_json->>'sequenceStep' = e.current_step::text
      )
    `,
    [tenantId]
  );

  return {
    leadsScored: leadScoring.scored,
    appointmentsSynced: changedRows(appointmentResult),
    remindersPrepared: changedRows(reminderResult),
    followupEnrollmentsCreated: changedRows(enrollmentResult),
    followupStepsPrepared: changedRows(followupResult),
    conversionEventsPrepared: changedRows(conversionResult)
  };
}
