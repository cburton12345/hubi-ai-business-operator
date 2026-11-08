import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function currencyAmount(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function n(value: unknown) {
  return Number(value ?? 0);
}

function assignmentTasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((task, index) => {
    const item = task && typeof task === "object" && !Array.isArray(task)
      ? task as Record<string, unknown>
      : {};
    return {
      index,
      title: typeof item.title === "string" && item.title.trim()
        ? item.title.trim().slice(0, 240)
        : `Task ${index + 1}`,
      status: item.status === "done" ? "done" as const : "open" as const
    };
  });
}

export type OperationsWorkforceDashboard = {
  employeeJoin: { companyCode: string; joinPath: string };
  metrics: {
    workingNow: number;
    scheduledToday: number;
    openAssignments: number;
    needsReview: number;
    payrollHours: number;
    expenses: string;
    mileage: number;
    jobCost: string;
    fieldProof: number;
    customerDrafts: number;
    payrollExports: number;
    recurringExpenses: number;
    recurringDue: number;
  };
  workers: { id: string; name: string; roleType: string; trade: string; status: string; hourlyRate: string; email: string; language: string; access: string; clockStatus: string; openTimeEntryId: string | null; todayHours: string }[];
  assignments: { id: string; serviceVisitId: string | null; title: string; worker: string; crew: string; jobsite: string; schedule: string; status: string; priority: string; tasks: number; taskList: { index: number; title: string; status: "open" | "done" }[]; aiNotes: string }[];
  timeEntries: { id: string; workerId: string | null; worker: string; assignment: string; clockIn: string; clockOut: string; clockInIso: string; clockOutIso: string; breakMinutes: number; hours: string; status: string; verified: string; onBreak: boolean }[];
  expenses: { id: string; vendor: string; amount: string; category: string; status: string; worker: string; summary: string }[];
  mileage: { id: string; worker: string; route: string; miles: string; vehicle: string; status: string }[];
  materials: { id: string; material: string; quantity: string; logType: string; cost: string; status: string }[];
  locationPings: { id: string; worker: string; assignment: string; location: string; source: string; status: string }[];
  fieldMedia: { id: string; title: string; type: string; worker: string; summary: string; consent: string; status: string }[];
  payrollExports: { id: string; provider: string; period: string; hours: string; status: string; notes: string }[];
  customerDrafts: { id: string; channel: string; recipient: string; subject: string; body: string; status: string }[];
  receiptExtractions: { id: string; vendor: string; total: string; confidence: string; status: string }[];
  recurringExpenses: { id: string; vendor: string; amount: string; cadence: string; nextDueDate: string; category: string; mode: string; status: string }[];
  cashAdvances: {
    id: string; workerId: string; worker: string; amount: string; date: string; method: string; purpose: string; status: string;
    entryKind: string; currency: string; isWorkerDebt: boolean; approvalStatus: string;
    workerAuthorizationStatus: string; repaymentTerms: string; receiptUrl: string | null;
    recovered: string; outstanding: string;
  }[];
  employeeAccessRequests: { id: string; name: string; email: string; phone: string; language: string; requestedAt: string; status: string }[];
  providers: { id: string; provider: string; type: string; status: string }[];
  aiDispatcher: { title: string; detail: string; priority: "low" | "normal" | "high"; action: string }[];
  roleViews: { role: string; sees: string[] }[];
};

