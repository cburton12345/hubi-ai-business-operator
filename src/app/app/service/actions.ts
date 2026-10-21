"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { recordInvoiceWriteOff } from "@/lib/billing/invoice-payment-adjustments";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { env } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";
import { ensureInvoiceReviewEnrollment } from "@/lib/reviews/invoice-review-enrollment";
import {
  calculatePlatformFeeCents,
  getManagedPaymentAccount,
  managedPaymentsEnabled,
  stripeFormRequest
} from "@/lib/payments/stripe-connect";
import { dollarsToCents } from "@/lib/service-ops/money";
import { recalculateEstimatePricing } from "@/lib/service-ops/estimate-pricing";
import { createCustomerPortalToken, hashCustomerPortalToken } from "@/lib/service-ops/customer-portal-token";
import { generateDueMembershipVisits } from "@/lib/service-ops/generate-membership-visits";
import { updateMembershipLifecycle } from "@/lib/service-ops/membership-lifecycle";
import { ensureServiceKernelForJob } from "@/lib/service-ops/service-kernel";
import {
  convertEstimateToJob,
  createInvoiceFromJob,
  deleteDraftInvoiceLineItem,
  recordManualInvoicePayment,
  saveDraftInvoiceLineItem,
  updateInvoiceWorkflow,
  updateServiceJob
} from "@/lib/service-ops/lifecycle-transitions";
import { makePublicToken } from "@/lib/ugc/proof";
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
  followUpDraft: z.string().max(2000).optional(),
  customerDisplayMode: z.enum(["simple", "grouped", "detailed"]).default("grouped"),
  customerIntro: z.string().max(1200).optional(),
  customerScopeSummary: z.string().max(1600).optional(),
  customerExclusions: z.string().max(1200).optional(),
  paymentTerms: z.string().max(1200).optional(),
  acceptanceNotes: z.string().max(1200).optional(),
  customerNextSteps: z.string().max(1200).optional(),
  showLineItemPrices: z.boolean().default(true),
  showQuantities: z.boolean().default(true),
  showMaterialDetails: z.boolean().default(false),
  showLaborDetails: z.boolean().default(false),
  showOverheadDetails: z.boolean().default(false),
  showProfitDetails: z.boolean().default(false),
  discountCents: z.number().int().min(0),
  taxRateBps: z.number().int().min(0).max(100_000)
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
  status: z.enum(["draft", "sent_manually", "void", "overdue"]),
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
  unitPriceCents: z.number().int().min(0),
  unitCostCents: z.number().int().min(0),
  taxable: z.boolean().default(false)
});

const estimatePricebookItemSchema = z.object({
  estimateId: z.string().uuid(),
  pricebookItemId: z.string().uuid(),
  quantity: z.coerce.number().min(0.01).max(9999).default(1),
  optional: z.boolean().default(false)
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

const paymentRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  sendEmail: z.boolean().default(true)
});

const manualPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  amountCents: z.number().int().min(1),
  note: z.string().max(1200).optional()
});

const invoiceWriteOffSchema = z.object({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  amountCents: z.number().int().min(1),
  reason: z.string().trim().min(5).max(1200)
});

const customerPortalSchema = z.object({
  customerId: z.string().uuid()
});

const customerTagSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(80)
});

const customerLocationSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  locationType: z.enum(["service", "billing", "service_and_billing", "commercial_site", "other"]),
  addressLine1: z.string().trim().max(180).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(30).optional(),
  accessInstructions: z.string().trim().max(1200).optional()
});

const customerAssetSchema = z.object({
  customerId: z.string().uuid(),
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  assetType: z.string().trim().min(1).max(80),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  condition: z.enum(["unknown", "new", "good", "fair", "poor", "failed", "retired"]),
  warrantyExpiresAt: z.string().optional()
});

const customerMergeSchema = z.object({
  targetCustomerId: z.string().uuid(),
  sourceCustomerId: z.string().uuid(),
  confirmation: z.literal("MERGE")
}).refine((value) => value.targetCustomerId !== value.sourceCustomerId);

const recurringPlanSchema = z.object({
  customerId: z.string().uuid(),
  membershipProgramId: z.string().uuid().optional(),
  title: z.string().min(1).max(180),
  serviceType: z.string().max(160).optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual", "custom"]),
  status: z.enum(["active", "paused", "canceled"]).default("active"),
  nextServiceDate: z.string().optional(),
  priceCents: z.number().int().min(0),
  notes: z.string().max(1200).optional()
});

const membershipLifecycleSchema = z.object({
  planId: z.string().uuid(),
  nextStatus: z.enum(["active", "paused", "canceled"]),
  idempotencyKey: z.string().uuid(),
  cancellationReason: z.string().trim().max(500).optional(),
  renewsAt: z.string().date().optional().or(z.literal(""))
});

const inventoryItemSchema = z.object({
  name: z.string().min(1).max(180),
  category: z.enum(["part", "material", "equipment", "tool", "vehicle", "other"]),
  status: z.enum(["available", "reserved", "in_use", "maintenance", "retired"]),
  quantity: z.coerce.number().min(0).max(999999).default(0),
  reorderThreshold: z.coerce.number().min(0).max(999999).default(0),
  unit: z.string().max(40).optional(),
  locationId: z.union([z.string().uuid(), z.literal("")]).optional(),
  notes: z.string().max(1200).optional()
}).superRefine((value, context) => {
  if (value.quantity > 0 && !value.locationId) {
    context.addIssue({ code: "custom", path: ["locationId"], message: "A location is required for opening stock." });
  }
});

const inventoryLocationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  locationType: z.enum(["warehouse", "vehicle", "office", "job_site", "virtual"]),
  address: z.string().trim().max(500).optional()
});

const inventoryAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityDelta: z.coerce.number().min(-999999).max(999999).refine((value) => value !== 0),
  reason: z.string().trim().min(2).max(500),
  idempotencyKey: z.string().uuid()
});

const serviceTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["open", "scheduled", "done", "dismissed"])
});

const jobProofRequestSchema = z.object({
  jobId: z.string().uuid(),
  requestType: z.enum(["job_proof", "review_proof", "testimonial", "before_after", "general"]).default("job_proof")
});

const estimateToJobSchema = z.object({
  estimateId: z.string().uuid(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  serviceArea: z.string().max(180).optional(),
  dispatcherNotes: z.string().max(1200).optional()
});

const estimateShareSchema = z.object({
  estimateId: z.string().uuid(),
  emailTo: z.string().email().optional().or(z.literal("")),
  sendEmail: z.boolean().default(false),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(30)
});

const jobToInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  dueDate: z.string().optional()
});

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function formCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function dateTimeOrNull(value: string | undefined) {
  return value?.trim() ? new Date(value).toISOString() : null;
}

async function customerBelongsToWorkspace(workspaceId: string, customerId: string) {
  const result = await queryPostgres<{ id: string }>(
    "select id from public.customers where tenant_id = $1 and id = $2 limit 1",
    [workspaceId, customerId]
  );
  return Boolean(result?.rows[0]);
}

