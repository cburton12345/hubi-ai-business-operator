"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { dollarsToCents } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const customerSchema = z.object({
  name: z.string().min(1).max(180),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(80).optional(),
  notes: z.string().max(1200).optional()
});

const moneyItemSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(180),
  lineItem: z.string().min(1).max(180),
  amountCents: z.number().int().min(0),
  notes: z.string().max(1200).optional()
});

const jobSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(180),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  serviceArea: z.string().max(180).optional(),
  dispatcherNotes: z.string().max(1200).optional()
});

const estimateStatusSchema = z.object({
  estimateId: z.string().uuid(),
  status: z.enum(["draft", "sent_manually", "approved", "declined", "expired"]),
  internalNotes: z.string().max(1200).optional(),
  followUpDraft: z.string().max(2000).optional()
});

const jobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["unscheduled", "scheduled", "in_progress", "completed", "canceled", "lost"]),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  dispatcherNotes: z.string().max(1200).optional(),
  completionNotes: z.string().max(1200).optional(),
  nextAction: z.string().max(1200).optional()
});

const technicianJobSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["scheduled", "in_progress", "completed", "canceled"]),
  dispatcherNotes: z.string().max(1200).optional(),
  completionNotes: z.string().max(1200).optional(),
  nextAction: z.string().max(1200).optional()
});

const invoiceStatusSchema = z.object({
  invoiceId: z.string().uuid(),
  status: z.enum(["draft", "sent_manually", "partially_paid", "paid", "void", "overdue"]),
  amountPaidCents: z.number().int().min(0),
  dueDate: z.string().optional(),
  internalNotes: z.string().max(1200).optional(),
  paymentNotes: z.string().max(1200).optional()
});

const estimateLineItemSchema = z.object({
  estimateId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
  name: z.string().min(1).max(180),
  description: z.string().max(600).optional(),
  quantity: z.coerce.number().min(0).max(9999).default(1),
  unitPriceCents: z.number().int().min(0)
});

const invoiceLineItemSchema = z.object({
  invoiceId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
  name: z.string().min(1).max(180),
  description: z.string().max(600).optional(),
  quantity: z.coerce.number().min(0).max(9999).default(1),
  unitPriceCents: z.number().int().min(0)
});

const deleteEstimateLineItemSchema = z.object({
  estimateId: z.string().uuid(),
  itemId: z.string().uuid()
});

const deleteInvoiceLineItemSchema = z.object({
  invoiceId: z.string().uuid(),
  itemId: z.string().uuid()
});

const customerPortalSchema = z.object({
  customerId: z.string().uuid()
});

const recurringPlanSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(180),
  serviceType: z.string().max(160).optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual", "custom"]),
  status: z.enum(["active", "paused", "canceled"]).default("active"),
  nextServiceDate: z.string().optional(),
  priceCents: z.number().int().min(0),
  notes: z.string().max(1200).optional()
});

const inventoryItemSchema = z.object({
  name: z.string().min(1).max(180),
  category: z.enum(["part", "material", "equipment", "tool", "vehicle", "other"]),
  status: z.enum(["available", "reserved", "in_use", "maintenance", "retired"]),
  quantity: z.coerce.number().min(0).max(999999).default(0),
  reorderThreshold: z.coerce.number().min(0).max(999999).default(0),
  unit: z.string().max(40).optional(),
  location: z.string().max(180).optional(),
  notes: z.string().max(1200).optional()
});

const serviceTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["open", "scheduled", "done", "dismissed"])
});

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function dateTimeOrNull(value: string | undefined) {
  return value?.trim() ? new Date(value).toISOString() : null;
}

async function recalculateEstimateTotal(workspaceId: string, estimateId: string) {
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_estimates
    set subtotal_cents = totals.total_cents,
        total_cents = greatest(0, totals.total_cents - discount_cents + tax_cents),
        updated_at = now()
    from (
      select coalesce(sum(total_cents), 0)::integer as total_cents
      from public.estimate_line_items
      where tenant_id = $1 and estimate_id = $2
    ) totals
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [workspaceId, estimateId]
  );
  return result?.rows[0]?.customer_id ?? null;
}

