import type { PoolClient } from "pg";

type TimeClockClient = Pick<PoolClient, "query">;

export type CreateTimeClockEntryInput = {
  tenantId: string;
  workerId: string;
  assignmentId: string | null;
  clockInLocation: string | null;
  gpsVerified: boolean;
  notes: string | null;
  source: "employee_app" | "operations_workforce";
  actorUserId?: string | null;
  actorWorkerId?: string | null;
};

export type CreateTimeClockEntryResult = { id: string; created: boolean };

export type CloseTimeClockEntryResult =
  | { closed: true; id: string }
  | { closed: false; reason: "not_open" | "wrong_worker" | "break_exceeds_shift" };

export type BreakChangeResult =
  | { changed: true; id: string; breakSeconds: number }
  | { changed: false; reason: "not_open" | "wrong_worker" | "already_on_break" | "not_on_break" };

async function appendTimeEvent(client: TimeClockClient, input: {
  tenantId: string;
  timeEntryId: string;
  workerId: string | null;
  eventType: "clock_in" | "break_started" | "break_ended" | "clock_out" | "time_corrected";
  actorUserId?: string | null;
  actorWorkerId?: string | null;
  reason?: string | null;
  previous?: Record<string, unknown>;
  next?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const result = await client.query(
    `insert into public.operations_time_entry_events
       (tenant_id,time_entry_id,worker_id,event_type,actor_user_id,actor_worker_id,reason,
        previous_state_json,new_state_json,idempotency_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
     on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing`,
    [input.tenantId,input.timeEntryId,input.workerId,input.eventType,input.actorUserId ?? null,
      input.actorWorkerId ?? null,input.reason ?? null,JSON.stringify(input.previous ?? {}),
      JSON.stringify(input.next ?? {}),input.idempotencyKey ?? null]
  );
  if (result.rowCount !== 1 && !input.idempotencyKey) throw new Error("Time-clock audit evidence was not saved.");
}

/**
 * Creates at most one open entry for a tenant/worker pair.
 * The caller must invoke this inside a database transaction so the advisory
 * lock remains held through the existing-entry check and insert.
 */
export async function createTimeClockEntry(
  client: TimeClockClient,
  input: CreateTimeClockEntryInput
): Promise<CreateTimeClockEntryResult> {
  const lockKey = `employee-time-clock:${input.tenantId}:${input.workerId}`;
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);

  const existing = await client.query<{ id: string }>(
    `select id
     from public.operations_time_entries
     where tenant_id = $1 and worker_id = $2 and status = 'open'
     order by clock_in_at desc
     limit 1
     for update`,
    [input.tenantId, input.workerId]
  );
  if (existing.rows[0]?.id) return { id: existing.rows[0].id, created: false };

  const inserted = await client.query<{ id: string }>(
    `insert into public.operations_time_entries (
       tenant_id, worker_id, assignment_id, clock_in_location, gps_verified, notes, metadata_json
     ) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
     returning id`,
    [
      input.tenantId,
      input.workerId,
      input.assignmentId,
      input.clockInLocation,
      input.gpsVerified,
      input.notes,
      JSON.stringify({
        clockMode: input.gpsVerified ? "gps_verified" : "manual",
        source: input.source
      })
    ]
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("The time entry could not be saved.");
  await appendTimeEvent(client, {
    tenantId: input.tenantId,timeEntryId: id,workerId: input.workerId,eventType: "clock_in",
    actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId,
    next: { assignmentId: input.assignmentId, source: input.source }
  });
  return { id, created: true };
}

export async function changeTimeClockBreak(client: TimeClockClient, input: {
  tenantId: string;
  timeEntryId: string;
  workerId: string | null;
  mode: "start" | "end";
  actorUserId?: string | null;
  actorWorkerId?: string | null;
  source: "employee_app" | "operations_workforce";
}): Promise<BreakChangeResult> {
  const current = await client.query<{
    id: string; worker_id: string | null; status: string; break_started_at: Date | null; break_seconds: number;
  }>(
    `select id,worker_id,status,break_started_at,break_seconds
     from public.operations_time_entries where tenant_id=$1 and id=$2 for update`,
    [input.tenantId,input.timeEntryId]
  );
  const entry = current.rows[0];
  if (!entry || entry.status !== "open") return { changed: false, reason: "not_open" };
  if (input.workerId && entry.worker_id !== input.workerId) return { changed: false, reason: "wrong_worker" };
  if (input.mode === "start" && entry.break_started_at) return { changed: false, reason: "already_on_break" };
  if (input.mode === "end" && !entry.break_started_at) return { changed: false, reason: "not_on_break" };

  const updated = input.mode === "start"
    ? await client.query<{ id: string; break_seconds: number }>(
        `update public.operations_time_entries set break_started_at=now(),updated_at=now()
         where tenant_id=$1 and id=$2 and status='open' and break_started_at is null
         returning id,break_seconds`,
        [input.tenantId,input.timeEntryId]
      )
    : await client.query<{ id: string; break_seconds: number }>(
        `update public.operations_time_entries
         set break_seconds=break_seconds+greatest(0,extract(epoch from (now()-break_started_at)))::integer,
             break_minutes=ceil((break_seconds+greatest(0,extract(epoch from (now()-break_started_at))))/60.0)::integer,
             break_started_at=null,updated_at=now()
         where tenant_id=$1 and id=$2 and status='open' and break_started_at is not null
         returning id,break_seconds`,
        [input.tenantId,input.timeEntryId]
      );
  const changed = updated.rows[0];
  if (!changed) throw new Error("The break state changed before it could be saved.");
  await appendTimeEvent(client, {
    tenantId: input.tenantId,timeEntryId: entry.id,workerId: entry.worker_id,
    eventType: input.mode === "start" ? "break_started" : "break_ended",
    actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId,
    previous: { breakStartedAt: entry.break_started_at, breakSeconds: entry.break_seconds },
    next: { onBreak: input.mode === "start", breakSeconds: changed.break_seconds, source: input.source }
  });
  return { changed: true, id: changed.id, breakSeconds: changed.break_seconds };
}

export async function closeTimeClockEntry(
  client: TimeClockClient,
  input: {
    tenantId: string;
    timeEntryId: string;
    workerId: string | null;
    clockOutLocation: string | null;
    breakMinutes: number;
    notes: string | null;
    source: "employee_app" | "operations_workforce";
    actorUserId?: string | null;
    actorWorkerId?: string | null;
  }
): Promise<CloseTimeClockEntryResult> {
  const current = await client.query<{
    id: string;
    worker_id: string | null;
    status: string;
    elapsed_minutes: string;
    elapsed_seconds: string;
    effective_break_seconds: string;
    break_started_at: Date | null;
  }>(
    `select id,worker_id,status,break_started_at,
            greatest(0,extract(epoch from (now()-clock_in_at)))::text as elapsed_seconds,
            greatest(0,extract(epoch from (now()-clock_in_at))/60)::text as elapsed_minutes,
            (break_seconds+case when break_started_at is not null then
              greatest(0,extract(epoch from (now()-break_started_at)))::integer else 0 end)::text as effective_break_seconds
     from public.operations_time_entries
     where id = $1 and tenant_id = $2
     for update`,
    [input.timeEntryId, input.tenantId]
  );
  const entry = current.rows[0];
  if (!entry || entry.status !== "open") return { closed: false, reason: "not_open" };
  if (input.workerId && entry.worker_id !== input.workerId) return { closed: false, reason: "wrong_worker" };
  const effectiveBreakSeconds = Math.max(Number(entry.effective_break_seconds),input.breakMinutes * 60);
  if (effectiveBreakSeconds > Number(entry.elapsed_seconds)) return { closed: false, reason: "break_exceeds_shift" };

  const updated = await client.query<{ id: string }>(
    `update public.operations_time_entries
     set clock_out_at = now(),
         clock_out_location = $3,
         break_seconds = $4,
         break_minutes = ceil($4/60.0)::integer,
         break_started_at = null,
         status = 'needs_review',
         notes = concat_ws(E'\n', nullif(notes, ''), nullif($5, '')),
         metadata_json = metadata_json || $6::jsonb,
         updated_at = now()
     where id = $1 and tenant_id = $2 and status = 'open'
       and ($7::uuid is null or worker_id = $7)
     returning id`,
    [
      input.timeEntryId,
      input.tenantId,
      input.clockOutLocation,
      effectiveBreakSeconds,
      input.notes,
      JSON.stringify({ clockOutMode: "manual", payrollReviewRequired: true, source: input.source }),
      input.workerId
    ]
  );
  const id = updated.rows[0]?.id;
  if (!id) throw new Error("The open time entry changed during clock-out.");
  await appendTimeEvent(client, {
    tenantId: input.tenantId,timeEntryId: id,workerId: entry.worker_id,eventType: "clock_out",
    actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId,reason: input.notes,
    previous: { status: entry.status, breakStartedAt: entry.break_started_at },
    next: { status: "needs_review", breakSeconds: effectiveBreakSeconds, source: input.source }
  });
  return { closed: true, id };
}

export async function correctTimeClockEntry(client: TimeClockClient, input: {
  tenantId: string;timeEntryId: string;clockInAt: string;clockOutAt: string;breakMinutes: number;
  reason: string;actorUserId: string;actorWorkerId?: string | null;
}) {
  const current = await client.query<{
    id: string;worker_id: string | null;status: string;clock_in_at: Date;clock_out_at: Date | null;break_seconds: number;
  }>(
    `select id,worker_id,status,clock_in_at,clock_out_at,break_seconds
     from public.operations_time_entries where tenant_id=$1 and id=$2 for update`,
    [input.tenantId,input.timeEntryId]
  );
  const entry = current.rows[0];
  if (!entry || entry.status === "open") return { corrected: false as const, reason: "not_reviewable" as const };
  const start = new Date(input.clockInAt);
  const end = new Date(input.clockOutAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return { corrected: false as const, reason: "invalid_range" as const };
  }
  const elapsedSeconds = Math.floor((end.getTime()-start.getTime())/1000);
  if (input.breakMinutes < 0 || input.breakMinutes*60 > elapsedSeconds) {
    return { corrected: false as const, reason: "break_exceeds_shift" as const };
  }
  const updated = await client.query<{ id: string }>(
    `update public.operations_time_entries
     set clock_in_at=$3::timestamptz,clock_out_at=$4::timestamptz,
         break_seconds=$5,break_minutes=$6,break_started_at=null,status='needs_review',updated_at=now(),
         metadata_json=metadata_json||jsonb_build_object('correctedAt',now(),'correctionReviewRequired',true)
     where tenant_id=$1 and id=$2 and status<>'open' returning id`,
    [input.tenantId,input.timeEntryId,input.clockInAt,input.clockOutAt,input.breakMinutes*60,input.breakMinutes]
  );
  if (!updated.rows[0]) throw new Error("The time entry changed before the correction was saved.");
  await appendTimeEvent(client, {
    tenantId: input.tenantId,timeEntryId: entry.id,workerId: entry.worker_id,eventType: "time_corrected",
    actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId,reason: input.reason,
    previous: { clockInAt: entry.clock_in_at,clockOutAt: entry.clock_out_at,breakSeconds: entry.break_seconds,status: entry.status },
    next: { clockInAt: input.clockInAt,clockOutAt: input.clockOutAt,breakSeconds: input.breakMinutes*60,status: "needs_review" }
  });
  return { corrected: true as const,id: entry.id };
}

export async function applyCrewTimeIntent(client: TimeClockClient,input: {
  tenantId: string;workerId: string;intent: "clock_in" | "start_break" | "end_break" | "clock_out";
  assignmentId: string | null;note: string | null;actorUserId: string | null;actorWorkerId: string | null;
}) {
  if (input.intent === "clock_in") {
    const result = await createTimeClockEntry(client, {
      tenantId: input.tenantId,workerId: input.workerId,assignmentId: input.assignmentId,
      clockInLocation: null,gpsVerified: false,notes: input.note,source: "operations_workforce",
      actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId
    });
    return { outcome: result.created ? "applied" as const : "skipped" as const,reason: result.created ? "clocked_in" as const : "already_clocked_in" as const };
  }
  const open = await client.query<{ id: string }>(
    `select id from public.operations_time_entries
     where tenant_id=$1 and worker_id=$2 and status='open'
     order by clock_in_at desc limit 1 for update`,
    [input.tenantId,input.workerId]
  );
  const timeEntryId = open.rows[0]?.id;
  if (!timeEntryId) return { outcome: "skipped" as const,reason: "already_clocked_out" as const };
  if (input.intent === "clock_out") {
    const result = await closeTimeClockEntry(client, {
      tenantId: input.tenantId,timeEntryId,workerId: input.workerId,clockOutLocation: null,breakMinutes: 0,
      notes: input.note,source: "operations_workforce",actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId
    });
    return result.closed
      ? { outcome: "applied" as const,reason: "clocked_out" as const }
      : { outcome: "failed" as const,reason: result.reason };
  }
  const result = await changeTimeClockBreak(client, {
    tenantId: input.tenantId,timeEntryId,workerId: input.workerId,
    mode: input.intent === "start_break" ? "start" : "end",
    actorUserId: input.actorUserId,actorWorkerId: input.actorWorkerId,source: "operations_workforce"
  });
  return result.changed
    ? { outcome: "applied" as const,reason: input.intent === "start_break" ? "break_started" as const : "break_ended" as const }
    : { outcome: result.reason === "wrong_worker" || result.reason === "not_open" ? "failed" as const : "skipped" as const,reason: result.reason };
}
