import { queryPostgres } from "@/lib/db/postgres";

export type RequestedAppointmentAdvanceResult = {
  booked: number;
  conflictsEscalated: number;
  ownerRequestsResolved: number;
};

function changed(result: { rowCount?: number | null } | null) {
  return Number(result?.rowCount ?? 0);
}

export async function advanceRequestedAppointmentsForTenant(
  tenantId: string,
  query: typeof queryPostgres = queryPostgres,
): Promise<RequestedAppointmentAdvanceResult> {
  const booked = await query(
    `
    with eligible as (
      select appointment.id
      from public.revenue_appointments appointment
      join public.live_action_policies policy on policy.tenant_id = appointment.tenant_id
        and policy.action_key = 'calendar_sync' and policy.status = 'live'
        and policy.requires_human_approval = false
      where appointment.tenant_id = $1 and appointment.status = 'requested'
        and appointment.scheduled_start is not null and appointment.scheduled_end is not null
        and coalesce((appointment.metadata_json->>'requestedByCustomer')::boolean, false) = true
        and appointment.scheduled_start >= now()
        and not exists (
          select 1 from public.revenue_appointments occupied
          where occupied.tenant_id = appointment.tenant_id and occupied.id <> appointment.id
            and occupied.status in ('booked','confirmed','showed')
            and occupied.scheduled_start < appointment.scheduled_end
            and occupied.scheduled_end > appointment.scheduled_start
        )
        and not exists (
          select 1 from public.service_jobs job
          where job.tenant_id = appointment.tenant_id and job.status in ('scheduled','in_progress')
            and job.scheduled_start < appointment.scheduled_end
            and coalesce(job.scheduled_end, job.scheduled_start + interval '1 hour') > appointment.scheduled_start
        )
        and not exists (
          select 1 from public.service_visits visit
          where visit.tenant_id = appointment.tenant_id
            and visit.status in ('tentative','scheduled','confirmed','dispatched','en_route','arrived','in_progress')
            and visit.scheduled_start < appointment.scheduled_end
            and coalesce(visit.scheduled_end, visit.scheduled_start + interval '1 hour') > appointment.scheduled_start
        )
        and not exists (
          select 1 from public.external_calendar_events external
          where external.tenant_id = appointment.tenant_id and external.provider_deleted_at is null
            and external.event_status <> 'cancelled' and external.starts_at is not null and external.ends_at is not null
            and external.starts_at < appointment.scheduled_end and external.ends_at > appointment.scheduled_start
        )
    )
    update public.revenue_appointments appointment
    set status = 'booked',
        metadata_json = appointment.metadata_json || jsonb_build_object(
          'bookedBy', 'incoming_lead_autonomy', 'availabilityCheckedAt', now(),
          'availabilitySources', jsonb_build_array('revenue_appointments','service_jobs','service_visits','external_calendar_events')
        ),
        updated_at = now()
    from eligible where appointment.tenant_id = $1 and appointment.id = eligible.id
    `,
    [tenantId],
  );

  const conflicts = await query(
    `
    insert into public.owner_command_events (
      tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,
      severity,status,owner_attention,ai_handled,recommended_action,action_href,risk_type,
      confidence_score,metadata_json
    )
    select appointment.tenant_id,'ferocity','Ferocity','appointment-conflict:' || appointment.id::text,
      'appointment.conflict','Requested appointment conflicts with the schedule',
      'The requested time overlaps an existing appointment, job, visit, or connected-calendar event.',
      'high','needs_owner',true,false,'Offer another verified time or resolve the existing conflict.',
      '/app/revenue-growth#appointments','customer',100,
      jsonb_build_object('appointmentId',appointment.id,'leadId',appointment.lead_id,'scheduledStart',appointment.scheduled_start,
        'scheduledEnd',appointment.scheduled_end,'checkedBy','incoming_lead_autonomy')
    from public.revenue_appointments appointment
    where appointment.tenant_id=$1 and appointment.status='requested'
      and appointment.scheduled_start is not null and appointment.scheduled_end is not null
      and coalesce((appointment.metadata_json->>'requestedByCustomer')::boolean,false)=true
      and (
        exists (select 1 from public.revenue_appointments occupied
          where occupied.tenant_id=appointment.tenant_id and occupied.id<>appointment.id
            and occupied.status in ('booked','confirmed','showed')
            and occupied.scheduled_start<appointment.scheduled_end and occupied.scheduled_end>appointment.scheduled_start)
        or exists (select 1 from public.service_jobs job
          where job.tenant_id=appointment.tenant_id and job.status in ('scheduled','in_progress')
            and job.scheduled_start<appointment.scheduled_end
            and coalesce(job.scheduled_end,job.scheduled_start+interval '1 hour')>appointment.scheduled_start)
        or exists (select 1 from public.service_visits visit
          where visit.tenant_id=appointment.tenant_id
            and visit.status in ('tentative','scheduled','confirmed','dispatched','en_route','arrived','in_progress')
            and visit.scheduled_start<appointment.scheduled_end
            and coalesce(visit.scheduled_end,visit.scheduled_start+interval '1 hour')>appointment.scheduled_start)
        or exists (select 1 from public.external_calendar_events external
          where external.tenant_id=appointment.tenant_id and external.provider_deleted_at is null
            and external.event_status<>'cancelled' and external.starts_at is not null and external.ends_at is not null
            and external.starts_at<appointment.scheduled_end and external.ends_at>appointment.scheduled_start)
      )
    on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing
    `,
    [tenantId],
  );

  const resolved = await query(
    `
    update public.owner_command_events event
    set status='ai_handled',owner_attention=false,ai_handled=true,
      ai_summary='Ferocity verified the requested window against internal and connected-calendar commitments and booked it under the workspace scheduling policy.',
      recommended_action='No owner action is required unless the customer requests a change.',updated_at=now()
    from public.revenue_appointments appointment
    where event.tenant_id=$1 and appointment.tenant_id=event.tenant_id
      and appointment.status='booked' and appointment.metadata_json->>'bookedBy'='incoming_lead_autonomy'
      and event.external_event_id='public-appointment:' || appointment.lead_id::text
      and (event.owner_attention=true or event.status<>'ai_handled')
    `,
    [tenantId],
  );

  return {
    booked: changed(booked),
    conflictsEscalated: changed(conflicts),
    ownerRequestsResolved: changed(resolved),
  };
}
