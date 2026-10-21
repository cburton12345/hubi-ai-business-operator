import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { createCalendarProvider } from "./provider";
import type { CalendarProviderKey, ExternalCalendarEvent } from "./types";

function eventHash(event: ExternalCalendarEvent) {
  return createHash("sha256").update(JSON.stringify({ title: event.title, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt, status: event.status, version: event.version })).digest("hex");
}

async function reconcileMappedRevenueAppointment(input: {
  tenantId: string;
  connectionId: string;
  calendarId: string;
  conflictPolicy: string;
  external: ExternalCalendarEvent;
}) {
  const mapping = await queryPostgres<{ internal_id: string | null }>(
    `select internal_id
     from public.integration_object_mappings
     where tenant_id=$1 and connection_id=$2 and object_type='calendar_event'
       and internal_table='revenue_appointments' and external_scope=$3 and external_id=$4
       and provider_deleted_at is null
     limit 1`,
    [input.tenantId, input.connectionId, input.calendarId, input.external.id],
  );
  const appointmentId = mapping?.rows[0]?.internal_id;
  if (!appointmentId) return;

  if (input.conflictPolicy === "provider_wins") {
    if (input.external.status === "cancelled") {
      await queryPostgres(
        `update public.revenue_appointments
         set status='canceled',metadata_json=metadata_json || $3::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2 and status<>'canceled'`,
        [input.tenantId, appointmentId, JSON.stringify({
          canceledFromExternalCalendar: true,
          externalCalendarReconciledAt: new Date().toISOString(),
        })],
      );
      return;
    }
    if (input.external.startsAt && input.external.endsAt) {
      await queryPostgres(
        `update public.revenue_appointments
         set scheduled_start=$3::timestamptz,scheduled_end=$4::timestamptz,
           metadata_json=metadata_json || $5::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2
           and (scheduled_start is distinct from $3::timestamptz or scheduled_end is distinct from $4::timestamptz)`,
        [input.tenantId, appointmentId, input.external.startsAt, input.external.endsAt, JSON.stringify({
          rescheduledFromExternalCalendar: true,
          externalCalendarReconciledAt: new Date().toISOString(),
        })],
      );
    }
    return;
  }

  if (input.conflictPolicy !== "review") return;
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,
       severity,status,owner_attention,ai_handled,recommended_action,action_href,risk_type,
       confidence_score,metadata_json
     )
     select appointment.tenant_id,'ferocity','Ferocity',
       'calendar-change:' || $2::text || ':' || $3::text,
       'calendar.external_change','A connected calendar changed a Ferocity appointment',
       'The connected calendar changed or canceled an appointment that Ferocity created.',
       'high','needs_owner',true,false,
       'Choose whether Ferocity or the connected calendar should be authoritative for this change.',
       '/app/integrations/calendar','customer',100,$5::jsonb
     from public.revenue_appointments appointment
     where appointment.tenant_id=$1 and appointment.id=$2
       and (
         $4='cancelled' and appointment.status<>'canceled'
         or $6::timestamptz is not null and $7::timestamptz is not null
           and (appointment.scheduled_start is distinct from $6::timestamptz
             or appointment.scheduled_end is distinct from $7::timestamptz)
       )
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null
     do update set status='needs_owner',owner_attention=true,summary=excluded.summary,
       metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json,updated_at=now()`,
    [
      input.tenantId,
      appointmentId,
      input.external.id,
      input.external.status,
      JSON.stringify({
        appointmentId,
        externalEventId: input.external.id,
        externalStatus: input.external.status,
        externalStartsAt: input.external.startsAt,
        externalEndsAt: input.external.endsAt,
      }),
      input.external.startsAt,
      input.external.endsAt,
    ],
  );
}

export async function discoverProviderCalendars(tenantId: string, providerKey: CalendarProviderKey) {
  return (await createCalendarProvider(tenantId, providerKey)).listCalendars();
}

export async function runInboundCalendarSync(input: { tenantId: string; providerKey: CalendarProviderKey }) {
  const connectionResult = await queryPostgres<{ id: string }>(
    "select id from public.integration_connections where tenant_id=$1 and provider=$2 and status='connected' limit 1",
    [input.tenantId, input.providerKey]
  );
  const connectionId = connectionResult?.rows[0]?.id;
  if (!connectionId) throw new Error("Connect the calendar provider before syncing.");
  const settingsResult = await queryPostgres<{
    external_calendar_id: string | null; sync_window_past_days: number; sync_window_future_days: number; status: string; conflict_policy: string;
  }>(
    "select external_calendar_id,sync_window_past_days,sync_window_future_days,status,conflict_policy from public.calendar_sync_settings where tenant_id=$1 and connection_id=$2 limit 1",
    [input.tenantId, connectionId]
  );
  const settings = settingsResult?.rows[0];
  if (!settings?.external_calendar_id || settings.status === "paused") throw new Error("Select an active calendar before syncing.");
  const cursorResult = await queryPostgres<{ cursor_value: string | null }>(
    "select cursor_value from public.integration_sync_cursors where tenant_id=$1 and connection_id=$2 and resource_type='calendar_events' and external_scope=$3 limit 1",
    [input.tenantId, connectionId, settings.external_calendar_id]
  );
  const cursor = cursorResult?.rows[0]?.cursor_value ?? null;
  const now = Date.now();
  const windowStart = new Date(now - Number(settings.sync_window_past_days) * 86_400_000).toISOString();
  const windowEnd = new Date(now + Number(settings.sync_window_future_days) * 86_400_000).toISOString();
  const job = await queryPostgres<{ id: string }>(
    `insert into public.integration_jobs (tenant_id,connection_id,job_type,status,payload_json,started_at)
     values ($1,$2,'calendar_inbound_sync','running',$3::jsonb,now()) returning id`,
    [input.tenantId, connectionId, JSON.stringify({ providerKey: input.providerKey, calendarId: settings.external_calendar_id, incremental: Boolean(cursor) })]
  );
  const jobId = job?.rows[0]?.id;
  try {
    await queryPostgres(
      `insert into public.integration_sync_cursors (tenant_id,connection_id,resource_type,external_scope,status,last_started_at,window_start,window_end)
       values ($1,$2,'calendar_events',$3,'syncing',now(),$4,$5)
       on conflict (connection_id,resource_type,external_scope) do update set status='syncing',last_started_at=now(),window_start=$4,window_end=$5,updated_at=now()`,
      [input.tenantId, connectionId, settings.external_calendar_id, windowStart, windowEnd]
    );
    const page = await (await createCalendarProvider(input.tenantId, input.providerKey)).listChanges({
      calendarId: settings.external_calendar_id, cursor, windowStart, windowEnd
    });
    if (page.resetRequired) {
      await queryPostgres(
        `update public.integration_sync_cursors set cursor_value=null,status='reset_required',last_error='Provider requested a clean calendar resynchronization.',updated_at=now()
         where connection_id=$1 and resource_type='calendar_events' and external_scope=$2`,
        [connectionId, settings.external_calendar_id]
      );
      if (jobId) await queryPostgres("update public.integration_jobs set status='completed',result_json=$2::jsonb,completed_at=now() where id=$1", [jobId, JSON.stringify({ resetRequired: true, imported: 0 })]);
      return { imported: 0, cancelled: 0, conflicts: 0, resetRequired: true };
    }
    let cancelled = 0;
    for (const external of page.events) {
      if (external.status === "cancelled") cancelled += 1;
      await queryPostgres(
        `insert into public.external_calendar_events (
           tenant_id,connection_id,provider_key,external_calendar_id,external_event_id,external_version,title,description,
           location_text,starts_at,ends_at,all_day,event_status,web_url,attendee_emails_json,source_updated_at,provider_deleted_at,raw_summary_json
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18::jsonb)
         on conflict (connection_id,external_calendar_id,external_event_id) do update set
           external_version=excluded.external_version,title=excluded.title,description=excluded.description,location_text=excluded.location_text,
           starts_at=excluded.starts_at,ends_at=excluded.ends_at,all_day=excluded.all_day,event_status=excluded.event_status,
           web_url=excluded.web_url,attendee_emails_json=excluded.attendee_emails_json,source_updated_at=excluded.source_updated_at,
           provider_deleted_at=excluded.provider_deleted_at,raw_summary_json=excluded.raw_summary_json,updated_at=now()`,
        [input.tenantId, connectionId, input.providerKey, settings.external_calendar_id, external.id, external.version, external.title, external.description, external.location, external.startsAt, external.endsAt, external.allDay, external.status, external.webUrl, JSON.stringify(external.attendeeEmails), external.updatedAt, external.status === "cancelled" ? new Date().toISOString() : null, JSON.stringify({ hash: eventHash(external) })]
      );
      await queryPostgres(
        `insert into public.integration_object_mappings (
          tenant_id,connection_id,provider_key,object_type,internal_table,external_scope,external_id,external_version,ownership_mode,last_synced_hash,last_synced_at,provider_deleted_at
        ) values ($1,$2,$3,'calendar_event','external_calendar_events',$4,$5,$6,'provider',$7,now(),$8)
        on conflict (connection_id,object_type,external_scope,external_id) do update set external_version=excluded.external_version,
          last_synced_hash=excluded.last_synced_hash,last_synced_at=now(),provider_deleted_at=excluded.provider_deleted_at,updated_at=now()`,
        [input.tenantId, connectionId, input.providerKey, settings.external_calendar_id, external.id, external.version, eventHash(external), external.status === "cancelled" ? new Date().toISOString() : null]
      );
      await reconcileMappedRevenueAppointment({
        tenantId: input.tenantId,
        connectionId,
        calendarId: settings.external_calendar_id,
        conflictPolicy: settings.conflict_policy,
        external,
      });
    }
    const conflictResult = await queryPostgres<{ count: string }>(
      `select count(distinct e.id)::text as count
       from public.external_calendar_events e
       join public.service_visits v on v.tenant_id=e.tenant_id and v.scheduled_start < e.ends_at and v.scheduled_end > e.starts_at
       where e.tenant_id=$1 and e.connection_id=$2 and e.provider_deleted_at is null and e.event_status <> 'cancelled'
         and v.scheduled_start is not null and v.scheduled_end is not null`,
      [input.tenantId, connectionId]
    );
    const conflicts = Number(conflictResult?.rows[0]?.count ?? 0);
    await queryPostgres(
      `update public.integration_sync_cursors set cursor_value=$3,status='current',last_completed_at=now(),last_error=null,
         metadata_json=metadata_json || $4::jsonb,updated_at=now()
       where connection_id=$1 and resource_type='calendar_events' and external_scope=$2`,
      [connectionId, settings.external_calendar_id, page.nextCursor, JSON.stringify({ imported: page.events.length, cancelled, conflicts })]
    );
    if (jobId) await queryPostgres("update public.integration_jobs set status='completed',result_json=$2::jsonb,completed_at=now() where id=$1", [jobId, JSON.stringify({ imported: page.events.length, cancelled, conflicts })]);
    return { imported: page.events.length, cancelled, conflicts, resetRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar synchronization failed.";
    await queryPostgres(
      `update public.integration_sync_cursors set status='error',last_error=$3,updated_at=now()
       where connection_id=$1 and resource_type='calendar_events' and external_scope=$2`,
      [connectionId, settings.external_calendar_id, message]
    );
    if (jobId) await queryPostgres("update public.integration_jobs set status='failed',error_message=$2,completed_at=now() where id=$1", [jobId, message]);
    await queryPostgres(
      `insert into public.integration_dead_letters (tenant_id,connection_id,integration_job_id,provider_key,operation,error_category,safe_error_message,payload_summary_json)
       values ($1,$2,$3,$4,'calendar_inbound_sync','provider_sync_failed',$5,$6::jsonb)`,
      [input.tenantId, connectionId, jobId ?? null, input.providerKey, message, JSON.stringify({ calendarId: settings.external_calendar_id })]
    );
    throw error;
  }
}

export async function runOutboundCalendarSync(input: { tenantId: string; providerKey: CalendarProviderKey }) {
  const configResult = await queryPostgres<{
    connection_id: string; external_calendar_id: string; outbound_writes_enabled: boolean; sync_direction: string;
  }>(
    `select s.connection_id,s.external_calendar_id,s.outbound_writes_enabled,s.sync_direction
     from public.calendar_sync_settings s join public.integration_connections c on c.id=s.connection_id
     where s.tenant_id=$1 and s.provider_key=$2 and s.status='ready' and c.status='connected' limit 1`,
    [input.tenantId, input.providerKey]
  );
  const config = configResult?.rows[0];
  if (!config?.outbound_writes_enabled || !["outbound", "two_way"].includes(config.sync_direction)) return { written: 0, deleted: 0, skipped: 0 };
  const visits = await queryPostgres<{
    id: string; title: string; status: string; scheduled_start: string; scheduled_end: string; updated_at: string;
    dispatch_notes: string | null; address: string; timezone: string | null; external_id: string | null; last_synced_hash: string | null;
  }>(
    `select v.id,v.title,v.status,v.scheduled_start,v.scheduled_end,v.updated_at,v.dispatch_notes,
       concat_ws(', ',l.address_line1,l.city,l.state,l.postal_code) as address,l.timezone,
       m.external_id,m.last_synced_hash
     from public.service_visits v
     left join public.customer_locations l on l.id=v.location_id
     left join public.integration_object_mappings m on m.connection_id=$2 and m.object_type='calendar_event'
       and m.internal_table='service_visits' and m.internal_id=v.id and m.external_scope=$3
     where v.tenant_id=$1 and v.scheduled_start is not null and v.scheduled_end is not null
       and v.scheduled_end >= now() - interval '30 days' and v.scheduled_start <= now() + interval '365 days'`,
    [input.tenantId, config.connection_id, config.external_calendar_id]
  );
  const provider = await createCalendarProvider(input.tenantId, input.providerKey);
  let written = 0; let deleted = 0; let skipped = 0;
  for (const visit of visits?.rows ?? []) {
    if (visit.status === "canceled") {
      if (visit.external_id) {
        await provider.deleteEvent(config.external_calendar_id, visit.external_id);
        await queryPostgres("update public.integration_object_mappings set provider_deleted_at=now(),updated_at=now() where connection_id=$1 and internal_id=$2 and external_scope=$3", [config.connection_id, visit.id, config.external_calendar_id]);
        deleted += 1;
      } else skipped += 1;
      continue;
    }
    const hash = createHash("sha256").update(JSON.stringify({ title: visit.title, start: visit.scheduled_start, end: visit.scheduled_end, notes: visit.dispatch_notes, address: visit.address, status: visit.status })).digest("hex");
    if (hash === visit.last_synced_hash) { skipped += 1; continue; }
    const external = await provider.upsertEvent(config.external_calendar_id, {
      externalId: visit.external_id, title: visit.title, description: visit.dispatch_notes ?? "",
      location: visit.address, startsAt: visit.scheduled_start, endsAt: visit.scheduled_end,
      timeZone: visit.timezone ?? "UTC", idempotencyKey: visit.id
    });
    await queryPostgres(
      `insert into public.integration_object_mappings (tenant_id,connection_id,provider_key,object_type,internal_table,internal_id,external_scope,external_id,external_version,ownership_mode,last_synced_hash,last_synced_at)
       values ($1,$2,$3,'calendar_event','service_visits',$4,$5,$6,$7,'ferocity',$8,now())
       on conflict (connection_id,object_type,internal_table,internal_id,external_scope) do update set external_id=excluded.external_id,
         external_version=excluded.external_version,last_synced_hash=excluded.last_synced_hash,last_synced_at=now(),provider_deleted_at=null,updated_at=now()`,
      [input.tenantId, config.connection_id, input.providerKey, visit.id, config.external_calendar_id, external.id, external.version, hash]
    );
    written += 1;
  }

  const appointments = await queryPostgres<{
    id: string;
    appointment_type: string;
    status: string;
    scheduled_start: string;
    scheduled_end: string;
    contact_name: string;
    contact_email: string | null;
    external_id: string | null;
    last_synced_hash: string | null;
  }>(
    `select appointment.id,appointment.appointment_type,appointment.status,
       appointment.scheduled_start,appointment.scheduled_end,
       coalesce(customer.name,lead.name,'Customer') as contact_name,
       coalesce(customer.email,lead.email) as contact_email,
       mapping.external_id,mapping.last_synced_hash
     from public.revenue_appointments appointment
     left join public.customers customer on customer.id=appointment.customer_id
     left join public.leads lead on lead.id=appointment.lead_id
     left join public.integration_object_mappings mapping
       on mapping.connection_id=$2 and mapping.object_type='calendar_event'
       and mapping.internal_table='revenue_appointments' and mapping.internal_id=appointment.id
       and mapping.external_scope=$3
     where appointment.tenant_id=$1
       and appointment.status in ('booked','confirmed','showed','rescheduled','canceled')
       and appointment.scheduled_start is not null and appointment.scheduled_end is not null
       and appointment.scheduled_end>=now()-interval '30 days'
       and appointment.scheduled_start<=now()+interval '365 days'`,
    [input.tenantId, config.connection_id, config.external_calendar_id],
  );
  for (const appointment of appointments?.rows ?? []) {
    if (appointment.status === "canceled") {
      if (appointment.external_id) {
        await provider.deleteEvent(config.external_calendar_id, appointment.external_id);
        await queryPostgres(
          `update public.integration_object_mappings
           set provider_deleted_at=now(),updated_at=now()
           where connection_id=$1 and internal_table='revenue_appointments'
             and internal_id=$2 and external_scope=$3`,
          [config.connection_id, appointment.id, config.external_calendar_id],
        );
        deleted += 1;
      } else skipped += 1;
      continue;
    }
    const title = `${appointment.contact_name} — ${appointment.appointment_type.replaceAll("_", " ")}`;
    const hash = createHash("sha256").update(JSON.stringify({
      title,
      startsAt: appointment.scheduled_start,
      endsAt: appointment.scheduled_end,
      status: appointment.status,
      attendee: appointment.contact_email,
    })).digest("hex");
    if (hash === appointment.last_synced_hash) {
      skipped += 1;
      continue;
    }
    const external = await provider.upsertEvent(config.external_calendar_id, {
      externalId: appointment.external_id,
      title,
      description: "Appointment managed by Ferocity.",
      startsAt: appointment.scheduled_start,
      endsAt: appointment.scheduled_end,
      timeZone: "UTC",
      attendeeEmails: appointment.contact_email ? [appointment.contact_email] : [],
      idempotencyKey: `revenue-appointment:${appointment.id}`,
    });
    await queryPostgres(
      `insert into public.integration_object_mappings (
         tenant_id,connection_id,provider_key,object_type,internal_table,internal_id,
         external_scope,external_id,external_version,ownership_mode,last_synced_hash,last_synced_at
       ) values ($1,$2,$3,'calendar_event','revenue_appointments',$4,$5,$6,$7,'ferocity',$8,now())
       on conflict (connection_id,object_type,internal_table,internal_id,external_scope)
       do update set external_id=excluded.external_id,external_version=excluded.external_version,
         last_synced_hash=excluded.last_synced_hash,last_synced_at=now(),
         provider_deleted_at=null,updated_at=now()`,
      [
        input.tenantId,
        config.connection_id,
        input.providerKey,
        appointment.id,
        config.external_calendar_id,
        external.id,
        external.version,
        hash,
      ],
    );
    written += 1;
  }
  return { written, deleted, skipped };
}