function dateTime(value: Date | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function hoursBetween(start: Date,end: Date | null,breaks: number,breakSeconds?: number,breakStartedAt?: Date | null) {
  const stop = end ?? new Date();
  const activeBreakSeconds = breakStartedAt ? Math.max(0,(stop.getTime()-breakStartedAt.getTime())/1000) : 0;
  const effectiveBreakSeconds = breakSeconds === undefined ? breaks*60 : breakSeconds+activeBreakSeconds;
  return Math.max(0,(stop.getTime()-start.getTime())/36e5-effectiveBreakSeconds/3600).toFixed(2);
}

export async function getOperationsWorkforceDashboard(): Promise<OperationsWorkforceDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const workspaceResult = await queryPostgres<{ slug: string }>("select slug from public.tenants where id = $1 limit 1", [tenantId]);
  const companyCode = workspaceResult?.rows[0]?.slug ?? "";
  const [
    metricsResult,
    workersResult,
    assignmentsResult,
    timeResult,
    expensesResult,
    mileageResult,
    materialsResult,
    locationResult,
    mediaResult,
    payrollResult,
    customerDraftResult,
    providerResult,
    receiptExtractionResult,
    recurringExpenseResult,
    cashAdvanceResult,
    employeeAccessRequestResult
  ] = await Promise.all([
    queryPostgres<{
      working_now: string;
      scheduled_today: string;
      open_assignments: string;
      needs_review: string;
      payroll_hours: string;
      expenses_cents: string;
      mileage: string;
      job_cost_cents: string;
      field_proof: string;
      customer_drafts: string;
      payroll_exports: string;
      recurring_expenses: string;
      recurring_due: string;
    }>(
      `
      select
        (select count(*) from public.operations_time_entries where tenant_id = $1 and status = 'open')::text as working_now,
        (select count(*) from public.operations_assignments where tenant_id = $1 and scheduled_start::date = current_date and status <> 'archived')::text as scheduled_today,
        (select count(*) from public.operations_assignments where tenant_id = $1 and status in ('scheduled','in_progress','blocked','missed'))::text as open_assignments,
        (
          (select count(*) from public.operations_expenses where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_mileage_entries where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_material_logs where tenant_id = $1 and status = 'needs_review')
        )::text as needs_review,
        coalesce((select sum(extract(epoch from (coalesce(clock_out_at, now()) - clock_in_at)) / 3600 - (break_minutes::numeric / 60)) from public.operations_time_entries where tenant_id = $1 and clock_in_at >= date_trunc('week', now())), 0)::text as payroll_hours,
        coalesce((select sum(amount_cents + tax_cents) from public.operations_expenses where tenant_id = $1), 0)::text as expenses_cents,
        coalesce((select sum(miles) from public.operations_mileage_entries where tenant_id = $1), 0)::text as mileage,
        (
          coalesce((select sum(amount_cents + tax_cents) from public.operations_expenses where tenant_id = $1 and status <> 'rejected'), 0) +
          coalesce((select sum(cost_cents) from public.operations_material_logs where tenant_id = $1 and status <> 'rejected'), 0)
        )::text as job_cost_cents,
        (select count(*) from public.operations_field_media where tenant_id = $1 and status = 'needs_review')::text as field_proof,
        (select count(*) from public.operations_customer_update_drafts where tenant_id = $1 and send_status = 'draft')::text as customer_drafts,
        (select count(*) from public.operations_payroll_exports where tenant_id = $1 and status in ('draft','ready'))::text as payroll_exports,
        (select count(*) from public.recurring_operating_expenses where tenant_id = $1 and status = 'active')::text as recurring_expenses,
        (select count(*) from public.recurring_operating_expenses where tenant_id = $1 and status = 'active' and next_due_date <= current_date + interval '7 days')::text as recurring_due
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string; role_type: string; trade: string | null; availability_status: string; hourly_rate_cents: number; email: string | null; preferred_language: string; user_id: string | null; open_time_entry_id: string | null; break_started_at: Date | null; today_hours: string }>(
      `
      select worker.id,worker.name,worker.role_type,worker.trade,worker.availability_status,
        worker.hourly_rate_cents,worker.email,worker.preferred_language,worker.user_id,
        open_entry.id as open_time_entry_id,open_entry.break_started_at,
        coalesce((select sum(greatest(0,extract(epoch from (
          least(coalesce(entry.clock_out_at,now()),bounds.ends_at)-greatest(entry.clock_in_at,bounds.starts_at)))
          - coalesce((select sum(greatest(0,extract(epoch from (
              least(coalesce((select min(ended.occurred_at) from public.operations_time_entry_events ended
                where ended.tenant_id=started.tenant_id and ended.time_entry_id=started.time_entry_id
                  and ended.event_type='break_ended' and ended.occurred_at>started.occurred_at),coalesce(entry.clock_out_at,now())),bounds.ends_at)
              - greatest(started.occurred_at,bounds.starts_at)))))
              from public.operations_time_entry_events started
              where started.tenant_id=entry.tenant_id and started.time_entry_id=entry.id
                and started.event_type='break_started' and started.occurred_at<bounds.ends_at),
            case when entry.clock_in_at>=bounds.starts_at and coalesce(entry.clock_out_at,now())<=bounds.ends_at then entry.break_seconds else 0 end))/3600.0)
          from public.operations_time_entries entry
          where entry.tenant_id=worker.tenant_id and entry.worker_id=worker.id
            and entry.clock_in_at<bounds.ends_at and coalesce(entry.clock_out_at,now())>=bounds.starts_at),0)::text as today_hours
      from public.operations_workers worker
      cross join lateral (
        select ((now() at time zone settings.timezone)::date::timestamp at time zone settings.timezone) as starts_at,
               (((now() at time zone settings.timezone)::date+1)::timestamp at time zone settings.timezone) as ends_at
        from (select coalesce((select timezone from public.workspace_settings where tenant_id=$1),'America/Los_Angeles') as timezone) settings
      ) bounds
      left join lateral (
        select time.id,time.break_started_at from public.operations_time_entries time
        where time.tenant_id=worker.tenant_id and time.worker_id=worker.id and time.status='open'
        order by time.clock_in_at desc limit 1
      ) open_entry on true
      where worker.tenant_id = $1 and worker.availability_status <> 'inactive'
      order by worker.name
      limit 20
      `,
      [tenantId]
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
      ai_dispatch_notes: string | null;
    }>(
      `
      select a.id, a.service_visit_id, a.title, w.name as worker, c.name as crew, a.jobsite, a.scheduled_start, a.scheduled_end,
        a.status, a.priority, jsonb_array_length(a.task_list_json) as task_count, a.task_list_json, a.ai_dispatch_notes
      from public.operations_assignments a
      left join public.operations_workers w on w.id = a.worker_id
      left join public.operations_crews c on c.id = a.crew_id
      where a.tenant_id = $1 and a.status <> 'archived'
      order by coalesce(a.scheduled_start, a.created_at) desc
      limit 20
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      worker: string | null;
      assignment: string | null;
      clock_in_at: Date;
      clock_out_at: Date | null;
      break_minutes: number;
      status: string;
      gps_verified: boolean;
      qr_verified: boolean;
      worker_id: string | null;
      break_started_at: Date | null;
      break_seconds: number;
    }>(
      `
      select t.id,t.worker_id,w.name as worker,a.title as assignment,t.clock_in_at,t.clock_out_at,
        t.break_minutes,t.break_seconds,t.break_started_at,t.status,t.gps_verified,t.qr_verified
      from public.operations_time_entries t
      left join public.operations_workers w on w.id = t.worker_id
      left join public.operations_assignments a on a.id = t.assignment_id
      where t.tenant_id = $1
      order by t.clock_in_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; vendor: string | null; amount_cents: number; tax_cents: number; category: string; status: string; reimbursement_status: string; worker: string | null; ai_summary: string | null }>(
      `
      select e.id, e.vendor, e.amount_cents, e.tax_cents, e.category, e.status, e.reimbursement_status, w.name as worker, e.ai_summary
      from public.operations_expenses e
      left join public.operations_workers w on w.id = e.worker_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; worker: string | null; start_location: string | null; end_location: string | null; miles: string; vehicle_label: string | null; status: string }>(
      `
      select m.id, w.name as worker, m.start_location, m.end_location, m.miles::text, m.vehicle_label, m.status
      from public.operations_mileage_entries m
      left join public.operations_workers w on w.id = m.worker_id
      where m.tenant_id = $1
      order by m.entry_date desc, m.created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; material_name: string; quantity: string | null; unit: string | null; log_type: string; cost_cents: number; status: string }>(
      `
      select id, material_name, quantity::text, unit, log_type, cost_cents, status
      from public.operations_material_logs
      where tenant_id = $1
      order by created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; worker: string | null; assignment: string | null; location_label: string | null; ping_source: string; alert_status: string }>(
      `
      select p.id, w.name as worker, a.title as assignment, p.location_label, p.ping_source, p.alert_status
      from public.operations_location_pings p
      left join public.operations_workers w on w.id = p.worker_id
      left join public.operations_assignments a on a.id = p.assignment_id
      where p.tenant_id = $1
      order by p.pinged_at desc
      limit 8
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; title: string; media_type: string; worker: string | null; ai_summary: string | null; consent_status: string; status: string }>(
      `
      select m.id, m.title, m.media_type, w.name as worker, m.ai_summary, m.consent_status, m.status
      from public.operations_field_media m
      left join public.operations_workers w on w.id = m.worker_id
      where m.tenant_id = $1
      order by m.created_at desc
      limit 8
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; provider: string; period_start: Date; period_end: Date; total_hours: string; status: string; notes: string | null }>(
      `
      select id, provider, period_start, period_end, total_hours::text, status, notes
      from public.operations_payroll_exports
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; channel: string; recipient_contact: string | null; subject: string | null; body: string; send_status: string }>(
      `
      select id, channel, recipient_contact, subject, body, send_status
      from public.operations_customer_update_drafts
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; provider_key: string; provider_type: string; status: string }>(
      `
      select id, provider_key, provider_type, status
      from public.operations_provider_settings
      where tenant_id = $1
      order by provider_type, provider_key
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; vendor: string | null; extracted_total_cents: number; confidence: string; status: string }>(
      `
      select id, vendor, extracted_total_cents, confidence::text, status
      from public.operations_receipt_extractions
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      vendor: string;
      amount_cents: number;
      tax_cents: number;
      cadence: string;
      next_due_date: string | null;
      category: string;
      autopost_mode: string;
      status: string;
    }>(
      `
      select id, vendor, amount_cents, tax_cents, cadence, next_due_date::text, category, autopost_mode, status
      from public.recurring_operating_expenses
      where tenant_id = $1 and status <> 'archived'
      order by
        case when status = 'active' then 0 when status = 'paused' then 1 else 2 end,
        next_due_date nulls last,
        vendor
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string; worker_id: string; worker: string; amount_cents: number; advanced_at: string; payment_method: string;
      purpose: string | null; status: string; entry_kind: string; currency: string; is_worker_debt: boolean;
      approval_status: string; worker_authorization_status: string; repayment_terms: string | null;
      receipt_url: string | null; recovered_cents: string; outstanding_cents: string;
    }>(
      `select advance.id,advance.worker_id,worker.name as worker,advance.amount_cents,advance.advanced_at::text,
              advance.payment_method,advance.purpose,advance.status,advance.entry_kind,advance.currency,
              advance.is_worker_debt,advance.approval_status,advance.worker_authorization_status,
              advance.repayment_terms,advance.receipt_url,
              (coalesce((select sum(amount_cents) from public.employee_advance_repayments repayment where repayment.tenant_id=advance.tenant_id and repayment.advance_id=advance.id and repayment.status='recorded'),0)
               + coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations allocation where allocation.tenant_id=advance.tenant_id and allocation.advance_id=advance.id and allocation.status='confirmed'),0))::text as recovered_cents,
              greatest(0,advance.amount_cents
               - coalesce((select sum(amount_cents) from public.employee_advance_repayments repayment where repayment.tenant_id=advance.tenant_id and repayment.advance_id=advance.id and repayment.status='recorded'),0)
               - coalesce((select sum(amount_cents) from public.employee_advance_pay_allocations allocation where allocation.tenant_id=advance.tenant_id and allocation.advance_id=advance.id and allocation.status='confirmed'),0))::text as outstanding_cents
       from public.employee_cash_advances advance
       join public.operations_workers worker on worker.id = advance.worker_id and worker.tenant_id = advance.tenant_id
       where advance.tenant_id = $1 and advance.status <> 'void'
       order by advance.advanced_at desc, advance.created_at desc limit 20`,
      [tenantId]
    ),
    queryPostgres<{
      id: string; name: string; email: string; phone: string | null; preferred_language: string;
      created_at: Date; status: string;
    }>(
      `select id, name, email, phone, preferred_language, created_at, status
       from public.employee_access_requests
       where tenant_id = $1 and status = 'pending'
       order by created_at asc limit 30`,
      [tenantId]
    )
  ]);
  const metrics = metricsResult?.rows[0];
  const openAssignments = n(metrics?.open_assignments);
  const review = n(metrics?.needs_review);
  const workingNow = n(metrics?.working_now);

  return {
    employeeJoin: {
      companyCode,
      joinPath: `/employee/join?company=${encodeURIComponent(companyCode)}`
    },
    metrics: {
      workingNow,
      scheduledToday: n(metrics?.scheduled_today),
      openAssignments,
      needsReview: review,
      payrollHours: Math.round(n(metrics?.payroll_hours) * 10) / 10,
      expenses: dollars(n(metrics?.expenses_cents)),
      mileage: Math.round(n(metrics?.mileage) * 10) / 10,
      jobCost: dollars(n(metrics?.job_cost_cents)),
      fieldProof: n(metrics?.field_proof),
      customerDrafts: n(metrics?.customer_drafts),
      payrollExports: n(metrics?.payroll_exports),
      recurringExpenses: n(metrics?.recurring_expenses),
      recurringDue: n(metrics?.recurring_due)
    },
    workers: (workersResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      roleType: row.role_type,
      trade: row.trade ?? "General",
      status: row.availability_status,
      hourlyRate: row.hourly_rate_cents ? dollars(row.hourly_rate_cents) : "No rate",
      email: row.email ?? "No email",
      language: row.preferred_language === "es" ? "Spanish" : "English",
      access: row.user_id ? "Linked" : row.email ? "Invite available" : "Email needed"
      ,clockStatus: row.open_time_entry_id ? row.break_started_at ? "On break" : "Clocked in" : "Clocked out"
      ,openTimeEntryId: row.open_time_entry_id
      ,todayHours: Number(row.today_hours).toFixed(2)
    })),
    assignments: (assignmentsResult?.rows ?? []).map((row) => ({
      id: row.id,
      serviceVisitId: row.service_visit_id,
      title: row.title,
      worker: row.worker ?? "Unassigned",
      crew: row.crew ?? "No crew",
      jobsite: row.jobsite ?? "No jobsite",
      schedule: `${dateTime(row.scheduled_start)} - ${row.scheduled_end ? dateTime(row.scheduled_end) : "open"}`,
      status: row.status,
      priority: row.priority,
      tasks: n(row.task_count),
      taskList: assignmentTasks(row.task_list_json),
      aiNotes: row.ai_dispatch_notes ?? "No AI dispatch recommendation yet."
    })),
    timeEntries: (timeResult?.rows ?? []).map((row) => ({
      id: row.id,
      workerId: row.worker_id,
      worker: row.worker ?? "Unknown worker",
      assignment: row.assignment ?? "No assignment",
      clockIn: dateTime(row.clock_in_at),
      clockOut: row.clock_out_at ? dateTime(row.clock_out_at) : "Still clocked in",
      clockInIso: row.clock_in_at.toISOString(),
      clockOutIso: row.clock_out_at?.toISOString() ?? "",
      breakMinutes: row.break_minutes,
      hours: hoursBetween(row.clock_in_at,row.clock_out_at,row.break_minutes,row.break_seconds,row.break_started_at),
      status: row.status,
      verified: row.gps_verified ? "GPS" : row.qr_verified ? "QR" : "manual",
      onBreak: row.break_started_at !== null
    })),
    expenses: (expensesResult?.rows ?? []).map((row) => ({
      id: row.id,
      vendor: row.vendor ?? "Unknown vendor",
      amount: dollars(n(row.amount_cents) + n(row.tax_cents)),
      category: row.category,
      status: row.reimbursement_status === "submitted" ? "needs payback" : row.status,
      worker: row.worker ?? "Unassigned",
      summary: row.ai_summary ?? "Receipt extraction pending."
    })),
    mileage: (mileageResult?.rows ?? []).map((row) => ({
      id: row.id,
      worker: row.worker ?? "Unassigned",
      route: `${row.start_location ?? "Start"} -> ${row.end_location ?? "End"}`,
      miles: row.miles,
      vehicle: row.vehicle_label ?? "No vehicle",
      status: row.status
    })),
    materials: (materialsResult?.rows ?? []).map((row) => ({
      id: row.id,
      material: row.material_name,
      quantity: [row.quantity, row.unit].filter(Boolean).join(" ") || "No quantity",
      logType: row.log_type,
      cost: dollars(row.cost_cents),
      status: row.status
    })),
    locationPings: (locationResult?.rows ?? []).map((row) => ({
      id: row.id,
      worker: row.worker ?? "Unassigned",
      assignment: row.assignment ?? "No assignment",
      location: row.location_label ?? "No location label",
      source: row.ping_source,
      status: row.alert_status
    })),
    fieldMedia: (mediaResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      type: row.media_type,
      worker: row.worker ?? "Unassigned",
      summary: row.ai_summary ?? "AI proof summary pending.",
      consent: row.consent_status,
      status: row.status
    })),
    payrollExports: (payrollResult?.rows ?? []).map((row) => ({
      id: row.id,
      provider: row.provider,
      period: `${dateTime(row.period_start).split(",")[0]} - ${dateTime(row.period_end).split(",")[0]}`,
      hours: `${Math.round(n(row.total_hours) * 10) / 10}`,
      status: row.status,
      notes: row.notes ?? "Draft export."
    })),
    customerDrafts: (customerDraftResult?.rows ?? []).map((row) => ({
      id: row.id,
      channel: row.channel,
      recipient: row.recipient_contact ?? "No recipient",
      subject: row.subject ?? "Customer update",
      body: row.body,
      status: row.send_status
    })),
    receiptExtractions: (receiptExtractionResult?.rows ?? []).map((row) => ({
      id: row.id,
      vendor: row.vendor ?? "Unknown vendor",
      total: dollars(row.extracted_total_cents),
      confidence: `${Math.round(n(row.confidence) * 100)}%`,
      status: row.status
    })),
    recurringExpenses: (recurringExpenseResult?.rows ?? []).map((row) => ({
      id: row.id,
      vendor: row.vendor,
      amount: dollars(n(row.amount_cents) + n(row.tax_cents)),
      cadence: row.cadence,
      nextDueDate: row.next_due_date ?? "No due date",
      category: row.category,
      mode: row.autopost_mode,
      status: row.status
    })),
    cashAdvances: (cashAdvanceResult?.rows ?? []).map((row) => ({
      id: row.id,
      workerId: row.worker_id,
      worker: row.worker,
      amount: currencyAmount(row.amount_cents, row.currency),
      date: row.advanced_at,
      method: row.payment_method,
      purpose: row.purpose ?? "No note",
      status: row.status,
      entryKind: row.entry_kind,
      currency: row.currency,
      isWorkerDebt: row.is_worker_debt,
      approvalStatus: row.approval_status,
      workerAuthorizationStatus: row.worker_authorization_status,
      repaymentTerms: row.repayment_terms ?? "No repayment terms recorded",
      receiptUrl: row.receipt_url,
      recovered: currencyAmount(Number(row.recovered_cents), row.currency),
      outstanding: currencyAmount(Number(row.outstanding_cents), row.currency)
    })),
    employeeAccessRequests: (employeeAccessRequestResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? "No phone",
      language: row.preferred_language === "es" ? "Spanish" : "English",
      requestedAt: dateTime(row.created_at),
      status: row.status
    })),
    providers: (providerResult?.rows ?? []).map((row) => ({
      id: row.id,
      provider: row.provider_key,
      type: row.provider_type,
      status: row.status
    })),
    aiDispatcher: [
      {
        title: workingNow === 0 ? "No one is clocked in" : `${workingNow} worker(s) clocked in`,
        detail: workingNow === 0 ? "Check today's schedule and confirm crews arrived before the day gets away." : "Review open time entries before payroll export.",
        priority: workingNow === 0 ? "high" : "normal",
        action: "/app/operations-workforce"
      },
      {
        title: review > 0 ? `${review} payroll/expense/mileage item(s) need review` : "Review queue clear",
        detail: "Expenses, mileage, materials, and time entries stay held until someone reviews them before payroll or accounting export.",
        priority: review > 0 ? "high" : "low",
        action: "/app/operations-workforce"
      },
      {
        title: openAssignments > 0 ? "Open assignments need dispatch visibility" : "No open assignments",
        detail: "Use worker, crew, jobsite, and task status to see who is doing what.",
        priority: openAssignments > 0 ? "normal" : "low",
        action: "/app/operations-workforce"
      },
      {
        title: n(metrics?.recurring_due) > 0 ? `${n(metrics?.recurring_due)} recurring expense(s) due soon` : "Recurring expense rules are quiet",
        detail: "Recurring bills create owner visibility first. Expense records should still be reviewed before posting.",
        priority: n(metrics?.recurring_due) > 0 ? "normal" : "low",
        action: "/app/operations-workforce#recurring-expenses"
      },
      {
        title: n(metrics?.customer_drafts) > 0 ? "Customer updates are waiting" : "Customer update queue ready",
        detail: "Arrival, delay, completion, and proof updates stay as drafts. Use approved email, app alerts, or manual text drafts by default.",
        priority: n(metrics?.customer_drafts) > 0 ? "normal" : "low",
        action: "/app/operations-workforce"
      }
    ],
    roleViews: [
      { role: "Owner", sees: ["profitability", "working now", "late crews", "payroll review", "job costing"] },
      { role: "Office Manager", sees: ["schedule", "dispatch", "expenses", "mileage", "customer notifications"] },
      { role: "Crew Leader", sees: ["crew assignments", "tasks", "photos", "issues", "daily job log"] },
      { role: "Employee", sees: ["today's job", "clock in/out", "tasks", "photos", "mileage", "receipts"] },
      { role: "Subcontractor", sees: ["assigned work", "jobsite notes", "completion proof", "issue reporting"] },
      { role: "Customer", sees: ["arrival status", "completion updates", "photos available", "invoice available"] }
    ]
  };
}