async function recentCustomerExists(workspaceId: string, parsed: z.infer<typeof customerSchema>) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.customers
    where tenant_id = $1
      and lower(name) = lower($2)
      and coalesce(lower(email), '') = coalesce(lower($3), '')
      and coalesce(phone, '') = coalesce($4, '')
      and created_at >= now() - interval '45 seconds'
    order by created_at desc
    limit 1
    `,
    [workspaceId, parsed.name.trim(), emptyToNull(parsed.email), emptyToNull(parsed.phone)]
  );
  return result?.rows[0]?.id ?? null;
}

async function recentMoneyRecordExists(input: {
  table: "service_estimates" | "service_invoices";
  workspaceId: string;
  customerId: string;
  title: string;
  amountCents: number;
}) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.${input.table}
    where tenant_id = $1
      and customer_id = $2
      and lower(title) = lower($3)
      and total_cents = $4
      and created_at >= now() - interval '45 seconds'
    order by created_at desc
    limit 1
    `,
    [input.workspaceId, input.customerId, input.title.trim(), input.amountCents]
  );
  return result?.rows[0]?.id ?? null;
}

async function recentJobExists(workspaceId: string, parsed: z.infer<typeof jobSchema>) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.service_jobs
    where tenant_id = $1
      and customer_id = $2
      and lower(title) = lower($3)
      and coalesce(scheduled_start::text, '') = coalesce($4, '')
      and created_at >= now() - interval '45 seconds'
    order by created_at desc
    limit 1
    `,
    [workspaceId, parsed.customerId, parsed.title.trim(), dateTimeOrNull(parsed.scheduledStart)]
  );
  return result?.rows[0]?.id ?? null;
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
      concat(c.name, ' has an open invoice balance of ', greatest(i.total_cents - i.amount_paid_cents - i.write_off_cents, 0), ' cents.'),
      'Review the invoice, confirm the balance, and send a polite payment reminder manually or through an approved provider.',
      coalesce(i.due_date::timestamptz, now()),
      'invoice', i.id, 'service_invoices', i.id,
      jsonb_build_object('createdByScan', 'service_ops', 'balanceDueCents', greatest(i.total_cents - i.amount_paid_cents - i.write_off_cents, 0))
    from public.service_invoices i
    join public.customers c on c.id = i.customer_id
    where i.tenant_id = $1
      and i.status in ('sent_manually', 'partially_paid', 'overdue')
      and i.amount_paid_cents + i.write_off_cents < i.total_cents
      and not exists (
        select 1 from public.payment_disputes d
        join public.service_invoice_payments disputed_payment
          on disputed_payment.tenant_id=d.tenant_id and disputed_payment.id=d.payment_id
        where d.tenant_id=i.tenant_id and disputed_payment.invoice_id=i.id
          and d.status in ('warning','needs_response','under_review')
      )
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
  if (await recentCustomerExists(workspaceId, parsed.data)) {
    revalidatePath("/app/service");
    return;
  }
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
  if (!(await customerBelongsToWorkspace(workspaceId, parsed.data.customerId))) return;
  if (await recentMoneyRecordExists({ table: "service_estimates", workspaceId, customerId: parsed.data.customerId, title: parsed.data.title, amountCents: parsed.data.amountCents })) {
    revalidatePath("/app/service");
    return;
  }
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
  if (!(await customerBelongsToWorkspace(workspaceId, parsed.data.customerId))) return;
  if (await recentJobExists(workspaceId, parsed.data)) {
    revalidatePath("/app/service");
    return;
  }
  const scheduledStart = dateTimeOrNull(parsed.data.scheduledStart);
  const jobResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_jobs (tenant_id, customer_id, title, status, scheduled_start, scheduled_end, service_area, dispatcher_notes, ai_next_action)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning id
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
  const jobId = jobResult?.rows[0]?.id;
  if (jobId) await ensureServiceKernelForJob({ tenantId: workspaceId, jobId, eventSource: "user" });
  revalidatePath("/app/service");
  revalidatePath("/app/schedule");
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
  if (!(await customerBelongsToWorkspace(workspaceId, parsed.data.customerId))) return;
  if (await recentMoneyRecordExists({ table: "service_invoices", workspaceId, customerId: parsed.data.customerId, title: parsed.data.title, amountCents: parsed.data.amountCents })) {
    revalidatePath("/app/service");
    return;
  }
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

export async function convertEstimateToJobAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateToJobSchema.safeParse({
    estimateId: formData.get("estimateId"),
    scheduledStart: String(formData.get("scheduledStart") ?? ""),
    scheduledEnd: String(formData.get("scheduledEnd") ?? ""),
    serviceArea: String(formData.get("serviceArea") ?? ""),
    dispatcherNotes: String(formData.get("dispatcherNotes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const transition = await convertEstimateToJob({
    tenantId: workspaceId,
    estimateId: parsed.data.estimateId,
    scheduledStart: dateTimeOrNull(parsed.data.scheduledStart),
    scheduledEnd: dateTimeOrNull(parsed.data.scheduledEnd),
    serviceArea: emptyToNull(parsed.data.serviceArea),
    dispatcherNotes: emptyToNull(parsed.data.dispatcherNotes)
  });
  if (transition.status === "not_found" || !transition.jobId || !transition.customerId || !transition.title) return;

  if (transition.status === "existing") {
    revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
    revalidatePath(`/app/service/jobs/${transition.jobId}`);
    return;
  }
  await ensureServiceKernelForJob({ tenantId: workspaceId, jobId: transition.jobId, eventSource: "user" });

  await insertTimeline({
    tenantId: workspaceId,
    family: "job",
    type: "estimate_converted_to_job",
    title: "Estimate converted to job",
    body: `${transition.title} is now ready for scheduling and field work.`,
    entityType: "job",
    entityId: transition.jobId,
    sourceTable: "service_estimates",
    sourceId: transition.estimateId,
    metadata: {
      estimateId: transition.estimateId,
      customerId: transition.customerId,
      sourceLeadId: transition.sourceLeadId
    }
  });

  revalidatePath("/app/service");
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/service-command");
  revalidatePath(`/app/service/estimates/${transition.estimateId}`);
  revalidatePath(`/app/service/jobs/${transition.jobId}`);
  revalidatePath(`/app/service/customers/${transition.customerId}`);
}

export async function createInvoiceFromJobAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = jobToInvoiceSchema.safeParse({
    jobId: formData.get("jobId"),
    dueDate: String(formData.get("dueDate") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const transition = await createInvoiceFromJob({
    tenantId: workspaceId,
    jobId: parsed.data.jobId,
    dueDate: emptyToNull(parsed.data.dueDate)
  });
  if (transition.status === "not_found" || !transition.invoiceId || !transition.customerId || !transition.title) return;

  if (transition.status === "existing") {
    revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
    revalidatePath(`/app/service/invoices/${transition.invoiceId}`);
    return;
  }

  await insertTimeline({
    tenantId: workspaceId,
    family: "revenue",
    type: "job_converted_to_invoice",
    title: "Invoice created from job",
    body: `${transition.title} now has a draft invoice ready for review.`,
    entityType: "invoice",
    entityId: transition.invoiceId,
    sourceTable: "service_jobs",
    sourceId: transition.jobId,
    metadata: {
      jobId: transition.jobId,
      estimateId: transition.estimateId,
      customerId: transition.customerId
    }
  });

  revalidatePath("/app/service");
  revalidatePath("/app/cash-collection");
  revalidatePath("/app/service-command");
  revalidatePath(`/app/service/jobs/${transition.jobId}`);
  revalidatePath(`/app/service/invoices/${transition.invoiceId}`);
  revalidatePath(`/app/service/customers/${transition.customerId}`);
}

export async function updateEstimateAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateStatusSchema.safeParse({
    estimateId: formData.get("estimateId"),
    status: formData.get("status"),
    internalNotes: String(formData.get("internalNotes") ?? ""),
    followUpDraft: String(formData.get("followUpDraft") ?? ""),
    customerDisplayMode: formData.get("customerDisplayMode") ?? "grouped",
    customerIntro: String(formData.get("customerIntro") ?? ""),
    customerScopeSummary: String(formData.get("customerScopeSummary") ?? ""),
    customerExclusions: String(formData.get("customerExclusions") ?? ""),
    paymentTerms: String(formData.get("paymentTerms") ?? ""),
    acceptanceNotes: String(formData.get("acceptanceNotes") ?? ""),
    customerNextSteps: String(formData.get("customerNextSteps") ?? ""),
    showLineItemPrices: formCheckbox(formData, "showLineItemPrices"),
    showQuantities: formCheckbox(formData, "showQuantities"),
    showMaterialDetails: formCheckbox(formData, "showMaterialDetails"),
    showLaborDetails: formCheckbox(formData, "showLaborDetails"),
    showOverheadDetails: formCheckbox(formData, "showOverheadDetails"),
    showProfitDetails: formCheckbox(formData, "showProfitDetails"),
    discountCents: dollarsToCents(formData.get("discount")),
    taxRateBps: Math.round(Number(formData.get("taxRatePercent") ?? 0) * 100)
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ customer_id: string }>(
    `
    update public.service_estimates
    set status = $3,
        internal_notes = $4,
        manual_follow_up_draft = $5,
        customer_display_mode = $6,
        customer_intro = $7,
        customer_scope_summary = $8,
        customer_exclusions = $9,
        payment_terms = $10,
        acceptance_notes = $11,
        customer_next_steps = $12,
        show_line_item_prices = $13,
        show_quantities = $14,
        show_material_details = $15,
        show_labor_details = $16,
        show_overhead_details = $17,
        show_profit_details = $18,
        discount_cents = $19,
        tax_rate_bps = $20,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning customer_id
    `,
    [
      workspaceId,
      parsed.data.estimateId,
      parsed.data.status,
      emptyToNull(parsed.data.internalNotes),
      emptyToNull(parsed.data.followUpDraft),
      parsed.data.customerDisplayMode,
      emptyToNull(parsed.data.customerIntro),
      emptyToNull(parsed.data.customerScopeSummary),
      emptyToNull(parsed.data.customerExclusions),
      emptyToNull(parsed.data.paymentTerms),
      emptyToNull(parsed.data.acceptanceNotes),
      emptyToNull(parsed.data.customerNextSteps),
      parsed.data.showLineItemPrices,
      parsed.data.showQuantities,
      parsed.data.showMaterialDetails,
      parsed.data.showLaborDetails,
      parsed.data.showOverheadDetails,
      parsed.data.showProfitDetails,
      parsed.data.discountCents,
      parsed.data.taxRateBps
    ]
  );
  const row = result?.rows[0];
  await recalculateEstimatePricing(workspaceId, parsed.data.estimateId);
  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
  if (row) revalidatePath(`/app/service/customers/${row.customer_id}`);
}

export async function prepareEstimateShareLinkAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateShareSchema.safeParse({
    estimateId: formData.get("estimateId"),
    emailTo: String(formData.get("emailTo") ?? ""),
    sendEmail: formCheckbox(formData, "sendEmail"),
    expiresInDays: formData.get("expiresInDays") || 30
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const recalculated = await recalculateEstimatePricing(workspaceId, parsed.data.estimateId);
  if (!recalculated || recalculated.pricing.totalCents <= 0) return;
  const estimateResult = await queryPostgres<{
    id: string;
    customer_id: string;
    customer_name: string;
    customer_email: string | null;
    organization_name: string;
    title: string;
    status: string;
    total_cents: number;
  }>(
    `
    select e.id, e.customer_id, c.name as customer_name, c.email as customer_email,
      t.name as organization_name, e.title, e.status, e.total_cents
    from public.service_estimates e
    join public.customers c on c.id = e.customer_id and c.tenant_id = e.tenant_id
    join public.tenants t on t.id = e.tenant_id
    where e.tenant_id = $1 and e.id = $2
    limit 1
    `,
    [workspaceId, parsed.data.estimateId]
  );
  const estimate = estimateResult?.rows[0];
  if (!estimate) return;

  const token = makePublicToken("est");
  const emailTo = emptyToNull(parsed.data.emailTo) ?? estimate.customer_email;
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const shareResult = await queryPostgres<{ id: string; public_token: string }>(
    `
    insert into public.estimate_share_links (
      tenant_id, estimate_id, customer_id, public_token, status, email_to, expires_at, metadata_json
    )
    values ($1,$2,$3,$4,'ready',$5,$6,$7::jsonb)
    on conflict (tenant_id, estimate_id) do update
    set public_token = excluded.public_token,
        status = 'ready',
        email_to = excluded.email_to,
        expires_at = excluded.expires_at,
        metadata_json = public.estimate_share_links.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id, public_token
    `,
    [
      workspaceId,
      estimate.id,
      estimate.customer_id,
      token,
      emailTo,
      expiresAt,
      JSON.stringify({ source: "estimate_editor", sendEmailRequested: parsed.data.sendEmail })
    ]
  );
  const share = shareResult?.rows[0];
  if (!share) return;

  const appUrl = env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
  const publicUrl = `${appUrl.replace(/\/$/, "")}/estimate/${share.public_token}`;
  let emailStatus: "not_requested" | "sent" | "skipped" | "failed" = parsed.data.sendEmail ? "skipped" : "not_requested";
  let providerMessageId: string | null = null;
  let emailError: string | null = null;

  if (parsed.data.sendEmail && emailTo) {
    const result = await sendTransactionalEmail({
      to: emailTo,
      subject: `${estimate.title} from ${estimate.organization_name}`,
      text: [
        `Hi ${estimate.customer_name},`,
        "",
        `Your estimate is ready to review: ${publicUrl}`,
        "",
        "You can review the scope, total, terms, and next steps from that secure link.",
        "",
        "Thank you."
      ].join("\n"),
      tenantId: workspaceId,
      eventKey: `estimate-share-${estimate.id}`,
      metadata: { estimateId: estimate.id, shareLinkId: share.id }
    });
    emailStatus = result.ok ? "sent" : result.skipped ? "skipped" : "failed";
    providerMessageId = result.ok ? result.providerMessageId : null;
    emailError = result.ok ? null : result.error;
  }

  await queryPostgres(
    `
    update public.estimate_share_links
    set status = case when $4 = 'sent' then 'sent' else status end,
        sent_at = case when $4 = 'sent' then now() else sent_at end,
        provider_message_id = coalesce($5, provider_message_id),
        metadata_json = metadata_json || $6::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2 and estimate_id = $3
    `,
    [
      workspaceId,
      share.id,
      estimate.id,
      emailStatus,
      providerMessageId,
      JSON.stringify({ publicUrl, emailStatus, emailTo, emailError })
    ]
  );

  await queryPostgres(
    `
    update public.service_estimates
    set status = case when status = 'draft' then 'sent_manually' else status end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, estimate.id]
  );

  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${estimate.id}`);
  revalidatePath(`/app/service/estimates/${estimate.id}/preview`);
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
  const transition = await updateServiceJob({
    tenantId: workspaceId,
    jobId: parsed.data.jobId,
    status: parsed.data.status,
    scheduledStart: dateTimeOrNull(parsed.data.scheduledStart),
    scheduledEnd: dateTimeOrNull(parsed.data.scheduledEnd),
    dispatcherNotes: emptyToNull(parsed.data.dispatcherNotes),
    completionNotes: emptyToNull(parsed.data.completionNotes),
    nextAction: emptyToNull(parsed.data.nextAction),
    eventSource: "user"
  });
  revalidatePath("/app/service");
  revalidatePath("/app/schedule");
  revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
  if (transition.customerId) revalidatePath(`/app/service/customers/${transition.customerId}`);
}

export async function createJobProofRequestAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = jobProofRequestSchema.safeParse({
    jobId: formData.get("jobId"),
    requestType: formData.get("requestType") || "job_proof"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const jobResult = await queryPostgres<{
    brand_id: string | null;
    customer_id: string;
    title: string;
    status: string;
  }>(
    `
    select brand_id, customer_id, title, status
    from public.service_jobs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, parsed.data.jobId]
  );
  const job = jobResult?.rows[0];
  if (!job) return;

  const token = makePublicToken();
  const requestResult = await queryPostgres<{ id: string }>(
    `
    insert into public.ugc_capture_requests (
      tenant_id, brand_id, customer_id, job_id, public_token, request_type, status, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, 'ready', $7::jsonb)
    returning id
    `,
    [
      workspaceId,
      job.brand_id,
      job.customer_id,
      parsed.data.jobId,
      token,
      parsed.data.requestType,
      JSON.stringify({
        createdFrom: "service_job",
        jobStatusAtCreation: job.status,
        sendMode: "manual"
      })
    ]
  );

  const request = requestResult?.rows[0];
  if (!request) return;

  await insertTimeline({
    tenantId: workspaceId,
    family: "review",
    type: "proof_request_created",
    title: "Customer proof request prepared",
    body: `Manual proof link prepared for ${job.title}. Send only after review: /proof/${token}`,
    entityType: "job",
    entityId: parsed.data.jobId,
    sourceTable: "ugc_capture_requests",
    sourceId: request.id,
    metadata: { publicUrl: `/proof/${token}`, requestType: parsed.data.requestType }
  });

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'user', 'service_job_proof_request_created', 'ugc_capture_request', $3, $4::jsonb)
    `,
    [workspaceId, job.brand_id, request.id, JSON.stringify({ jobId: parsed.data.jobId, publicUrl: `/proof/${token}` })]
  );

  revalidatePath("/app/service");
  revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
  revalidatePath(`/app/service/customers/${job.customer_id}`);
  revalidatePath("/app/proof");
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
  const transition = await updateServiceJob({
    tenantId: workspaceId,
    jobId: parsed.data.jobId,
    status: parsed.data.status,
    dispatcherNotes: emptyToNull(parsed.data.dispatcherNotes),
    completionNotes: emptyToNull(parsed.data.completionNotes),
    nextAction: emptyToNull(parsed.data.nextAction),
    eventSource: "worker",
    preserveSchedule: true
  });
  revalidatePath("/app/service");
  revalidatePath("/app/schedule");
  revalidatePath("/app/service/routes");
  revalidatePath("/app/service/tech");
  revalidatePath(`/app/service/jobs/${parsed.data.jobId}`);
  if (transition.customerId) revalidatePath(`/app/service/customers/${transition.customerId}`);
}

export async function updateInvoiceAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = invoiceStatusSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    status: formData.get("status"),
    dueDate: String(formData.get("dueDate") ?? ""),
    internalNotes: String(formData.get("internalNotes") ?? ""),
    paymentNotes: String(formData.get("paymentNotes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const transition = await updateInvoiceWorkflow({
    tenantId: workspaceId,
    invoiceId: parsed.data.invoiceId,
    status: parsed.data.status,
    dueDate: parsed.data.dueDate || null,
    internalNotes: emptyToNull(parsed.data.internalNotes),
    paymentNotes: emptyToNull(parsed.data.paymentNotes)
  });
  if (transition.status === "updated" && parsed.data.status === "sent_manually") {
    await ensureInvoiceReviewEnrollment({
      tenantId: workspaceId,
      invoiceId: parsed.data.invoiceId,
      event: "invoice_sent"
    });
  }
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (transition.customerId) revalidatePath(`/app/service/customers/${transition.customerId}`);
}

export async function prepareInvoicePaymentRequestAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = paymentRequestSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    sendEmail: formData.get("sendEmail") !== "false"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const invoiceResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    brand_id: string | null;
    customer_id: string;
    customer_email: string | null;
    customer_name: string;
    organization_name: string;
    title: string;
    total_cents: number;
    amount_paid_cents: number;
    write_off_cents: number;
    due_date: Date | null;
    collection_paused: boolean;
  }>(
    `
    select i.id, i.tenant_id, i.brand_id, i.customer_id, c.email as customer_email,
      c.name as customer_name, t.name as organization_name, i.title, i.total_cents,
      i.amount_paid_cents, i.write_off_cents, i.due_date,
      exists(
        select 1 from public.payment_disputes d
        join public.service_invoice_payments disputed_payment
          on disputed_payment.tenant_id=d.tenant_id and disputed_payment.id=d.payment_id
        where d.tenant_id=i.tenant_id and disputed_payment.invoice_id=i.id
          and d.status in ('warning','needs_response','under_review')
      ) as collection_paused
    from public.service_invoices i
    join public.customers c on c.id = i.customer_id
    join public.tenants t on t.id = i.tenant_id
    where i.tenant_id = $1 and i.id = $2
    limit 1
    `,
    [workspaceId, parsed.data.invoiceId]
  );
  const invoice = invoiceResult?.rows[0];
  if (!invoice || invoice.collection_paused) return;

  const balanceDue = Math.max(invoice.total_cents - invoice.amount_paid_cents - invoice.write_off_cents, 0);
  if (balanceDue <= 0) return;

  const managedAccount = managedPaymentsEnabled() ? await getManagedPaymentAccount(workspaceId) : null;
  const canUseConnectDirect =
    Boolean(managedAccount?.providerAccountId) && managedAccount?.chargesEnabled === true && managedAccount?.payoutsEnabled === true;
  const platformFeeCents = canUseConnectDirect ? calculatePlatformFeeCents(balanceDue) : 0;
  const paymentMode = canUseConnectDirect ? "stripe_connect_direct" : "manual_tracking";
  const connectedAccountId = canUseConnectDirect ? managedAccount?.providerAccountId ?? null : null;
  const netToBusinessCents = Math.max(balanceDue - platformFeeCents, 0);

  const existingRequest = await queryPostgres<{ id: string; payment_url: string | null; status: string }>(
    `
    select id, payment_url, status
    from public.service_invoice_payment_links
    where tenant_id = $1
      and invoice_id = $2
      and amount_cents = $3
      and payment_mode = $4
      and status in ('draft', 'ready', 'sent')
    order by created_at desc
    limit 1
    `,
    [workspaceId, invoice.id, balanceDue, paymentMode]
  );
  const existingLink = existingRequest?.rows[0] ?? null;
  const requestResult = existingLink ? null : await queryPostgres<{ id: string }>(
    `
    insert into public.service_invoice_payment_links (
      tenant_id, brand_id, customer_id, invoice_id, provider, status, amount_cents, currency,
      payment_mode, connected_account_id, platform_fee_cents, net_to_business_cents, metadata_json
    )
    values (
      $1, $2, $3, $4, 'stripe', 'draft', $5, 'usd',
      $6, $7, $8, $9,
      jsonb_build_object(
        'mode', 'prepared',
        'plainStatus', $10::text,
        'nextStep', $11::text
      )
    )
    returning id
    `,
    [
      workspaceId,
      invoice.brand_id,
      invoice.customer_id,
      invoice.id,
      balanceDue,
      paymentMode,
      connectedAccountId,
      platformFeeCents,
      netToBusinessCents,
      canUseConnectDirect
        ? "Stripe Connect payment collection is prepared. The connected business is the merchant of record and receives the payment directly."
        : "Stripe checkout can be prepared, but this workspace does not have a live connected payout account yet.",
      canUseConnectDirect
        ? "Review the invoice, fee disclosure, customer email, and approval rules before sending this payment link."
        : "Connect the business payout account before preparing an online checkout link."
    ]
  );
  const paymentLinkId = existingLink?.id ?? requestResult?.rows[0]?.id;
  if (!paymentLinkId) return;

  let paymentUrl = existingLink?.payment_url ?? "";
  let requestStatus = existingLink?.status ?? "draft";

  if (!paymentUrl && env.STRIPE_SECRET_KEY && canUseConnectDirect && connectedAccountId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": invoice.title,
      "line_items[0][price_data][unit_amount]": String(balanceDue),
      "line_items[0][quantity]": "1",
      success_url: `${appUrl}/portal/payment-success?invoice=${encodeURIComponent(invoice.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/portal/payment-cancel?invoice=${encodeURIComponent(invoice.id)}`,
      "metadata[ferocity_kind]": "service_invoice_payment",
      "metadata[tenant_id]": workspaceId,
      "metadata[invoice_id]": invoice.id,
      "metadata[customer_id]": invoice.customer_id,
      "metadata[payment_link_id]": paymentLinkId,
      "metadata[amount_cents]": String(balanceDue),
      "metadata[currency]": "usd",
      "metadata[payment_mode]": paymentMode,
      "metadata[connected_account_id]": connectedAccountId ?? "",
      "metadata[platform_fee_cents]": String(platformFeeCents)
    });

    if (platformFeeCents > 0) {
      body.set("payment_intent_data[application_fee_amount]", String(platformFeeCents));
    }

    for (const [key, value] of [
      ["ferocity_kind", "service_invoice_payment"],
      ["tenant_id", workspaceId],
      ["invoice_id", invoice.id],
      ["customer_id", invoice.customer_id],
      ["payment_link_id", paymentLinkId],
      ["amount_cents", String(balanceDue)],
      ["currency", "usd"],
      ["payment_mode", paymentMode],
      ["connected_account_id", connectedAccountId],
      ["platform_fee_cents", String(platformFeeCents)]
    ] as const) {
      body.set(`payment_intent_data[metadata][${key}]`, value);
    }

    if (invoice.customer_email) {
      body.set("customer_email", invoice.customer_email);
    }

    try {
      const session = await stripeFormRequest<{ id?: string; url?: string; payment_intent?: string }>(
        "checkout/sessions",
        body,
        {
          connectedAccountId: connectedAccountId,
          idempotencyKey: `ferocity-invoice-checkout-${paymentLinkId}`
        }
      );
      paymentUrl = session.url ?? "";
      requestStatus = paymentUrl ? "ready" : "draft";
      await queryPostgres(
        `
        update public.service_invoice_payment_links
        set status = $3,
            provider_checkout_session_id = $4,
            provider_payment_intent_id = $5,
            payment_url = $6,
            metadata_json = metadata_json || $7::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          workspaceId,
          paymentLinkId,
          requestStatus,
          session.id ?? null,
          session.payment_intent ?? null,
          paymentUrl || null,
            JSON.stringify({ stripeCheckoutPrepared: Boolean(paymentUrl) })
        ]
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Stripe Checkout request failed.";
      await logAppError({
        source: "app.service.prepareInvoicePaymentRequestAction",
        message: "Stripe invoice checkout session creation failed.",
        severity: "warning",
        metadata: { invoiceId: invoice.id, detail: detail.slice(0, 500) }
      });
    }
  }

  await queryPostgres(
    `
    insert into public.service_ledger_entries (
      tenant_id, brand_id, customer_id, invoice_id, entry_type, direction, amount_cents, currency, description, provider, metadata_json
    )
    select
      $1, $2, $3, $4, 'payment_requested', 'debit', $5, 'usd',
      $6,
      'stripe',
      jsonb_build_object('paymentLinkId', $7::uuid, 'status', $8::text, 'paymentUrlReady', $9::boolean)
        || jsonb_build_object('paymentMode', $10::text, 'connectedAccountId', nullif($11::text, ''), 'platformFeeCents', $12::integer)
    where not exists (
      select 1 from public.service_ledger_entries
      where tenant_id=$1 and invoice_id=$4 and entry_type='payment_requested'
        and metadata_json->>'paymentLinkId'=$7::text
    )
    `,
    [
      workspaceId,
      invoice.brand_id,
      invoice.customer_id,
      invoice.id,
      balanceDue,
      paymentUrl
        ? "Prepared Stripe checkout link for invoice balance. Send only after review."
        : "Prepared payment request for invoice balance. No live checkout link was created.",
      paymentLinkId,
      requestStatus,
      Boolean(paymentUrl),
      paymentMode,
      connectedAccountId ?? "",
      platformFeeCents
    ]
  );

  if (parsed.data.sendEmail && invoice.customer_email && paymentUrl) {
    const dueLabel = invoice.due_date
      ? new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(invoice.due_date)
      : "upon receipt";
    const emailResult = await sendTransactionalEmail({
      to: invoice.customer_email,
      subject: `${invoice.title} from ${invoice.organization_name}`,
      text: [
        `Hi ${invoice.customer_name},`,
        "",
        `${invoice.organization_name} sent you ${invoice.title}.`,
        `Balance due: $${(balanceDue / 100).toFixed(2)}`,
        `Due: ${dueLabel}`,
        "",
        `Review and pay securely: ${paymentUrl}`,
        "",
        "If you already paid, please disregard this message or reply so the business can confirm it."
      ].join("\n"),
      tenantId: workspaceId,
      eventKey: `invoice-payment-request-${paymentLinkId}`,
      metadata: { invoiceId: invoice.id, paymentLinkId }
    });
    const deliveryStatus = emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed";
    const providerMessageId = emailResult.ok ? emailResult.providerMessageId : null;
    await queryPostgres(
      `update public.service_invoice_payment_links
          set status=case when $3='sent' then 'sent' else status end,
              metadata_json=metadata_json || $4::jsonb,
              updated_at=now()
        where tenant_id=$1 and id=$2`,
      [workspaceId, paymentLinkId, deliveryStatus, JSON.stringify({
        emailTo: invoice.customer_email,
        emailStatus: deliveryStatus,
        providerMessageId,
        emailSentAt: emailResult.ok ? new Date().toISOString() : null,
        emailError: emailResult.ok ? null : emailResult.error
      })]
    );
    if (emailResult.ok) {
      await queryPostgres(
        `update public.service_invoices
            set status=case when status='draft' then 'sent_manually' else status end, updated_at=now()
          where tenant_id=$1 and id=$2`,
        [workspaceId, invoice.id]
      );
      await ensureInvoiceReviewEnrollment({ tenantId: workspaceId, invoiceId: invoice.id, event: "invoice_sent" });
    }
  }

  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  revalidatePath(`/app/service/customers/${invoice.customer_id}`);
}

export async function recordManualInvoicePaymentAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = manualPaymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    idempotencyKey: formData.get("idempotencyKey"),
    amountCents: dollarsToCents(formData.get("amount")),
    note: String(formData.get("note") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const payment = await recordManualInvoicePayment({
    tenantId: workspaceId,
    invoiceId: parsed.data.invoiceId,
    amountCents: parsed.data.amountCents,
    note: emptyToNull(parsed.data.note),
    idempotencyKey: parsed.data.idempotencyKey
  });
  if (payment.status === "recorded" || payment.status === "existing") {
    await ensureInvoiceReviewEnrollment({ tenantId: workspaceId, invoiceId: parsed.data.invoiceId, event: "invoice_paid" });
  }
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (payment.customerId) revalidatePath(`/app/service/customers/${payment.customerId}`);
}

export async function recordInvoiceWriteOffAction(formData: FormData) {
  const actor = await requirePermission("billing:manage");
  const parsed = invoiceWriteOffSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    idempotencyKey: formData.get("idempotencyKey"),
    amountCents: dollarsToCents(formData.get("amount")),
    reason: String(formData.get("reason") ?? "")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await recordInvoiceWriteOff({
    tenantId: workspaceId,
    invoiceId: parsed.data.invoiceId,
    amountCents: parsed.data.amountCents,
    idempotencyKey: `manual-write-off:${parsed.data.idempotencyKey}`,
    reason: parsed.data.reason,
    requestedByUserId: actor.userId === "admin-token" ? null : actor.userId
  });
  revalidatePath("/app/service");
  revalidatePath("/app/cash-collection");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
}