async function recalculateInvoiceTotal(workspaceId: string, invoiceId: string) {
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_invoices
    set subtotal_cents = totals.total_cents,
        total_cents = greatest(0, totals.total_cents - discount_cents + tax_cents),
        updated_at = now()
    from (
      select coalesce(sum(total_cents), 0)::integer as total_cents
      from public.invoice_line_items
      where tenant_id = $1 and invoice_id = $2
    ) totals
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [workspaceId, invoiceId]
  );
  return result?.rows[0]?.customer_id ?? null;
}

async function insertTimeline(input: {
  tenantId: string;
  family: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7::uuid, $8, $9::uuid, $10::jsonb)
    `,
    [
      input.tenantId,
      input.family,
      input.type,
      input.title,
      input.body ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.sourceTable ?? null,
      input.sourceId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function scanServiceOpsAction() {
  await requirePermission("lead:manage");
  const workspaceId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, 'schedule_job', 'high',
      concat('Schedule job: ', j.title),
      concat(c.name, ' has an unscheduled job waiting.'),
      'Pick a date, assign the right person, and confirm the appointment manually.',
      now(),
      'job', j.id, 'service_jobs', j.id,
      jsonb_build_object('createdByScan', 'service_ops')
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    where j.tenant_id = $1 and j.status = 'unscheduled'
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, 'assign_technician', 'medium',
      concat('Assign technician: ', j.title),
      concat(c.name, ' has a scheduled job with no assigned team member.'),
      'Assign a technician or crew before the appointment window.',
      coalesce(j.scheduled_start, now()),
      'job', j.id, 'service_jobs', j.id,
      jsonb_build_object('createdByScan', 'service_ops')
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    where j.tenant_id = $1 and j.status = 'scheduled' and j.assigned_user_id is null
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select e.tenant_id, e.brand_id, e.customer_id, 'estimate_followup',
      case when e.created_at < now() - interval '7 days' then 'high' else 'medium' end,
      concat('Follow up on estimate: ', e.title),
      concat(c.name, ' has a sent estimate that has not been approved or declined.'),
      'Review the estimate and use a useful manual follow-up before marking it won or lost.',
      now(),
      'estimate', e.id, 'service_estimates', e.id,
      jsonb_build_object('createdByScan', 'service_ops', 'estimateStatus', e.status)
    from public.service_estimates e
    join public.customers c on c.id = e.customer_id
    where e.tenant_id = $1 and e.status = 'sent_manually' and e.created_at < now() - interval '2 days'
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select i.tenant_id, i.brand_id, i.customer_id, 'collect_payment',
      case when coalesce(i.due_date, i.created_at::date) < current_date then 'high' else 'medium' end,
      concat('Collect payment: ', i.title),
      concat(c.name, ' has an open invoice balance of ', greatest(i.total_cents - i.amount_paid_cents, 0), ' cents.'),
      'Review the invoice, confirm the balance, and send a polite payment reminder manually or through an approved provider.',
      coalesce(i.due_date::timestamptz, now()),
      'invoice', i.id, 'service_invoices', i.id,
      jsonb_build_object('createdByScan', 'service_ops', 'balanceDueCents', greatest(i.total_cents - i.amount_paid_cents, 0))
    from public.service_invoices i
    join public.customers c on c.id = i.customer_id
    where i.tenant_id = $1
      and i.status in ('sent_manually', 'partially_paid', 'overdue')
      and i.amount_paid_cents < i.total_cents
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, 'create_invoice', 'medium',
      concat('Create invoice for completed job: ', j.title),
      concat(c.name, ' has a completed job without an invoice.'),
      'Create and review an invoice before sending anything to the customer.',
      now() + interval '1 day',
      'job', j.id, 'service_jobs', j.id,
      jsonb_build_object('createdByScan', 'service_ops')
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    where j.tenant_id = $1 and j.status = 'completed'
      and not exists (select 1 from public.service_invoices i where i.job_id = j.id)
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select r.tenant_id, r.brand_id, r.customer_id, 'request_review', 'medium',
      concat('Review request ready: ', coalesce(c.name, 'Customer')),
      'A review request workflow is ready but not completed.',
      'Review the message and send manually or through an approved provider.',
      coalesce(r.scheduled_for, now()),
      'review_request', r.id, 'review_request_workflows', r.id,
      jsonb_build_object('createdByScan', 'service_ops', 'negativeInterceptionStatus', r.negative_interception_status)
    from public.review_request_workflows r
    left join public.customers c on c.id = r.customer_id
    where r.tenant_id = $1 and r.status in ('draft', 'scheduled')
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, customer_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select p.tenant_id, p.brand_id, p.customer_id, 'recurring_service_due', 'medium',
      concat('Recurring service due: ', p.title),
      concat(c.name, ' has a recurring service plan due soon.'),
      'Confirm the next visit and create a job when ready.',
      p.next_service_date::timestamptz,
      'recurring_plan', p.id, 'recurring_service_plans', p.id,
      jsonb_build_object('createdByScan', 'service_ops', 'frequency', p.frequency)
    from public.recurring_service_plans p
    join public.customers c on c.id = p.customer_id
    where p.tenant_id = $1 and p.status = 'active' and p.next_service_date <= current_date + interval '14 days'
    on conflict do nothing
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.service_operational_tasks (
      tenant_id, brand_id, task_type, priority, title, detail, next_step, due_at,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    select i.tenant_id, i.brand_id, 'inventory_reorder', 'medium',
      concat('Inventory low: ', i.name),
      concat('Quantity is ', i.quantity, ' ', coalesce(i.unit, ''), ' and reorder threshold is ', i.reorder_threshold, '.'),
      'Check stock and reorder or reserve inventory before field work is delayed.',
      now() + interval '1 day',
      'inventory_item', i.id, 'service_inventory_items', i.id,
      jsonb_build_object('createdByScan', 'service_ops', 'category', i.category)
    from public.service_inventory_items i
    where i.tenant_id = $1 and i.status <> 'retired' and i.quantity <= i.reorder_threshold
    on conflict do nothing
    `,
    [workspaceId]
  );

  await insertTimeline({
    tenantId: workspaceId,
    family: "job",
    type: "service_ops_scan",
    title: "Service operations scan completed",
    body: "Ferocity checked unscheduled jobs, technician assignment, estimate follow-up, invoices, reviews, recurring service, and inventory.",
    metadata: { scan: "service_ops" }
  });

  revalidatePath("/app/service");
  revalidatePath("/app");
}

