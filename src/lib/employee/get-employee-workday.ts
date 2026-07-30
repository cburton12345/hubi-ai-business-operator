import { queryPostgres } from "@/lib/db/postgres";
import { getEmployeeAccessContext } from "@/lib/employee/employee-access";

function dateTime(value: Date | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export async function getEmployeeWorkday() {
  const access = await getEmployeeAccessContext();
  if (!access.workerId) {
    return {
      access,
      metrics: { workingNow: 0, scheduledToday: 0, openAssignments: 0, needsReview: 0 },
      workers: [],
      assignments: [],
      openTimeEntry: null
    };
  }

  const [metricsResult, workerResult, assignmentsResult, timeResult] = await Promise.all([
    queryPostgres<{
      working_now: string;
      scheduled_today: string;
      open_assignments: string;
      needs_review: string;
    }>(
      `
      select
        (select count(*) from public.operations_time_entries where tenant_id = $1 and worker_id = $2 and status = 'open')::text as working_now,
        (
          select count(*)
          from public.operations_assignments a
          where a.tenant_id = $1
            and a.scheduled_start::date = current_date
            and a.status <> 'archived'
            and (
              a.worker_id = $2
              or exists (
                select 1 from public.operations_crew_members cm
                where cm.tenant_id = a.tenant_id and cm.crew_id = a.crew_id and cm.worker_id = $2
              )
              or exists (
                select 1 from public.service_visit_assignments va
                where va.tenant_id = a.tenant_id and va.visit_id = a.service_visit_id and va.worker_id = $2
              )
            )
        )::text as scheduled_today,
        (
          select count(*)
          from public.operations_assignments a
          where a.tenant_id = $1
            and a.status in ('scheduled','in_progress','blocked','missed')
            and (
              a.worker_id = $2
              or exists (
                select 1 from public.operations_crew_members cm
                where cm.tenant_id = a.tenant_id and cm.crew_id = a.crew_id and cm.worker_id = $2
              )
              or exists (
                select 1 from public.service_visit_assignments va
                where va.tenant_id = a.tenant_id and va.visit_id = a.service_visit_id and va.worker_id = $2
              )
            )
        )::text as open_assignments,
        (
          (select count(*) from public.operations_expenses where tenant_id = $1 and worker_id = $2 and status = 'needs_review') +
          (select count(*) from public.operations_mileage_entries where tenant_id = $1 and worker_id = $2 and status = 'needs_review') +
          (select count(*) from public.operations_field_media where tenant_id = $1 and worker_id = $2 and status = 'needs_review')
        )::text as needs_review
      `,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      role_type: string;
      trade: string | null;
      availability_status: string;
      hourly_rate_cents: number;
    }>(
      `
      select id, name, role_type, trade, availability_status, hourly_rate_cents
      from public.operations_workers
      where tenant_id = $1 and id = $2 and availability_status <> 'inactive'
      limit 1
      `,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{
      id: string;
      service_visit_id: string | null;
      title: string;
      worker: string | null;
      crew: string | null;
      jobsite: string | null;
      scheduled_start: Date | null;
      scheduled_end: Date | null;
      status: string;
      priority: string;
      task_count: string;
      ai_dispatch_notes: string | null;
    }>(
      `
      select a.id, a.service_visit_id, a.title, w.name as worker, c.name as crew, a.jobsite,
        a.scheduled_start, a.scheduled_end, a.status, a.priority,
        jsonb_array_length(a.task_list_json) as task_count, a.ai_dispatch_notes
      from public.operations_assignments a
      left join public.operations_workers w on w.id = a.worker_id and w.tenant_id = a.tenant_id
      left join public.operations_crews c on c.id = a.crew_id and c.tenant_id = a.tenant_id
      where a.tenant_id = $1
        and a.status <> 'archived'
        and (
          a.worker_id = $2
          or exists (
            select 1 from public.operations_crew_members cm
            where cm.tenant_id = a.tenant_id and cm.crew_id = a.crew_id and cm.worker_id = $2
          )
          or exists (
            select 1 from public.service_visit_assignments va
            where va.tenant_id = a.tenant_id and va.visit_id = a.service_visit_id and va.worker_id = $2
          )
        )
      order by coalesce(a.scheduled_start, a.created_at)
      limit 30
      `,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{ id: string; assignment_id: string | null; clock_in_at: Date }>(
      `
      select id, assignment_id, clock_in_at
      from public.operations_time_entries
      where tenant_id = $1 and worker_id = $2 and status = 'open'
      order by clock_in_at desc
      limit 1
      `,
      [access.tenantId, access.workerId]
    )
  ]);

  const metric = metricsResult?.rows[0];
  const worker = workerResult?.rows[0];
  return {
    access,
    metrics: {
      workingNow: Number(metric?.working_now ?? 0),
      scheduledToday: Number(metric?.scheduled_today ?? 0),
      openAssignments: Number(metric?.open_assignments ?? 0),
      needsReview: Number(metric?.needs_review ?? 0)
    },
    workers: worker
      ? [{
          id: worker.id,
          name: worker.name,
          roleType: worker.role_type,
          trade: worker.trade ?? "General",
          status: worker.availability_status,
          hourlyRate: worker.hourly_rate_cents ? `$${(worker.hourly_rate_cents / 100).toFixed(2)}` : "No rate"
        }]
      : [],
    assignments: (assignmentsResult?.rows ?? []).map((row) => ({
      id: row.id,
      serviceVisitId: row.service_visit_id,
      title: row.title,
      worker: row.worker ?? access.workerName ?? "Assigned employee",
      crew: row.crew ?? "No crew",
      jobsite: row.jobsite ?? "No jobsite",
      schedule: `${dateTime(row.scheduled_start)} - ${row.scheduled_end ? dateTime(row.scheduled_end) : "open"}`,
      status: row.status,
      priority: row.priority,
      tasks: Number(row.task_count ?? 0),
      aiNotes: row.ai_dispatch_notes ?? "No dispatch recommendation."
    })),
    openTimeEntry: timeResult?.rows[0]
      ? {
          id: timeResult.rows[0].id,
          assignmentId: timeResult.rows[0].assignment_id,
          clockIn: dateTime(timeResult.rows[0].clock_in_at)
        }
      : null
  };
}