export async function saveEstimateLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimateLineItemSchema.safeParse({
    estimateId: formData.get("estimateId"),
    itemId: String(formData.get("itemId") ?? "") || undefined,
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    quantity: formData.get("quantity") ?? 1,
    unitPriceCents: dollarsToCents(formData.get("unitPrice")),
    unitCostCents: dollarsToCents(formData.get("unitCost")),
    taxable: formCheckbox(formData, "taxable")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const totalCents = Math.round(parsed.data.quantity * parsed.data.unitPriceCents);
  if (parsed.data.itemId) {
    await queryPostgres(
      `
      update public.estimate_line_items
      set name = $4, description = $5, quantity = $6, unit_price_cents = $7,
          cost_cents = $8, taxable = $9, total_cents = $10
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
        parsed.data.unitCostCents,
        parsed.data.taxable,
        totalCents
      ]
    );
  } else {
    await queryPostgres(
      `
      insert into public.estimate_line_items (
        tenant_id, estimate_id, name, description, quantity, unit_price_cents, cost_cents, taxable, total_cents
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        workspaceId,
        parsed.data.estimateId,
        parsed.data.name.trim(),
        emptyToNull(parsed.data.description),
        parsed.data.quantity,
        parsed.data.unitPriceCents,
        parsed.data.unitCostCents,
        parsed.data.taxable,
        totalCents
      ]
    );
  }
  const recalculated = await recalculateEstimatePricing(workspaceId, parsed.data.estimateId);
  const customerId = recalculated?.customerId ?? null;
  revalidatePath("/app/service");
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
  if (customerId) revalidatePath(`/app/service/customers/${customerId}`);
}

export async function addPricebookItemToEstimateAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = estimatePricebookItemSchema.safeParse({
    estimateId: formData.get("estimateId"),
    pricebookItemId: formData.get("pricebookItemId"),
    quantity: formData.get("quantity") ?? 1,
    optional: formData.get("optional") === "on"
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.estimate_line_items (
      tenant_id, estimate_id, pricebook_item_id, name, description, quantity,
      unit_price_cents, cost_cents, taxable, optional, selected, total_cents, position
    )
    select
      i.tenant_id, $2, i.id, i.name, i.customer_description, $4,
      i.price_cents, i.cost_cents, i.taxable, $5, not $5,
      round(i.price_cents * $4)::integer,
      coalesce((select max(position) + 1 from public.estimate_line_items where tenant_id = $1 and estimate_id = $2), 0)
    from public.pricebook_items i
    join public.service_estimates e on e.id = $2 and e.tenant_id = i.tenant_id
    where i.tenant_id = $1 and i.id = $3 and i.active = true
    `,
    [workspaceId, parsed.data.estimateId, parsed.data.pricebookItemId, parsed.data.quantity, parsed.data.optional]
  );
  const recalculated = await recalculateEstimatePricing(workspaceId, parsed.data.estimateId);
  const customerId = recalculated?.customerId ?? null;
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
  const recalculated = await recalculateEstimatePricing(workspaceId, parsed.data.estimateId);
  const customerId = recalculated?.customerId ?? null;
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
  const mutation = await saveDraftInvoiceLineItem({
    tenantId: workspaceId,
    invoiceId: parsed.data.invoiceId,
    itemId: parsed.data.itemId ?? null,
    name: parsed.data.name.trim(),
    description: emptyToNull(parsed.data.description),
    quantity: parsed.data.quantity,
    unitPriceCents: parsed.data.unitPriceCents
  });
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (mutation.customerId) revalidatePath(`/app/service/customers/${mutation.customerId}`);
}

export async function deleteInvoiceLineItemAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = deleteInvoiceLineItemSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    itemId: formData.get("itemId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const mutation = await deleteDraftInvoiceLineItem({
    tenantId: workspaceId,
    invoiceId: parsed.data.invoiceId,
    itemId: parsed.data.itemId
  });
  revalidatePath("/app/service");
  revalidatePath(`/app/service/invoices/${parsed.data.invoiceId}`);
  if (mutation.customerId) revalidatePath(`/app/service/customers/${mutation.customerId}`);
}

export async function enableCustomerPortalAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerPortalSchema.safeParse({
    customerId: formData.get("customerId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const token = createCustomerPortalToken();
  const tokenHash = hashCustomerPortalToken(token);
  const enabled = await queryPostgres(
    `
    insert into public.customer_portal_access (tenant_id, customer_id, public_token, token_hash, enabled)
    select $1, customer.id, null, $3, true
    from public.customers customer
    where customer.tenant_id = $1 and customer.id = $2
    on conflict (tenant_id, customer_id)
    do update set enabled = true, public_token = null, token_hash = excluded.token_hash,
      expires_at = null, updated_at = now()
    returning customer_id
    `,
    [workspaceId, parsed.data.customerId, tokenHash]
  );
  if (enabled?.rowCount !== 1) {
    throw new Error("The customer portal could not be enabled for this workspace.");
  }
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
  redirect(`/app/service/customers/${parsed.data.customerId}?portalToken=${encodeURIComponent(token)}`);
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

export async function addCustomerTagAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerTagSchema.safeParse({ customerId: formData.get("customerId"), name: formData.get("name") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with tag as (
      insert into public.customer_tags (tenant_id, name)
      values ($1, $3)
      on conflict (tenant_id, name) do update set name = excluded.name
      returning id
    )
    insert into public.customer_tag_assignments (tenant_id, customer_id, tag_id)
    select $1, $2, id from tag
    on conflict (customer_id, tag_id) do nothing
    `,
    [tenantId, parsed.data.customerId, parsed.data.name]
  );
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function createCustomerLocationAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerLocationSchema.safeParse({
    customerId: formData.get("customerId"), name: formData.get("name"),
    locationType: formData.get("locationType"), addressLine1: String(formData.get("addressLine1") ?? ""),
    city: String(formData.get("city") ?? ""), state: String(formData.get("state") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""), accessInstructions: String(formData.get("accessInstructions") ?? "")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.customer_locations (
      tenant_id, customer_id, name, location_type, address_line1, city, state,
      postal_code, access_instructions, is_primary
    )
    select $1,$2,$3,$4,$5,$6,$7,$8,$9,
      not exists (select 1 from public.customer_locations where tenant_id = $1 and customer_id = $2 and active = true)
    where exists (select 1 from public.customers where tenant_id = $1 and id = $2)
    `,
    [
      tenantId, parsed.data.customerId, parsed.data.name, parsed.data.locationType,
      parsed.data.addressLine1 || null, parsed.data.city || null, parsed.data.state || null,
      parsed.data.postalCode || null, parsed.data.accessInstructions || null
    ]
  );
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function createCustomerAssetAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerAssetSchema.safeParse({
    customerId: formData.get("customerId"), locationId: formData.get("locationId"),
    name: formData.get("name"), assetType: formData.get("assetType") || "equipment",
    manufacturer: String(formData.get("manufacturer") ?? ""), model: String(formData.get("model") ?? ""),
    serialNumber: String(formData.get("serialNumber") ?? ""), condition: formData.get("condition") || "unknown",
    warrantyExpiresAt: String(formData.get("warrantyExpiresAt") ?? "")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.customer_assets (
      tenant_id, customer_id, location_id, asset_type, name, manufacturer,
      model, serial_number, condition, warranty_expires_at
    )
    select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    where exists (
      select 1 from public.customer_locations
      where tenant_id = $1 and id = $3 and customer_id = $2 and active = true
    )
    `,
    [
      tenantId, parsed.data.customerId, parsed.data.locationId, parsed.data.assetType,
      parsed.data.name, parsed.data.manufacturer || null, parsed.data.model || null,
      parsed.data.serialNumber || null, parsed.data.condition, parsed.data.warrantyExpiresAt || null
    ]
  );
  revalidatePath(`/app/service/customers/${parsed.data.customerId}`);
}

export async function mergeDuplicateCustomerAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = customerMergeSchema.safeParse({
    targetCustomerId: formData.get("targetCustomerId"),
    sourceCustomerId: formData.get("sourceCustomerId"),
    confirmation: formData.get("confirmation")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await withPostgresTransaction(async (client) => {
    const eligible = await client.query(
      `
      select source.id
      from public.customers source
      join public.customers target on target.tenant_id = source.tenant_id and target.id = $2
      where source.tenant_id = $1 and source.id = $3 and source.status <> 'do_not_contact'
      for update of source, target
      `,
      [tenantId, parsed.data.targetCustomerId, parsed.data.sourceCustomerId]
    );
    if (eligible.rowCount !== 1) {
      throw new Error("The customer merge could not verify two eligible records in this workspace.");
    }

    const mergeAudit = await client.query<{ id: string }>(
    `
    with source as (
      select to_jsonb(c.*) as snapshot from public.customers c
      where c.tenant_id = $1 and c.id = $3 and c.status <> 'do_not_contact'
      for update
    ),
    target as (
      select id from public.customers where tenant_id = $1 and id = $2 for update
    ),
    clear_primary as (
      update public.customer_locations set is_primary = false, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_locations as (
      update public.customer_locations set customer_id = $2, updated_at = now()
      where tenant_id = $1 and id in (select id from clear_primary) returning id
    ),
    move_contacts as (
      update public.customer_location_contacts set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_assets as (
      update public.customer_assets set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_estimates as (
      update public.service_estimates set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_jobs as (
      update public.service_jobs set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_invoices as (
      update public.service_invoices set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_payment_links as (
      update public.service_invoice_payment_links set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_payments as (
      update public.service_invoice_payments set customer_id = $2
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_ledger as (
      update public.service_ledger_entries set customer_id = $2
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_work_orders as (
      update public.service_work_orders set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_visits as (
      update public.service_visits set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_plans as (
      update public.recurring_service_plans set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_conversations as (
      update public.messaging_conversations set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_legacy_threads as (
      update public.communication_threads set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_followups as (
      update public.follow_up_workflows set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_estimate_links as (
      update public.estimate_share_links set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_estimate_acceptances as (
      update public.estimate_acceptances set customer_id = $2
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_portal_requests as (
      update public.customer_portal_requests set customer_id = $2, updated_at = now()
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_portal_messages as (
      update public.customer_portal_messages set customer_id = $2
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    move_portal_documents as (
      update public.customer_portal_documents set customer_id = $2
      where tenant_id = $1 and customer_id = $3 returning id
    ),
    copy_tags as (
      insert into public.customer_tag_assignments (tenant_id, customer_id, tag_id)
      select tenant_id, $2, tag_id from public.customer_tag_assignments
      where tenant_id = $1 and customer_id = $3
      on conflict (customer_id, tag_id) do nothing
    ),
    copy_fields as (
      insert into public.customer_custom_field_values (tenant_id, customer_id, definition_id, value_json)
      select tenant_id, $2, definition_id, value_json
      from public.customer_custom_field_values where tenant_id = $1 and customer_id = $3
      on conflict (customer_id, definition_id) do nothing
    ),
    copy_portal as (
      insert into public.customer_portal_access (
        tenant_id, customer_id, public_token, token_hash, enabled, expires_at, last_viewed_at, created_at, updated_at
      )
      select tenant_id, $2, null, token_hash, enabled, expires_at, last_viewed_at, created_at, now()
      from public.customer_portal_access where tenant_id = $1 and customer_id = $3
      on conflict (tenant_id, customer_id) do nothing
    ),
    deactivate_source as (
      update public.customers
      set status = 'inactive',
        notes = concat_ws(E'\\n', nullif(notes, ''), 'Merged into customer ' || $2::text || '.'),
        updated_at = now()
      where tenant_id = $1 and id = $3
    )
    insert into public.customer_merge_audits (
      tenant_id, target_customer_id, source_customer_id, reason,
      source_snapshot_json, affected_counts_json, merged_by_user_id
    )
    select $1, $2, $3, 'Owner-confirmed duplicate merge', source.snapshot,
      jsonb_build_object(
        'locations', (select count(*) from move_locations),
        'assets', (select count(*) from move_assets),
        'estimates', (select count(*) from move_estimates),
        'jobs', (select count(*) from move_jobs),
        'invoices', (select count(*) from move_invoices),
        'payments', (select count(*) from move_payments),
        'workOrders', (select count(*) from move_work_orders),
        'visits', (select count(*) from move_visits),
        'plans', (select count(*) from move_plans)
      ),
      $4
    from source, target
    returning id
    `,
    [
      tenantId, parsed.data.targetCustomerId, parsed.data.sourceCustomerId,
      actor.userId === "admin-token" ? null : actor.userId
    ]
    );
    if (mergeAudit.rowCount !== 1) {
      throw new Error("The customer merge did not create its required audit record.");
    }

    await client.query(
      `
      delete from public.customer_tag_assignments where tenant_id = $1 and customer_id = $2;
      delete from public.customer_custom_field_values where tenant_id = $1 and customer_id = $2;
      delete from public.customer_portal_access where tenant_id = $1 and customer_id = $2;
      `,
      [tenantId, parsed.data.sourceCustomerId]
    );
  });
  revalidatePath("/app/service");
  revalidatePath(`/app/service/customers/${parsed.data.targetCustomerId}`);
}

export async function createRecurringPlanAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = recurringPlanSchema.safeParse({
    customerId: formData.get("customerId"),
    membershipProgramId: String(formData.get("membershipProgramId") ?? "") || undefined,
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
      membership_program_id,
      title,
      service_type,
      frequency,
      status,
      next_service_date,
      price_cents,
      internal_notes,
      ai_next_action, started_at, renews_at, visits_remaining, auto_renew, billing_status
    )
    select $1, $2, program.id, $4, $5, coalesce(program.billing_frequency,$6), $7, $8,
      coalesce(program.price_cents,$9), $10, $11, current_date,
      case coalesce(program.billing_frequency,$6)
        when 'monthly' then (current_date+interval '1 month')::date
        when 'quarterly' then (current_date+interval '3 months')::date
        when 'annual' then (current_date+interval '1 year')::date
        else null end,
      program.visits_per_year, true, 'manual'
    from (select 1) seed
    left join public.membership_programs program
      on program.tenant_id=$1 and program.id=$3::uuid and program.active
    where $3::uuid is null or program.id is not null
    `,
    [
      workspaceId,
      parsed.data.customerId,
      parsed.data.membershipProgramId ?? null,
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

export async function updateMembershipLifecycleAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = membershipLifecycleSchema.safeParse({
    planId: formData.get("planId"),
    nextStatus: formData.get("nextStatus"),
    idempotencyKey: formData.get("idempotencyKey"),
    cancellationReason: String(formData.get("cancellationReason") ?? ""),
    renewsAt: String(formData.get("renewsAt") ?? "")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  const result = await updateMembershipLifecycle({
    tenantId: workspaceId,
    planId: parsed.data.planId,
    nextStatus: parsed.data.nextStatus,
    idempotencyKey: parsed.data.idempotencyKey,
    cancellationReason: parsed.data.cancellationReason,
    renewsAt: parsed.data.renewsAt || null
  });
  revalidatePath("/app/service");
  if (result.customerId) revalidatePath(`/app/service/customers/${result.customerId}`);
}

export async function generateDueMembershipVisitsAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = customerPortalSchema.safeParse({ customerId: formData.get("customerId") });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await generateDueMembershipVisits(workspaceId, parsed.data.customerId);
  revalidatePath("/app/schedule");
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
    locationId: String(formData.get("locationId") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with selected_location as (
      select id, name from public.inventory_locations
      where tenant_id = $1 and id = $8::uuid and active
    ), inserted as (
    insert into public.service_inventory_items (
      tenant_id,
      name,
      category,
      status,
      quantity,
      reorder_threshold,
      unit,
      location, inventory_location_id,
      notes
    )
    select $1, $2, $3, $4, $5, $6, $7, l.name, l.id, $9
    from (select 1) seed
    left join selected_location l on true
    where $5 = 0 or l.id is not null
    returning id, inventory_location_id
    )
    insert into public.inventory_location_balances (tenant_id, inventory_item_id, location_id, quantity)
    select $1, id, inventory_location_id, $5 from inserted where inventory_location_id is not null
    `,
    [
      workspaceId,
      parsed.data.name.trim(),
      parsed.data.category,
      parsed.data.status,
      parsed.data.quantity,
      parsed.data.reorderThreshold,
      emptyToNull(parsed.data.unit),
      parsed.data.locationId || null,
      emptyToNull(parsed.data.notes)
    ]
  );
  revalidatePath("/app/service/inventory");
}

export async function createInventoryLocationAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = inventoryLocationSchema.safeParse({
    name: formData.get("name"),
    locationType: formData.get("locationType"),
    address: String(formData.get("address") ?? "")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.inventory_locations (tenant_id, name, location_type, address)
    values ($1, $2, $3, $4)
    on conflict (tenant_id, name)
    do update set location_type = excluded.location_type, address = excluded.address,
      active = true, updated_at = now()
    `,
    [workspaceId, parsed.data.name, parsed.data.locationType, emptyToNull(parsed.data.address)]
  );
  revalidatePath("/app/service/inventory");
}

export async function adjustInventoryQuantityAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = inventoryAdjustmentSchema.safeParse({
    itemId: formData.get("itemId"),
    locationId: formData.get("locationId"),
    quantityDelta: formData.get("quantityDelta"),
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey")
  });
  if (!parsed.success) return;
  const workspaceId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    with locked as (
      select i.id, i.quantity, i.unit_cost_cents, b.quantity location_quantity
      from public.service_inventory_items i
      join public.inventory_location_balances b
        on b.tenant_id=i.tenant_id and b.inventory_item_id=i.id and b.location_id=$3
      where i.tenant_id = $1 and i.id = $2
      for update of i,b
    ),
    movement as (
      insert into public.inventory_transactions (
        tenant_id, inventory_item_id, from_location_id, to_location_id, transaction_type, quantity_delta, unit_cost_cents, reason, source, idempotency_key
      )
      select $1, id, $3, $3, 'adjust', $4, unit_cost_cents, $5, 'inventory_page', $6
      from locked
      where quantity + $4 >= 0 and location_quantity + $4 >= 0
      on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing
      returning inventory_item_id
    ), updated_balance as (
      update public.inventory_location_balances b
      set quantity=b.quantity+$4, updated_at=now()
      from movement m
      where b.tenant_id=$1 and b.inventory_item_id=m.inventory_item_id and b.location_id=$3
      returning b.inventory_item_id
    )
    update public.service_inventory_items i
    set quantity = i.quantity + $4,
      status = case
        when i.status in ('maintenance', 'retired') then i.status
        when i.quantity + $4 <= 0 then 'reserved'
        else 'available'
      end,
      updated_at = now()
    from updated_balance b
    where i.tenant_id = $1 and i.id = b.inventory_item_id
    `,
    [workspaceId, parsed.data.itemId, parsed.data.locationId, parsed.data.quantityDelta, parsed.data.reason, parsed.data.idempotencyKey]
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
