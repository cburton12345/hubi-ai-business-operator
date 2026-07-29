"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { evaluateVisitCompletion } from "@/lib/field-ops/evaluate-visit-completion";
import { evaluateVisitSchedule } from "@/lib/scheduling/evaluate-visit";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const scheduleSchema = z.object({
  visitId: z.string().uuid(),
  scheduledStart: z.string().datetime({ local: true }),
  scheduledEnd: z.string().datetime({ local: true }),
  serviceTypeId: z.string().uuid().optional().or(z.literal(""))
});

const assignmentSchema = z.object({
  visitId: z.string().uuid(),
  workerId: z.string().uuid()
});

const statusSchema = z.object({
  visitId: z.string().uuid(),
  status: z.enum([
    "unscheduled",
    "tentative",
    "scheduled",
    "confirmed",
    "dispatched",
    "en_route",
    "arrived",
    "in_progress",
    "paused",
    "completed",
    "no_show",
    "canceled"
  ])
});

const calendarFeedSchema = z.object({
  label: z.string().trim().min(2).max(80)
});

const revokeCalendarFeedSchema = z.object({
  feedId: z.string().uuid()
});

function hashCalendarToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCalendarFeedAction(
  _previous: { ok: boolean; url?: string; message?: string },
  formData: FormData
) {
  await requirePermission("tenant:manage");
  const parsed = calendarFeedSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) return { ok: false, message: "Enter a calendar name." };

  const tenantId = await getCurrentWorkspaceId();
  const token = randomBytes(32).toString("base64url");
  await queryPostgres(
    `
    insert into public.calendar_feed_tokens (tenant_id, label, token_hash)
    values ($1, $2, $3)
    `,
    [tenantId, parsed.data.label, hashCalendarToken(token)]
  );
  revalidatePath("/app/schedule");
  const appUrl = (env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live").replace(/\/$/, "");
  return { ok: true, url: `${appUrl}/calendar/${encodeURIComponent(token)}` };
}

export async function revokeCalendarFeedAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = revokeCalendarFeedSchema.safeParse({ feedId: formData.get("feedId") });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.calendar_feed_tokens
    set status = 'revoked', revoked_at = now()
    where tenant_id = $1 and id = $2 and status = 'active'
    `,
    [tenantId, parsed.data.feedId]
  );
  revalidatePath("/app/schedule");
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function legacyJobStatus(status: z.infer<typeof statusSchema>["status"]) {
  if (status === "unscheduled" || status === "tentative") return "unscheduled";
  if (["scheduled", "confirmed", "dispatched", "en_route"].includes(status)) return "scheduled";
  if (["arrived", "in_progress", "paused"].includes(status)) return "in_progress";
  if (status === "completed") return "completed";
  return "canceled";
}

async function insertVisitEvent(params: {
  tenantId: string;
  visitId: string;
  type: string;
  title: string;
  detail: string;
  previous?: Record<string, unknown>;
  next?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.service_operating_events (
      tenant_id, brand_id, customer_id, location_id, work_order_id, visit_id,
      event_type, source_type, source_id, title, detail,
      previous_state_json, next_state_json, metadata_json
    )
    select v.tenant_id, v.brand_id, v.customer_id, v.location_id,
           v.work_order_id, v.id, $3, 'user', v.id::text, $4, $5,
           $6::jsonb, $7::jsonb, $8::jsonb
    from public.service_visits v
    where v.tenant_id = $1 and v.id = $2
    `,
    [
      params.tenantId,
      params.visitId,
      params.type,
      params.title,
      params.detail,
      JSON.stringify(params.previous ?? {}),
      JSON.stringify(params.next ?? {}),
      JSON.stringify(params.metadata ?? {})
    ]
  );
}

async function refreshSchedulePaths(visitId: string, serviceJobId?: string | null) {
  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/crew-itinerary");
  revalidatePath("/app/service");
  revalidatePath("/employee");
  if (serviceJobId) revalidatePath(`/app/service/jobs/${serviceJobId}`);
  revalidatePath(`/app/schedule#visit-${visitId}`);
}

