import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function n(value: unknown) {
  return Number(value ?? 0);
}

export type OperationsWorkforceDashboard = {
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
  workers: { id: string; name: string; roleType: string; trade: string; status: string; hourlyRate: string }[];
  assignments: { id: string; serviceVisitId: string | null; title: string; worker: string; crew: string; jobsite: string; schedule: string; status: string; priority: string; tasks: number; aiNotes: string }[];
  timeEntries: { id: string; worker: string; assignment: string; clockIn: string; clockOut: string; hours: string; status: string; verified: string }[];
  expenses: { id: string; vendor: string; amount: string; category: string; status: string; worker: string; summary: string }[];
  mileage: { id: string; worker: string; route: string; miles: string; vehicle: string; status: string }[];
  materials: { id: string; material: string; quantity: string; logType: string; cost: string; status: string }[];
  locationPings: { id: string; worker: string; assignment: string; location: string; source: string; status: string }[];
  fieldMedia: { id: string; title: string; type: string; worker: string; summary: string; consent: string; status: string }[];
  payrollExports: { id: string; provider: string; period: string; hours: string; status: string; notes: string }[];
  customerDrafts: { id: string; channel: string; recipient: string; subject: string; body: string; status: string }[];
  receiptExtractions: { id: string; vendor: string; total: string; confidence: string; status: string }[];
  recurringExpenses: { id: string; vendor: string; amount: string; cadence: string; nextDueDate: string; category: string; mode: string; status: string }[];
  providers: { id: string; provider: string; type: string; status: string }[];
  aiDispatcher: { title: string; detail: string; priority: "low" | "normal" | "high"; action: string }[];
  roleViews: { role: string; sees: string[] }[];
};

function dateTime(value: Date | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function hoursBetween(start: Date, end: Date | null, breaks: number) {
  const stop = end ?? new Date();
  return Math.max(0, (stop.getTime() - start.getTime()) / 36e5 - breaks / 60).toFixed(2);
}

export async function getOperationsWorkforceDashboard(): Promise<OperationsWorkforceDashboard> {
  const tenantId = await getCurrentWorkspaceId();
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
    recurringExpenseResult
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
    queryPostgres<{ id: string; name: string; role_type: string; trade: string | null; availability_status: string; hourly_rate_cents: number }>(
      `
      select id, name, role_type, trade, availability_status, hourly_rate_cents
      from public.operations_workers
      where tenant_id = $1 and availability_status <> 'inactive'
      order by name
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
      ai_dispatch_notes: string | null;
    }>(
      `
      select a.id, a.service_visit_id, a.title, w.name as worker, c.name as crew, a.jobsite, a.scheduled_start, a.scheduled_end,
        a.status, a.priority, jsonb_array_length(a.task_list_json) as task_count, a.ai_dispatch_notes
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
    }>(
      `
      select t.id, w.name as worker, a.title as assignment, t.clock_in_at, t.clock_out_at,
        t.break_minutes, t.status, t.gps_verified, t.qr_verified
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
    )
  ]);
  const metrics = metricsResult?.rows[0];
  const openAssignments = n(metrics?.open_assignments);
  const review = n(metrics?.needs_review);
  const workingNow = n(metrics?.working_now);

  return {
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
      hourlyRate: row.hourly_rate_cents ? dollars(row.hourly_rate_cents) : "No rate"
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
      aiNotes: row.ai_dispatch_notes ?? "No AI dispatch recommendation yet."
    })),
    timeEntries: (timeResult?.rows ?? []).map((row) => ({
      id: row.id,
      worker: row.worker ?? "Unknown worker",
      assignment: row.assignment ?? "No assignment",
      clockIn: dateTime(row.clock_in_at),
      clockOut: row.clock_out_at ? dateTime(row.clock_out_at) : "Still clocked in",
      hours: hoursBetween(row.clock_in_at, row.clock_out_at, row.break_minutes),
      status: row.status,
      verified: row.gps_verified ? "GPS" : row.qr_verified ? "QR" : "manual"
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