export async function createCustomerAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.customers (tenant_id, name, email, phone, city, state, notes, ai_summary)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      workspaceId,
      parsed.data.name.trim(),
      emptyToNull(parsed.data.email),
      emptyToNull(parsed.data.phone),
      emptyToNull(parsed.data.city),
      emptyToNull(parsed.data.state),
      emptyToNull(parsed.data.notes),
      `Customer profile created for ${parsed.data.name.trim()}. Review lead history, service needs, and next best action manually.`
    ]
  );
  revalidatePath("/app/service");
}

export async function createEstimateAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = moneyItemSchema.safeParse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    lineItem: formData.get("lineItem"),
    amountCents: dollarsToCents(formData.get("amount")),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const estimateResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_estimates (tenant_id, customer_id, title, subtotal_cents, total_cents, customer_summary, internal_notes, manual_follow_up_draft)
    values ($1, $2, $3, $4, $4, $5, $6, $7)
    returning id
    `,
    [
      workspaceId,
      parsed.data.customerId,
      parsed.data.title.trim(),
      parsed.data.amountCents,
      `Estimate draft for ${parsed.data.title.trim()}. Review pricing and scope before sending manually.`,
      emptyToNull(parsed.data.notes),
      "Hi, thanks for the opportunity to help. I put together an estimate draft for your review. Please reply with any questions or changes you would like before we move forward."
    ]
  );
  const estimate = estimateResult?.rows[0];
  if (!estimate) return;

  await queryPostgres(
    `
    insert into public.estimate_line_items (tenant_id, estimate_id, name, quantity, unit_price_cents, total_cents)
    values ($1, $2, $3, 1, $4, $4)
    `,
    [workspaceId, estimate.id, parsed.data.lineItem.trim(), parsed.data.amountCents]
  );
  revalidatePath("/app/service");
}

export async function createJobAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = jobSchema.safeParse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    scheduledStart: String(formData.get("scheduledStart") ?? ""),
    scheduledEnd: String(formData.get("scheduledEnd") ?? ""),
    serviceArea: String(formData.get("serviceArea") ?? ""),
    dispatcherNotes: String(formData.get("dispatcherNotes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const scheduledStart = dateTimeOrNull(parsed.data.scheduledStart);
  await queryPostgres(
    `
    insert into public.service_jobs (tenant_id, customer_id, title, status, scheduled_start, scheduled_end, service_area, dispatcher_notes, ai_next_action)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      workspaceId,
      parsed.data.customerId,
      parsed.data.title.trim(),
      scheduledStart ? "scheduled" : "unscheduled",
      scheduledStart,
      dateTimeOrNull(parsed.data.scheduledEnd),
      emptyToNull(parsed.data.serviceArea),
      emptyToNull(parsed.data.dispatcherNotes),
      scheduledStart ? "Confirm schedule, assign a team member, and prepare job notes." : "Schedule this job and assign the right team member."
    ]
  );
  revalidatePath("/app/service");
}