export async function scheduleVisitAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = scheduleSchema.safeParse({
    visitId: formData.get("visitId"),
    scheduledStart: String(formData.get("scheduledStart") ?? ""),
    scheduledEnd: String(formData.get("scheduledEnd") ?? ""),
    serviceTypeId: String(formData.get("serviceTypeId") ?? "")
  });
  if (!parsed.success) return;

  const scheduledStart = toIso(parsed.data.scheduledStart);
  const scheduledEnd = toIso(parsed.data.scheduledEnd);
  if (!scheduledStart || !scheduledEnd || scheduledEnd <= scheduledStart) return;

  const tenantId = await getCurrentWorkspaceId();
  const priorResult = await queryPostgres<{
    status: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    service_job_id: string | null;
  }>(
    `
    select status, scheduled_start, scheduled_end, service_job_id
    from public.service_visits
    where tenant_id = $1 and id = $2 and not schedule_locked
    limit 1
    `,
    [tenantId, parsed.data.visitId]
  );
  const prior = priorResult?.rows[0];
  if (!prior) return;

  const serviceTypeResult = parsed.data.serviceTypeId
    ? await queryPostgres<{
        default_duration_minutes: number;
        required_crew_size: number;
        required_skills_json: unknown;
        required_certifications_json: unknown;
      }>(
        `
        select default_duration_minutes, required_crew_size,
               required_skills_json, required_certifications_json
        from public.service_types
        where tenant_id = $1 and id = $2 and active
        limit 1
        `,
        [tenantId, parsed.data.serviceTypeId]
      )
    : null;
  const serviceType = serviceTypeResult?.rows[0];

  const result = await queryPostgres<{ service_job_id: string | null }>(
    `
    update public.service_visits
    set scheduled_start = $3,
        scheduled_end = $4,
        arrival_window_start = $3,
        arrival_window_end = $4,
        status = case when status in ('unscheduled','tentative') then 'scheduled' else status end,
        service_type_id = coalesce($5::uuid, service_type_id),
        expected_duration_minutes = coalesce($6, expected_duration_minutes),
        required_crew_size = coalesce($7, required_crew_size),
        required_skills_json = coalesce($8::jsonb, required_skills_json),
        required_certifications_json = coalesce($9::jsonb, required_certifications_json),
        updated_at = now()
    where tenant_id = $1 and id = $2 and not schedule_locked
    returning service_job_id
    `,
    [
      tenantId,
      parsed.data.visitId,
      scheduledStart,
      scheduledEnd,
      parsed.data.serviceTypeId || null,
      serviceType?.default_duration_minutes ?? null,
      serviceType?.required_crew_size ?? null,
      serviceType ? JSON.stringify(serviceType.required_skills_json) : null,
      serviceType ? JSON.stringify(serviceType.required_certifications_json) : null
    ]
  );
  const row = result?.rows[0];
  if (!row) return;

  await queryPostgres(
    `
    update public.service_work_orders wo
    set status = case when wo.status in ('draft','approved','ready_to_schedule') then 'scheduled' else wo.status end,
        requested_start = $3, requested_end = $4, updated_at = now()
    from public.service_visits v
    where wo.tenant_id = $1 and v.tenant_id = wo.tenant_id
      and v.id = $2 and wo.id = v.work_order_id
    `,
    [tenantId, parsed.data.visitId, scheduledStart, scheduledEnd]
  );

  if (row.service_job_id) {
    await queryPostgres(
      `
      update public.service_jobs
      set status = case when status = 'unscheduled' then 'scheduled' else status end,
          scheduled_start = $3, scheduled_end = $4, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [tenantId, row.service_job_id, scheduledStart, scheduledEnd]
    );
  }

  await insertVisitEvent({
    tenantId,
    visitId: parsed.data.visitId,
    type: "visit_scheduled",
    title: prior.scheduled_start ? "Visit rescheduled" : "Visit scheduled",
    detail: "The visit received a reserved start and end time. Eligibility checks were refreshed.",
    previous: { status: prior.status, scheduledStart: prior.scheduled_start, scheduledEnd: prior.scheduled_end },
    next: { status: prior.status === "unscheduled" ? "scheduled" : prior.status, scheduledStart, scheduledEnd }
  });
  await evaluateVisitSchedule({ tenantId, visitId: parsed.data.visitId });
  await refreshSchedulePaths(parsed.data.visitId, row.service_job_id);
}

export async function assignVisitWorkerAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = assignmentSchema.safeParse({
    visitId: formData.get("visitId"),
    workerId: formData.get("workerId")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const visitResult = await queryPostgres<{
    service_job_id: string | null;
    customer_id: string;
    title: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    priority: string;
  }>(
    `
    select service_job_id, customer_id, title, scheduled_start, scheduled_end, priority
    from public.service_visits
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, parsed.data.visitId]
  );
  const visit = visitResult?.rows[0];
  if (!visit) return;

  const workerResult = await queryPostgres<{ name: string }>(
    `
    select name
    from public.operations_workers
    where tenant_id = $1 and id = $2 and availability_status <> 'inactive'
    limit 1
    `,
    [tenantId, parsed.data.workerId]
  );
  const worker = workerResult?.rows[0];
  if (!worker) return;

  const operationsResult = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_assignments (
      tenant_id, service_job_id, service_visit_id, customer_id, worker_id,
      title, scheduled_start, scheduled_end, status, priority,
      ai_dispatch_notes, metadata_json
    )
    select $1, $3, $2, $4, $5, $6, $7, $8, 'scheduled',
           case when $9 = 'emergency' then 'urgent' else $9 end,
           'Assignment created from the canonical dispatch board.',
           '{"source":"service_schedule"}'::jsonb
    where not exists (
      select 1 from public.operations_assignments a
      where a.tenant_id = $1 and a.service_visit_id = $2
        and a.worker_id = $5 and a.status <> 'archived'
    )
    returning id
    `,
    [
      tenantId,
      parsed.data.visitId,
      visit.service_job_id,
      visit.customer_id,
      parsed.data.workerId,
      visit.title,
      visit.scheduled_start,
      visit.scheduled_end,
      visit.priority
    ]
  );

  let operationsAssignmentId = operationsResult?.rows[0]?.id ?? null;
  if (!operationsAssignmentId) {
    const existingResult = await queryPostgres<{ id: string }>(
      `
      select id
      from public.operations_assignments
      where tenant_id = $1 and service_visit_id = $2 and worker_id = $3
        and status <> 'archived'
      limit 1
      `,
      [tenantId, parsed.data.visitId, parsed.data.workerId]
    );
    operationsAssignmentId = existingResult?.rows[0]?.id ?? null;
  }

  await queryPostgres(
    `
    insert into public.service_visit_assignments (
      tenant_id, visit_id, worker_id, operations_assignment_id, status,
      eligibility_snapshot_json, metadata_json
    )
    values ($1,$2,$3,$4,'assigned','{"evaluated":false}'::jsonb,'{"source":"service_schedule"}'::jsonb)
    on conflict (visit_id, worker_id) where worker_id is not null and status <> 'removed'
    do update set
      operations_assignment_id = coalesce(excluded.operations_assignment_id, public.service_visit_assignments.operations_assignment_id),
      status = 'assigned',
      removed_at = null,
      removal_reason = null,
      updated_at = now()
    `,
    [tenantId, parsed.data.visitId, parsed.data.workerId, operationsAssignmentId]
  );

  const conflicts = await evaluateVisitSchedule({ tenantId, visitId: parsed.data.visitId });
  await queryPostgres(
    `
    update public.service_visit_assignments
    set eligibility_snapshot_json = $4::jsonb, updated_at = now()
    where tenant_id = $1 and visit_id = $2 and worker_id = $3 and status <> 'removed'
    `,
    [
      tenantId,
      parsed.data.visitId,
      parsed.data.workerId,
      JSON.stringify({
        evaluatedAt: new Date().toISOString(),
        eligible: !conflicts.some((conflict) => conflict.severity === "blocking" && conflict.workerId === parsed.data.workerId),
        conflicts: conflicts.filter((conflict) => !conflict.workerId || conflict.workerId === parsed.data.workerId)
      })
    ]
  );

  await insertVisitEvent({
    tenantId,
    visitId: parsed.data.visitId,
    type: "worker_assigned",
    title: `${worker.name} assigned`,
    detail: "Ferocity checked schedule overlap, availability, time off, skills, certifications, and crew requirements.",
    next: { workerId: parsed.data.workerId, workerName: worker.name },
    metadata: { blockingConflicts: conflicts.filter((conflict) => conflict.severity === "blocking").length }
  });
  await refreshSchedulePaths(parsed.data.visitId, visit.service_job_id);
}

export async function updateVisitDispatchStatusAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = statusSchema.safeParse({
    visitId: formData.get("visitId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const conflicts = await evaluateVisitSchedule({ tenantId, visitId: parsed.data.visitId });
  const dispatching = ["dispatched", "en_route", "arrived", "in_progress"].includes(parsed.data.status);
  if (dispatching && conflicts.some((conflict) => conflict.severity === "blocking")) return;
  if (parsed.data.status === "completed") {
    const completion = await evaluateVisitCompletion({ tenantId, visitId: parsed.data.visitId });
    if (!completion.ready) return;
  }

  const result = await queryPostgres<{
    previous_status: string;
    service_job_id: string | null;
    work_order_id: string;
  }>(
    `
    with previous as (
      select id, status, service_job_id, work_order_id
      from public.service_visits
      where tenant_id = $1 and id = $2
    ),
    updated as (
      update public.service_visits v
      set status = $3,
          dispatched_at = case when $3 = 'dispatched' then coalesce(v.dispatched_at, now()) else v.dispatched_at end,
          actual_departed_at = case when $3 = 'en_route' then coalesce(v.actual_departed_at, now()) else v.actual_departed_at end,
          actual_arrived_at = case when $3 = 'arrived' then coalesce(v.actual_arrived_at, now()) else v.actual_arrived_at end,
          actual_started_at = case when $3 = 'in_progress' then coalesce(v.actual_started_at, now()) else v.actual_started_at end,
          actual_completed_at = case when $3 = 'completed' then coalesce(v.actual_completed_at, now()) else v.actual_completed_at end,
          updated_at = now()
      from previous p
      where v.tenant_id = $1 and v.id = p.id
      returning p.status as previous_status, v.service_job_id, v.work_order_id
    )
    select * from updated
    `,
    [tenantId, parsed.data.visitId, parsed.data.status]
  );
  const row = result?.rows[0];
  if (!row) return;

  if (row.service_job_id) {
    await queryPostgres(
      `
      update public.service_jobs
      set status = $3, updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [tenantId, row.service_job_id, legacyJobStatus(parsed.data.status)]
    );
  }
  await queryPostgres(
    `
    update public.service_work_orders
    set status = $3,
        completed_at = case when $3 = 'completed' then coalesce(completed_at, now()) else completed_at end,
        canceled_at = case when $3 = 'canceled' then coalesce(canceled_at, now()) else canceled_at end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      row.work_order_id,
      parsed.data.status === "completed"
        ? "completed"
        : parsed.data.status === "canceled" || parsed.data.status === "no_show"
          ? "canceled"
          : ["arrived", "in_progress", "paused"].includes(parsed.data.status)
            ? "in_progress"
            : "scheduled"
    ]
  );

  await insertVisitEvent({
    tenantId,
    visitId: parsed.data.visitId,
    type: "visit_status_changed",
    title: `Visit marked ${parsed.data.status.replaceAll("_", " ")}`,
    detail: "Dispatch status changed through the canonical schedule.",
    previous: { status: row.previous_status },
    next: { status: parsed.data.status }
  });
  await refreshSchedulePaths(parsed.data.visitId, row.service_job_id);
}

export async function scanScheduleConflictsAction() {
  await requirePermission("lead:manage");
  const tenantId = await getCurrentWorkspaceId();
  const visitsResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.service_visits
    where tenant_id = $1
      and status not in ('completed','canceled','no_show')
      and (status = 'unscheduled' or scheduled_start < now() + interval '60 days')
    order by scheduled_start nulls first
    limit 500
    `,
    [tenantId]
  );
  for (const visit of visitsResult?.rows ?? []) {
    await evaluateVisitSchedule({ tenantId, visitId: visit.id });
  }
  revalidatePath("/app/schedule");
  revalidatePath("/app");
}

