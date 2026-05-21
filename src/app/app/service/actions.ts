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