export async function createInvoiceAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = moneyItemSchema.safeParse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    lineItem: formData.get("lineItem"),
    amountCents: dollarsToCents(formData.get("amount")),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const invoiceResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_invoices (tenant_id, customer_id, title, subtotal_cents, total_cents, internal_notes, manual_payment_notes)
    values ($1, $2, $3, $4, $4, $5, $6)
    returning id
    `,
    [
      workspaceId,
      parsed.data.customerId,
      parsed.data.title.trim(),
      parsed.data.amountCents,
      emptyToNull(parsed.data.notes),
      "Payment tracking is manual in this phase. Do not charge a card or send a payment request automatically."
    ]
  );
  const invoice = invoiceResult?.rows[0];
  if (!invoice) return;

  await queryPostgres(
    `
    insert into public.invoice_line_items (tenant_id, invoice_id, name, quantity, unit_price_cents, total_cents)
    values ($1, $2, $3, 1, $4, $4)
    `,
    [workspaceId, invoice.id, parsed.data.lineItem.trim(), parsed.data.amountCents]
  );
  revalidatePath("/app/service");
}

export async function updateEstimateAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateStatusSchema.safeParse({
    estimateId: formData.get("estimateId"),
    status: formData.get("status"),
    internalNotes: String(formData.get("internalNotes") ?? ""),
    followUpDraft: String(formData.get("followUpDraft") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_estimates
    set status = $3,
        internal_notes = $4,
        manual_follow_up_draft = $5,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [
      workspaceId,
      parsed.data.estimateId,
      parsed.data.status,
      emptyToNull(parsed.data.internalNotes),
      emptyToNull(parsed.data.followUpDraft)
    ]
  );
  const row = result?.rows[0];
  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
  if (row) revalidatePath(`/app/service/customers/${row.customer_id}`);
}

export async function updateJobAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = jobStatusSchema.safeParse({
    jobId: formData.get("jobId"),
    status: formData.get("status"),
    scheduledStart: String(formData.get("scheduledStart") ?? ""),
    scheduledEnd: String(formData.get("scheduledEnd") ?? ""),
    dispatcherNotes: String(formData.get("dispatcherNotes") ?? ""),
    completionNotes: String(formData.get("completionNotes") ?? ""),
    nextAction: String(formData.get("nextAction") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_jobs
    set status = $3,
        scheduled_start = $4,
        scheduled_end = $5,
        dispatcher_notes = $6,
        completion_notes = $7,
        ai_next_action = $8,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [
      workspaceId,
      parsed.data.jobId,
      parsed.data.status,
      dateTimeOrNull(parsed.data.scheduledStart),
      dateTimeOrNull(parsed.data.scheduledEnd),
      emptyToNull(parsed.data.dispatcherNotes),
      emptyToNull(parsed.data.completionNotes),
      emptyToNull(parsed.data.nextAction)
    ]
  );
  const row = result?.rows[0];
  revalidatePath("/app/service");
  revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
  if (row) revalidatePath(`/app/service/customers/${row.customer_id}`);
}

export async function updateTechnicianJobAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = technicianJobSchema.safeParse({
    jobId: formData.get("jobId"),
    status: formData.get("status"),
    dispatcherNotes: String(formData.get("dispatcherNotes") ?? ""),
    completionNotes: String(formData.get("completionNotes") ?? ""),
    nextAction: String(formData.get("nextAction") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_jobs
    set status = $3,
        dispatcher_notes = $4,
        completion_notes = $5,
        ai_next_action = $6,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [
      workspaceId,
      parsed.data.jobId,
      parsed.data.status,
      emptyToNull(parsed.data.dispatcherNotes),
      emptyToNull(parsed.data.completionNotes),
      emptyToNull(parsed.data.nextAction)
    ]
  );
  const row = result?.rows[0];
  revalidatePath("/app/service");
  revalidatePath("/app/service/routes");
  revalidatePath("/app/service/tech");
  revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
  if (row) revalidatePath(`/app/service/customers/${row.customer_id}`);
}

export async function updateInvoiceAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = invoiceStatusSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    status: formData.get("status"),
    amountPaidCents: dollarsToCents(formData.get("amountPaid")),
    dueDate: String(formData.get("dueDate") ?? ""),
    internalNotes: String(formData.get("internalNotes") ?? ""),
    paymentNotes: String(formData.get("paymentNotes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_invoices
    set status = $3,
        amount_paid_cents = $4,
        due_date = $5,
        internal_notes = $6,
        manual_payment_notes = $7,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [
      workspaceId,
      parsed.data.invoiceId,
      parsed.data.status,
      parsed.data.amountPaidCents,
      parsed.data.dueDate || null,
      emptyToNull(parsed.data.internalNotes),
      emptyToNull(parsed.data.paymentNotes)
    ]
  );
  const row = result?.rows[0];
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (row) revalidatePath(`/app/service/customers/${row.customer_id}`);
}

export async function saveEstimateLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateLineItemSchema.safeParse({
    estimateId: formData.get("estimateId"),
    itemId: String(formData.get("itemId") ?? "") || undefined,
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    quantity: formData.get("quantity") ?? 1,
    unitPriceCents: dollarsToCents(formData.get("unitPrice"))
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const totalCents = Math.round(parsed.data.quantity * parsed.data.unitPriceCents);
  if (parsed.data.itemId) {
    await queryPostgres(
      `
      update public.estimate_line_items
      set name = $4, description = $5, quantity = $6, unit_price_cents = $7, total_cents = $8
      where tenant_id = $1 and estimate_id = $2 and id = $3
      `,
      [
        workspaceId,
        parsed.data.estimateId,
        parsed.data.itemId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.description),
        parsed.data.quantity,
        parsed.data.unitPriceCents,
        totalCents
      ]
    );
  } else {
    await queryPostgres(
      `
      insert into public.estimate_line_items (tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents)
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        workspaceId,
        parsed.data.estimateId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.description),
        parsed.data.quantity,
        parsed.data.unitPriceCents,
        totalCents
      ]
    );
  }
  const customerId = await recalculateEstimateTotal(workspaceId, parsed.data.estimateId);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
  if (customerId) revalidatePath(`/app/service/customers/${customerId}`);
}