export async function createCustomerVisitLinkAction(formData: FormData) {
  await requirePermission("lead:manage");
  const visitId = z.string().uuid().safeParse(formData.get("visitId"));
  if (!visitId.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const token = `visit_${randomBytes(24).toString("base64url")}`;
  const result = await queryPostgres<{ service_job_id: string | null }>(
    `
    with valid_visit as (
      select id, service_job_id
      from public.service_visits
      where tenant_id = $1 and id = $2
        and scheduled_start is not null
        and status not in ('completed','canceled','no_show')
    ),
    revoked as (
      update public.service_visit_customer_tokens
      set status = 'revoked', updated_at = now()
      where tenant_id = $1 and visit_id = $2 and status = 'active'
        and exists (select 1 from valid_visit)
    ),
    inserted as (
      insert into public.service_visit_customer_tokens (
        tenant_id, visit_id, public_token, status, expires_at, metadata_json
      )
      select $1, v.id, $3, 'active',
             greatest(v.scheduled_start + interval '7 days', now() + interval '30 days'),
             '{"source":"schedule_board"}'::jsonb
      from public.service_visits v
      where v.tenant_id = $1 and v.id = $2 and exists (select 1 from valid_visit)
      returning visit_id
    ),
    updated as (
      update public.service_visits v
      set customer_confirmation_status = 'pending', updated_at = now()
      from inserted i
      where v.tenant_id = $1 and v.id = i.visit_id
      returning v.service_job_id
    )
    select service_job_id from updated
    `,
    [tenantId, visitId.data, token]
  );
  const row = result?.rows[0];
  if (!row) return;

  await insertVisitEvent({
    tenantId,
    visitId: visitId.data,
    type: "customer_confirmation_requested",
    title: "Customer appointment link created",
    detail: "A revocable link was created for the customer to confirm or request a schedule change.",
    next: { customerConfirmationStatus: "pending" }
  });
  await refreshSchedulePaths(visitId.data, row.service_job_id);
}
