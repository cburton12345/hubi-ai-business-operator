"use server";

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

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function dateTimeOrNull(value: string | undefined) {
  return value?.trim() ? new Date(value).toISOString() : null;
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