export async function deleteEstimateLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = deleteEstimateLineItemSchema.safeParse({
    estimateId: formData.get("estimateId"),
    itemId: formData.get("itemId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres("delete from public.estimate_line_items where tenant_id = $1 and estimate_id = $2 and id = $3", [
    workspaceId,
    parsed.data.estimateId,
    parsed.data.itemId
  ]);
  const customerId = await recalculateEstimateTotal(workspaceId, parsed.data.estimateId);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
  if (customerId) revalidatePath(`/app/service/customers/${customerId}`);
}

export async function saveInvoiceLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = invoiceLineItemSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    itemId: String(formData.get("itemId") ?? "") || undefined,
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    quantity: formData.get("quantity") ?? 1,
    unitPriceCents: dollarsToCents(formData.get("unitPrice"))
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const totalCents = Math.round(parsed.data.quantity * parsed.data.unitPriceCents);
  if (parsed.data.itemId) {
    await queryPostgres(
      `
      update public.invoice_line_items
      set name = $4, description = $5, quantity = $6, unit_price_cents = $7, total_cents = $8
      where tenant_id = $1 and invoice_id = $2 and id = $3
      `,
      [
        workspaceId,
        parsed.data.invoiceId,
        parsed.data.itemId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.description),
        parsed.data.quantity,
        parsed.data.unitPriceCents,
        totalCents
      ]
    );
  } else {
    await queryPostgres(
      `
      insert into public.invoice_line_items (tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents)
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        workspaceId,
        parsed.data.invoiceId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.description),
        parsed.data.quantity,
        parsed.data.unitPriceCents,
        totalCents
      ]
    );
  }
  const customerId = await recalculateInvoiceTotal(workspaceId, parsed.data.invoiceId);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (customerId) revalidatePath(`/app/service/customers/${customerId}`);
}

export async function deleteInvoiceLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = deleteInvoiceLineItemSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    itemId: formData.get("itemId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres("delete from public.invoice_line_items where tenant_id = $1 and invoice_id = $2 and id = $3", [
    workspaceId,
    parsed.data.invoiceId,
    parsed.data.itemId
  ]);
  const customerId = await recalculateInvoiceTotal(workspaceId, parsed.data.invoiceId);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (customerId) revalidatePath(`/app/service/customers/${customerId}`);
}

export async function enableCustomerPortalAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerPortalSchema.safeParse({
    customerId: formData.get("customerId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const token = randomBytes(24).toString("base64url");
  await queryPostgres(
    `
    insert into public.customer_portal_access (tenant_id, customer_id, public_token, enabled)
    values ($1, $2, $3, true)
    on conflict (tenant_id, customer_id)
    do update set enabled = true, public_token = excluded.public_token, updated_at = now()
    `,
    [workspaceId, parsed.data.customerId, token]
  );
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function disableCustomerPortalAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerPortalSchema.safeParse({
    customerId: formData.get("customerId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    "update public.customer_portal_access set enabled = false, updated_at = now() where tenant_id = $1 and customer_id = $2",
    [workspaceId, parsed.data.customerId]
  );
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function createRecurringPlanAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = recurringPlanSchema.safeParse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    serviceType: String(formData.get("serviceType") ?? ""),
    frequency: formData.get("frequency"),
    status: "active",
    nextServiceDate: String(formData.get("nextServiceDate") ?? ""),
    priceCents: dollarsToCents(formData.get("price")),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.recurring_service_plans (
      tenant_id,
      customer_id,
      title,
      service_type,
      frequency,
      status,
      next_service_date,
      price_cents,
      internal_notes,
      ai_next_action
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      workspaceId,
      parsed.data.customerId,
      parsed.data.title.trim(),
      emptyToNull(parsed.data.serviceType),
      parsed.data.frequency,
      parsed.data.status,
      parsed.data.nextServiceDate || null,
      parsed.data.priceCents,
      emptyToNull(parsed.data.notes),
      "Confirm the next service date manually and create a job when the visit is ready to schedule."
    ]
  );
  revalidatePath("/app/service");
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function createInventoryItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = inventoryItemSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    status: formData.get("status"),
    quantity: formData.get("quantity") ?? 0,
    reorderThreshold: formData.get("reorderThreshold") ?? 0,
    unit: String(formData.get("unit") ?? ""),
    location: String(formData.get("location") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.service_inventory_items (
      tenant_id,
      name,
      category,
      status,
      quantity,
      reorder_threshold,
      unit,
      location,
      notes
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      workspaceId,
      parsed.data.name.trim(),
      parsed.data.category,
      parsed.data.status,
      parsed.data.quantity,
      parsed.data.reorderThreshold,
      emptyToNull(parsed.data.unit),
      emptyToNull(parsed.data.location),
      emptyToNull(parsed.data.notes)
    ]
  );
  revalidatePath("/app/service/inventory");
}

export async function updateServiceTaskAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = serviceTaskStatusSchema.safeParse({
    taskId: formData.get("taskId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.service_operational_tasks
    set status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, parsed.data.taskId, parsed.data.status]
  );
  await insertTimeline({
    tenantId: workspaceId,
    family: "job",
    type: "service_task_status",
    title: `Service task marked ${parsed.data.status}`,
    sourceTable: "service_operational_tasks",
    sourceId: parsed.data.taskId,
    metadata: { status: parsed.data.status }
  });
  revalidatePath("/app/service");
  revalidatePath("/app");
}
