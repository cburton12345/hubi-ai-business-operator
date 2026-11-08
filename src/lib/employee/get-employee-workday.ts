import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { getEmployeeAccessContext } from "@/lib/employee/employee-access";

function dateTime(value: Date | null, language: "en" | "es" = "en") {
  if (!value) return language === "es" ? "Sin horario" : "Not scheduled";
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function money(cents: number, language: "en" | "es", currency = "USD") {
  try {
    return new Intl.NumberFormat(language === "es" ? "es-US" : "en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export async function getEmployeeWorkday() {
  const access = await getEmployeeAccessContext();
  if (!access.workerId) {
    return {
      access,
      metrics: { workingNow: 0, scheduledToday: 0, openAssignments: 0, needsReview: 0 },
      workers: [],
      assignments: [],
      openTimeEntry: null,
      timeEntries: [],
      cashAdvances: [],
      payBalance: { grossEstimate: "$0.00", confirmedAllocations: "$0.00", netPayableEstimate: "$0.00", outstandingAuthorizedBalance: "$0.00",todayHours: "0.00" },
      language: "en" as const
    };
  }

  const [metricsResult, workerResult, assignmentsResult, timeResult, recentTimeResult, advancesResult, payBalanceResult] = await Promise.all([
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
      preferred_language: "en" | "es";
      hourly_rate_cents: number;
    }>(
      `
      select id, name, role_type, trade, availability_status, preferred_language, hourly_rate_cents
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
      task_list_json: unknown;
    }>(
      `
      select a.id, a.service_visit_id, a.title, w.name as worker, c.name as crew, a.jobsite,
        a.scheduled_start, a.scheduled_end, a.status, a.priority,
        jsonb_array_length(a.task_list_json) as task_count, a.task_list_json
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
    queryPostgres<{ id: string; assignment_id: string | null; clock_in_at: Date; break_started_at: Date | null; break_seconds: number }>(
      `
      select id,assignment_id,clock_in_at,break_started_at,break_seconds
      from public.operations_time_entries
      where tenant_id = $1 and worker_id = $2 and status = 'open'
      order by clock_in_at desc
      limit 1
      `,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{
      id: string; assignment: string | null; clock_in_at: Date; clock_out_at: Date | null;
      clock_in_location: string | null; clock_out_location: string | null; break_minutes: number;
      break_seconds: number;break_started_at: Date | null;notes: string | null; status: string;
    }>(
      `select time.id, assignment.title as assignment, time.clock_in_at, time.clock_out_at,
              time.clock_in_location,time.clock_out_location,time.break_minutes,time.break_seconds,time.break_started_at,time.notes,time.status
       from public.operations_time_entries time
       left join public.operations_assignments assignment
         on assignment.id = time.assignment_id and assignment.tenant_id = time.tenant_id
       where time.tenant_id = $1 and time.worker_id = $2
       order by time.clock_in_at desc limit 14`,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{
      id: string; amount_cents: number; advanced_at: string; payment_method: string;
      purpose: string | null; status: string; employee_response_note: string | null;
      entry_kind: string; currency: string; is_worker_debt: boolean; approval_status: string;
      worker_authorization_status: string; repayment_terms: string | null; receipt_url: string | null;
      recovered_cents: string; outstanding_cents: string;
    }>(
      `select advance.id,advance.amount_cents,advance.advanced_at::text,advance.payment_method,
              advance.purpose,advance.status,advance.employee_response_note,advance.entry_kind,
              advance.currency,advance.is_worker_debt,advance.approval_status,
              advance.worker_authorization_status,advance.repayment_terms,advance.receipt_url,
              (coalesce((select sum(amount_cents) from public.employee_advance_repayments repayment
                         where repayment.tenant_id=advance.tenant_id and repayment.advance_id=advance.id and repayment.status='recorded'),0)
               + coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations allocation
                           where allocation.tenant_id=advance.tenant_id and allocation.advance_id=advance.id and allocation.status='confirmed'),0))::text as recovered_cents,
              greatest(0,advance.amount_cents
               - coalesce((select sum(amount_cents) from public.employee_advance_repayments repayment
                           where repayment.tenant_id=advance.tenant_id and repayment.advance_id=advance.id and repayment.status='recorded'),0)
               - coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations allocation
                           where allocation.tenant_id=advance.tenant_id and allocation.advance_id=advance.id and allocation.status='confirmed'),0))::text as outstanding_cents
       from public.employee_cash_advances advance
       where advance.tenant_id=$1 and advance.worker_id=$2 and advance.status <> 'void'
       order by advance.advanced_at desc,advance.created_at desc limit 20`,
      [access.tenantId, access.workerId]
    ),
    queryPostgres<{ gross_cents: string; allocated_cents: string; outstanding_cents: string; today_minutes: string }>(
      `with settings as (
         select coalesce((select timezone from public.workspace_settings where tenant_id=$1),'America/Los_Angeles') as timezone
       ), bounds as (
         select ((now() at time zone timezone)::date::timestamp at time zone timezone) as starts_at,
                (((now() at time zone timezone)::date+1)::timestamp at time zone timezone) as ends_at,
                date_trunc('week',now() at time zone timezone)::date as week_starts
         from settings
       ), period as (
         select week_starts as starts,(week_starts+6) as ends from bounds
       ), worked as (
         select coalesce(sum(greatest(0,extract(epoch from (clock_out_at-clock_in_at))/60-break_minutes)),0) as minutes
         from public.operations_time_entries,period,settings
         where tenant_id=$1 and worker_id=$2 and status in ('needs_review','approved','exported')
           and (clock_in_at at time zone settings.timezone)::date between period.starts and period.ends
       )
       select round((worked.minutes/60.0) * worker.hourly_rate_cents)::text as gross_cents,
              coalesce((select sum(greatest(0,extract(epoch from (
                  least(coalesce(entry.clock_out_at,now()),bounds.ends_at)-greatest(entry.clock_in_at,bounds.starts_at)))/60
                - coalesce((select sum(greatest(0,extract(epoch from (
                    least(coalesce((select min(ended.occurred_at) from public.operations_time_entry_events ended
                      where ended.tenant_id=started.tenant_id and ended.time_entry_id=started.time_entry_id
                        and ended.event_type='break_ended' and ended.occurred_at>started.occurred_at),coalesce(entry.clock_out_at,now())),bounds.ends_at)
                    - greatest(started.occurred_at,bounds.starts_at)))/60))
                    from public.operations_time_entry_events started
                    where started.tenant_id=entry.tenant_id and started.time_entry_id=entry.id
                      and started.event_type='break_started' and started.occurred_at<bounds.ends_at),
                  case when entry.clock_in_at>=bounds.starts_at and coalesce(entry.clock_out_at,now())<=bounds.ends_at then entry.break_seconds/60.0 else 0 end)))
                from public.operations_time_entries entry,bounds where entry.tenant_id=$1 and entry.worker_id=$2
                  and entry.clock_in_at<bounds.ends_at and coalesce(entry.clock_out_at,now())>=bounds.starts_at),0)::text as today_minutes,
              coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations,period
                        where tenant_id=$1 and worker_id=$2 and status='confirmed' and currency='USD'
                          and pay_period_start=period.starts and pay_period_end=period.ends),0)::text as allocated_cents,
              coalesce((select sum(greatest(0,advance.amount_cents
                - coalesce((select sum(amount_cents) from public.employee_advance_repayments r where r.tenant_id=advance.tenant_id and r.advance_id=advance.id and r.status='recorded'),0)
                - coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations a where a.tenant_id=advance.tenant_id and a.advance_id=advance.id and a.status='confirmed'),0)))
                from public.employee_cash_advances advance
                where advance.tenant_id=$1 and advance.worker_id=$2 and advance.is_worker_debt=true
                  and advance.approval_status='approved' and advance.worker_authorization_status='authorized'
                  and advance.currency='USD'
                  and advance.status <> 'void'),0)::text as outstanding_cents
       from worked
       join public.operations_workers worker on worker.tenant_id=$1 and worker.id=$2`,
      [access.tenantId,access.workerId]
    )
  ]);

  const metric = metricsResult?.rows[0];
  const worker = workerResult?.rows[0];
  const language = worker?.preferred_language === "es" ? "es" : "en";
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
        }]
      : [],
    assignments: (assignmentsResult?.rows ?? []).map((row) => ({
      id: row.id,
      serviceVisitId: row.service_visit_id,
      title: row.title,
      worker: row.worker ?? access.workerName ?? "Assigned employee",
      crew: row.crew ?? "No crew",
      jobsite: row.jobsite ?? "No jobsite",
      schedule: `${dateTime(row.scheduled_start, language)} - ${row.scheduled_end ? dateTime(row.scheduled_end, language) : language === "es" ? "abierto" : "open"}`,
      status: row.status,
      priority: row.priority,
      tasks: Number(row.task_count ?? 0),
      taskList: Array.isArray(row.task_list_json)
        ? row.task_list_json.slice(0, 50).map((task, index) => {
            const item = task && typeof task === "object" && !Array.isArray(task)
              ? task as Record<string, unknown>
              : {};
            return {
              index,
              title: typeof item.title === "string" && item.title.trim()
                ? item.title.trim().slice(0, 240)
                : `${language === "es" ? "Tarea" : "Task"} ${index + 1}`,
              status: item.status === "done" ? "done" as const : "open" as const
            };
          })
        : [],
    })),
    openTimeEntry: timeResult?.rows[0]
      ? {
          id: timeResult.rows[0].id,
          assignmentId: timeResult.rows[0].assignment_id,
          clockIn: dateTime(timeResult.rows[0].clock_in_at, language),
          onBreak: timeResult.rows[0].break_started_at !== null,
          breakStartedAt: dateTime(timeResult.rows[0].break_started_at,language),
          breakSeconds: timeResult.rows[0].break_seconds
        }
      : null,
    timeEntries: (recentTimeResult?.rows ?? []).map((row) => {
      const end = row.clock_out_at ?? new Date();
      const activeBreakSeconds = row.break_started_at ? Math.max(0,(end.getTime()-row.break_started_at.getTime())/1000) : 0;
      const hours = Math.max(0,(end.getTime()-row.clock_in_at.getTime())/36e5-(row.break_seconds+activeBreakSeconds)/3600).toFixed(2);
      return {
        id: row.id,
        assignment: row.assignment ?? (language === "es" ? "Sin trabajo seleccionado" : "No job selected"),
        clockIn: dateTime(row.clock_in_at, language),
        clockOut: row.clock_out_at ? dateTime(row.clock_out_at, language) : language === "es" ? "Trabajando ahora" : "Working now",
        startLocation: row.clock_in_location ?? "—",
        endLocation: row.clock_out_location ?? "—",
        hours,
        notes: row.notes ?? (language === "es" ? "Sin nota de trabajo" : "No work note"),
        status: row.status
      };
    }),
    cashAdvances: (advancesResult?.rows ?? []).map((row) => ({
      id: row.id,
      amount: money(row.amount_cents, language, row.currency),
      advancedAt: row.advanced_at,
      paymentMethod: row.payment_method,
      purpose: row.purpose ?? (language === "es" ? "Sin nota" : "No note"),
      status: row.status,
      responseNote: row.employee_response_note ?? "",
      entryKind: row.entry_kind,
      currency: row.currency,
      isWorkerDebt: row.is_worker_debt,
      approvalStatus: row.approval_status,
      workerAuthorizationStatus: row.worker_authorization_status,
      repaymentTerms: row.repayment_terms ?? "",
      receiptUrl: row.receipt_url,
      recovered: money(Number(row.recovered_cents), language, row.currency),
      outstanding: money(Number(row.outstanding_cents), language, row.currency)
    })),
    payBalance: (() => {
      const row = payBalanceResult?.rows[0];
      const gross = Number(row?.gross_cents ?? 0);
      const allocated = Number(row?.allocated_cents ?? 0);
      return {
        grossEstimate: money(gross, language),
        confirmedAllocations: money(allocated, language),
        netPayableEstimate: money(Math.max(0, gross - allocated), language),
        outstandingAuthorizedBalance: money(Number(row?.outstanding_cents ?? 0), language)
        ,todayHours: (Number(row?.today_minutes ?? 0)/60).toFixed(2)
      };
    })(),
    language
  };
}
