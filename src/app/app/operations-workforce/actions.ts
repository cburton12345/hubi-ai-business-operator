"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { extractReceiptFieldsWithVision } from "@/lib/operations-workforce/receipt-extraction";
import { isUploadFile, uploadReceiptPhoto } from "@/lib/operations-workforce/receipt-upload";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cents(value: string | undefined) {
  if (!value) return 0;
  const number = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

const workerSchema = z.object({
  name: z.string().min(2).max(160),
  roleType: z.enum(["owner", "office_manager", "crew_leader", "employee", "subcontractor", "manager", "other"]),
  trade: z.string().max(120).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().email().optional(),
  hourlyRate: z.string().optional(),
  payrollType: z.enum(["hourly", "salary", "piece_rate", "per_job", "subcontractor"])
});

const assignmentSchema = z.object({
  title: z.string().min(2).max(180),
  workerId: z.string().uuid().optional(),
  jobsite: z.string().max(220).optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  taskList: z.string().max(2000).optional()
});

const clockSchema = z.object({
  workerId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  clockInLocation: z.string().max(220).optional(),
  notes: z.string().max(1000).optional(),
  gpsVerified: z.boolean().default(false)
});

const clockOutSchema = z.object({
  timeEntryId: z.string().uuid(),
  clockOutLocation: z.string().max(220).optional(),
  breakMinutes: z.string().optional(),
  notes: z.string().max(1000).optional()
});

const expenseSchema = z.object({
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  vendor: z.string().max(160).optional(),
  amount: z.string().optional(),
  tax: z.string().optional(),
  category: z.string().max(120).optional(),
  assignTo: z.enum(["job", "customer", "department", "overhead"]),
  receiptUrl: z.string().url().optional(),
  extractReceipt: z.literal("on").optional(),
  reimbursementStatus: z.enum(["not_reimbursable", "submitted", "approved", "paid", "rejected"]),
  reimbursementDueDate: z.string().optional(),
  aiSummary: z.string().max(1000).optional()
});

const recurringExpenseSchema = z.object({
  vendor: z.string().min(2).max(160),
  description: z.string().max(300).optional(),
  amount: z.string().optional(),
  tax: z.string().optional(),
  category: z.string().max(120).optional(),
  assignTo: z.enum(["job", "customer", "department", "overhead"]),
  cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually"]),
  nextDueDate: z.string().optional(),
  autopostMode: z.enum(["review_first", "auto_create_draft", "paused"])
});

const mileageSchema = z.object({
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  vehicleLabel: z.string().max(120).optional(),
  startLocation: z.string().max(220).optional(),
  endLocation: z.string().max(220).optional(),
  miles: z.string().optional(),
  entryMethod: z.enum(["manual", "gps", "vehicle_integration"])
});

const materialSchema = z.object({
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  materialName: z.string().min(2).max(180),
  quantity: z.string().optional(),
  unit: z.string().max(40).optional(),
  logType: z.enum(["purchased", "used", "returned", "waste", "requested"]),
  cost: z.string().optional()
});

const locationPingSchema = z.object({
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  locationLabel: z.string().max(220).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  accuracyMeters: z.string().optional(),
  pingSource: z.enum(["manual", "gps", "qr", "vehicle_integration"]),
  alertStatus: z.enum(["normal", "late", "off_route", "missing_ping", "needs_review"])
});

const fieldMediaSchema = z.object({
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  mediaType: z.enum(["photo", "video", "document", "receipt", "ai_walkthrough"]),
  title: z.string().min(2).max(180),
  fileUrl: z.string().url().optional(),
  aiSummary: z.string().max(1000).optional(),
  consentStatus: z.enum(["internal_only", "permission_requested", "approved_for_customer", "approved_for_marketing"])
});

const payrollExportSchema = z.object({
  exportId: z.string().uuid().optional(),
  provider: z.enum(["csv", "quickbooks", "gusto", "adp", "manual"]),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().max(1000).optional()
});

const customerUpdateSchema = z.object({
  draftId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  channel: z.enum(["sms", "email", "portal", "phone_note"]),
  recipientContact: z.string().max(220).optional(),
  subject: z.string().max(180).optional(),
  body: z.string().min(4).max(2000)
});

const idSchema = z.object({
  id: z.string().uuid()
});

function tasksFromText(value?: string) {
  return JSON.stringify(
    (value ?? "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title) => ({ title, status: "open" }))
  );
}

function timestamp(value?: string) {
  return value ? new Date(value).toISOString() : null;
}

function numeric(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function createWorkerAction(formData: FormData) {
  const parsed = workerSchema.safeParse({
    name: text(formData, "name"),
    roleType: text(formData, "roleType") ?? "employee",
    trade: text(formData, "trade"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    hourlyRate: text(formData, "hourlyRate"),
    payrollType: text(formData, "payrollType") ?? "hourly"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_workers (
      tenant_id, name, role_type, trade, phone, email, hourly_rate_cents, payroll_type, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    `,
    [
      tenantId,
      parsed.data.name,
      parsed.data.roleType,
      parsed.data.trade ?? null,
      parsed.data.phone ?? null,
      parsed.data.email ?? null,
      cents(parsed.data.hourlyRate),
      parsed.data.payrollType,
      JSON.stringify({ source: "operations_workforce" })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createAssignmentAction(formData: FormData) {
  const parsed = assignmentSchema.safeParse({
    title: text(formData, "title"),
    workerId: text(formData, "workerId"),
    jobsite: text(formData, "jobsite"),
    scheduledStart: text(formData, "scheduledStart"),
    scheduledEnd: text(formData, "scheduledEnd"),
    priority: text(formData, "priority") ?? "normal",
    taskList: text(formData, "taskList")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_assignments (
      tenant_id, worker_id, title, jobsite, scheduled_start, scheduled_end, priority,
      task_list_json, ai_dispatch_notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.title,
      parsed.data.jobsite ?? null,
      timestamp(parsed.data.scheduledStart),
      timestamp(parsed.data.scheduledEnd),
      parsed.data.priority,
      tasksFromText(parsed.data.taskList),
      "AI Dispatcher note: confirm skill fit, route, material pickup, and jobsite proximity before the schedule is final.",
      JSON.stringify({ dragDropReady: true, views: ["daily", "weekly", "monthly", "crew", "job"] })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createClockInAction(formData: FormData) {
  const parsed = clockSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    clockInLocation: text(formData, "clockInLocation"),
    notes: text(formData, "notes"),
    gpsVerified: formData.get("gpsVerified") === "on"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_time_entries (
      tenant_id, worker_id, assignment_id, clock_in_location, gps_verified, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId,
      parsed.data.assignmentId ?? null,
      parsed.data.clockInLocation ?? null,
      parsed.data.gpsVerified,
      parsed.data.notes ?? null,
      JSON.stringify({ clockMode: parsed.data.gpsVerified ? "gps_verified" : "manual" })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function clockOutTimeEntryAction(formData: FormData) {
  const parsed = clockOutSchema.safeParse({
    timeEntryId: text(formData, "timeEntryId"),
    clockOutLocation: text(formData, "clockOutLocation"),
    breakMinutes: text(formData, "breakMinutes"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.operations_time_entries
    set
      clock_out_at = now(),
      clock_out_location = $3,
      break_minutes = $4,
      status = 'needs_review',
      notes = concat_ws(E'\n', nullif(notes, ''), nullif($5, '')),
      metadata_json = metadata_json || $6::jsonb,
      updated_at = now()
    where id = $1 and tenant_id = $2 and status = 'open'
    `,
    [
      parsed.data.timeEntryId,
      tenantId,
      parsed.data.clockOutLocation ?? null,
      Math.max(0, Math.round(numeric(parsed.data.breakMinutes))),
      parsed.data.notes ?? null,
      JSON.stringify({ clockOutMode: "manual", payrollReviewRequired: true })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createExpenseAction(formData: FormData) {
  const parsed = expenseSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    vendor: text(formData, "vendor"),
    amount: text(formData, "amount"),
    tax: text(formData, "tax"),
    category: text(formData, "category"),
    assignTo: text(formData, "assignTo") ?? "job",
    receiptUrl: text(formData, "receiptUrl"),
    extractReceipt: text(formData, "extractReceipt"),
    reimbursementStatus: text(formData, "reimbursementStatus") ?? "submitted",
    reimbursementDueDate: text(formData, "reimbursementDueDate"),
    aiSummary: text(formData, "aiSummary")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const receiptPhoto = isUploadFile(formData.get("receiptPhoto")) ? formData.get("receiptPhoto") as File : null;
  const uploaded = await uploadReceiptPhoto(tenantId, receiptPhoto);
  const extractionRequested = parsed.data.extractReceipt === "on";
  const extracted = extractionRequested
    ? await extractReceiptFieldsWithVision({
        tenantId,
        vendor: parsed.data.vendor,
        text: [parsed.data.vendor, parsed.data.category, parsed.data.amount, parsed.data.tax ? `tax ${parsed.data.tax}` : null, parsed.data.aiSummary, uploaded.fileName].filter(Boolean).join("\n"),
        fileName: uploaded.fileName,
        imageUrl: uploaded.signedUrl ?? parsed.data.receiptUrl ?? null,
        mimeType: uploaded.mimeType ?? (parsed.data.receiptUrl ? "image/unknown" : null)
      })
    : null;
  const vendor = parsed.data.vendor ?? extracted?.vendor ?? null;
  const amountCents = cents(parsed.data.amount) || extracted?.totalCents || 0;
  const taxCents = cents(parsed.data.tax) || extracted?.taxCents || 0;
  const category = parsed.data.category ?? extracted?.category ?? "materials";
  const receiptUrl = uploaded.storageUri ?? parsed.data.receiptUrl ?? null;
  const expense = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_expenses (
      tenant_id, worker_id, assignment_id, vendor, expense_date, amount_cents, tax_cents,
      category, assign_to, receipt_url, ai_summary, reimbursement_status, reimbursement_due_date,
      reimbursement_notes, metadata_json
    )
    values ($1,$2,$3,$4,current_date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      vendor,
      amountCents,
      taxCents,
      category,
      parsed.data.assignTo,
      receiptUrl,
      parsed.data.aiSummary ?? (extractionRequested ? "Receipt submitted. Ferocity drafted the expense details for office review." : "Receipt details recorded for review."),
      parsed.data.reimbursementStatus,
      parsed.data.reimbursementDueDate || null,
      parsed.data.aiSummary ?? null,
      JSON.stringify({
        receiptUploadReady: true,
        providerExtraction: extractionRequested ? "requested" : "available_when_requested",
        ownerReminder: parsed.data.reimbursementStatus === "submitted",
        receiptUploadStatus: uploaded.uploadStatus,
        receiptPhotoName: uploaded.fileName,
        receiptPhotoMimeType: uploaded.mimeType,
        receiptUploadError: uploaded.uploadError,
        extractedFields: extracted,
        reviewRequired: true
      })
    ]
  );
  const expenseId = expense?.rows[0]?.id;
  if (expenseId && (receiptUrl || extracted || uploaded.fileName)) {
    const media = await queryPostgres<{ id: string }>(
      `
      insert into public.operations_field_media (
        tenant_id, worker_id, assignment_id, media_type, title, file_url, ai_summary,
        customer_visible, consent_status, status, metadata_json
      )
      values ($1,$2,$3,'receipt',$4,$5,$6,false,'internal_only','needs_review',$7::jsonb)
      returning id
      `,
      [
        tenantId,
        parsed.data.workerId ?? null,
        parsed.data.assignmentId ?? null,
        vendor ?? uploaded.fileName ?? "Receipt",
        receiptUrl,
        parsed.data.aiSummary ?? "Receipt submitted from employee view.",
        JSON.stringify({ source: "employee_view", expenseId, uploadStatus: uploaded.uploadStatus })
      ]
    );
    const mediaId = media?.rows[0]?.id;
    if (mediaId && extracted) {
      await queryPostgres(
        `
        insert into public.operations_receipt_extractions (
          tenant_id, field_media_id, expense_id, vendor, extracted_total_cents, confidence, extracted_text, extracted_fields_json
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `,
        [
          tenantId,
          mediaId,
          expenseId,
          extracted.vendor,
          extracted.totalCents,
          extracted.confidence,
          extracted.extractedText,
          JSON.stringify(extracted.fields)
        ]
      );
    }
  }
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/employee");
}

export async function createRecurringExpenseAction(formData: FormData) {
  const parsed = recurringExpenseSchema.safeParse({
    vendor: text(formData, "vendor"),
    description: text(formData, "description"),
    amount: text(formData, "amount"),
    tax: text(formData, "tax"),
    category: text(formData, "category"),
    assignTo: text(formData, "assignTo") ?? "overhead",
    cadence: text(formData, "cadence") ?? "monthly",
    nextDueDate: text(formData, "nextDueDate"),
    autopostMode: text(formData, "autopostMode") ?? "review_first"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.recurring_operating_expenses (
      tenant_id, vendor, description, category, assign_to, amount_cents, tax_cents,
      cadence, next_due_date, autopost_mode, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    `,
    [
      tenantId,
      parsed.data.vendor,
      parsed.data.description ?? null,
      parsed.data.category ?? "overhead",
      parsed.data.assignTo,
      cents(parsed.data.amount),
      cents(parsed.data.tax),
      parsed.data.cadence,
      parsed.data.nextDueDate || null,
      parsed.data.autopostMode,
      JSON.stringify({ createdFrom: "operations_workforce", livePayment: false, reviewBeforeExpense: true })
    ]
  );
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app");
}

export async function updateRecurringExpenseStatusAction(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "paused", "archived"])
  }).safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.recurring_operating_expenses
    set status = $3,
        autopost_mode = case when $3 = 'paused' then 'paused' else autopost_mode end,
        updated_at = now()
    where id = $1 and tenant_id = $2
    `,
    [parsed.data.id, tenantId, parsed.data.status]
  );
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app");
}

export async function createMileageAction(formData: FormData) {
  const parsed = mileageSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    vehicleLabel: text(formData, "vehicleLabel"),
    startLocation: text(formData, "startLocation"),
    endLocation: text(formData, "endLocation"),
    miles: text(formData, "miles"),
    entryMethod: text(formData, "entryMethod") ?? "manual"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_mileage_entries (
      tenant_id, worker_id, assignment_id, vehicle_label, start_location, end_location, miles, entry_method, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.vehicleLabel ?? null,
      parsed.data.startLocation ?? null,
      parsed.data.endLocation ?? null,
      numeric(parsed.data.miles),
      parsed.data.entryMethod,
      JSON.stringify({ irsFriendly: true })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createMaterialLogAction(formData: FormData) {
  const parsed = materialSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    materialName: text(formData, "materialName"),
    quantity: text(formData, "quantity"),
    unit: text(formData, "unit"),
    logType: text(formData, "logType") ?? "used",
    cost: text(formData, "cost")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_material_logs (
      tenant_id, worker_id, assignment_id, material_name, quantity, unit, log_type, cost_cents, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.materialName,
      numeric(parsed.data.quantity),
      parsed.data.unit ?? null,
      parsed.data.logType,
      cents(parsed.data.cost),
      JSON.stringify({ source: "operations_workforce" })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createLocationPingAction(formData: FormData) {
  const parsed = locationPingSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    locationLabel: text(formData, "locationLabel"),
    latitude: text(formData, "latitude"),
    longitude: text(formData, "longitude"),
    accuracyMeters: text(formData, "accuracyMeters"),
    pingSource: text(formData, "pingSource") ?? "manual",
    alertStatus: text(formData, "alertStatus") ?? "normal"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_location_pings (
      tenant_id, worker_id, assignment_id, latitude, longitude, accuracy_meters,
      location_label, ping_source, alert_status, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      numeric(parsed.data.latitude),
      numeric(parsed.data.longitude),
      numeric(parsed.data.accuracyMeters),
      parsed.data.locationLabel ?? null,
      parsed.data.pingSource,
      parsed.data.alertStatus,
      JSON.stringify({ optionalTracking: true, consentRequired: true })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createFieldMediaAction(formData: FormData) {
  const parsed = fieldMediaSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    mediaType: text(formData, "mediaType") ?? "photo",
    title: text(formData, "title"),
    fileUrl: text(formData, "fileUrl"),
    aiSummary: text(formData, "aiSummary"),
    consentStatus: text(formData, "consentStatus") ?? "internal_only"
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const insert = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_field_media (
      tenant_id, worker_id, assignment_id, media_type, title, file_url, ai_summary,
      customer_visible, consent_status, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.mediaType,
      parsed.data.title,
      parsed.data.fileUrl ?? null,
      parsed.data.aiSummary ?? "AI proof summary pending.",
      parsed.data.consentStatus === "approved_for_customer" || parsed.data.consentStatus === "approved_for_marketing",
      parsed.data.consentStatus,
      JSON.stringify({ uploadPipeline: "ready", aiWalkthroughLinkReady: true })
    ]
  );
  const fieldMediaId = insert?.rows[0]?.id;
  if (fieldMediaId && parsed.data.mediaType === "receipt") {
    const extracted = await extractReceiptFieldsWithVision({
      tenantId,
      vendor: parsed.data.title,
      text: parsed.data.aiSummary ?? parsed.data.title,
      imageUrl: parsed.data.fileUrl ?? null,
      mimeType: parsed.data.fileUrl ? "image/unknown" : null
    });
    await queryPostgres(
      `
      insert into public.operations_receipt_extractions (
        tenant_id, field_media_id, vendor, extracted_total_cents, confidence, extracted_text, extracted_fields_json
      )
      values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      `,
      [
        tenantId,
        fieldMediaId,
        extracted.vendor,
        extracted.totalCents,
        extracted.confidence,
        extracted.extractedText,
        JSON.stringify(extracted.fields)
      ]
    );
  }
  revalidatePath("/app/operations-workforce");
}

export async function createPayrollExportAction(formData: FormData) {
  const parsed = payrollExportSchema.safeParse({
    provider: text(formData, "provider") ?? "csv",
    periodStart: text(formData, "periodStart"),
    periodEnd: text(formData, "periodEnd"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const periodStart = parsed.data.periodStart ? new Date(parsed.data.periodStart).toISOString().slice(0, 10) : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const periodEnd = parsed.data.periodEnd ? new Date(parsed.data.periodEnd).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  await queryPostgres(
    `
    insert into public.operations_payroll_exports (
      tenant_id, provider, period_start, period_end, total_hours, total_gross_cents, export_payload_json, notes
    )
    select
      $1, $2, $3::date, $4::date,
      coalesce(sum(extract(epoch from (coalesce(clock_out_at, now()) - clock_in_at)) / 3600 - (break_minutes::numeric / 60)), 0),
      0,
      jsonb_build_object('review_required', true, 'provider_send_enabled', false, 'source', 'operations_workforce'),
      $5
    from public.operations_time_entries
    where tenant_id = $1 and clock_in_at::date between $3::date and $4::date
    `,
    [tenantId, parsed.data.provider, periodStart, periodEnd, parsed.data.notes ?? "Draft export. Provider send disabled until connected and approved."]
  );
  revalidatePath("/app/operations-workforce");
}

export async function createCustomerUpdateDraftAction(formData: FormData) {
  const parsed = customerUpdateSchema.safeParse({
    assignmentId: text(formData, "assignmentId"),
    channel: text(formData, "channel") ?? "sms",
    recipientContact: text(formData, "recipientContact"),
    subject: text(formData, "subject"),
    body: text(formData, "body")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_customer_update_drafts (
      tenant_id, assignment_id, channel, recipient_contact, subject, body, approval_required, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,true,$7::jsonb)
    `,
    [
      tenantId,
      parsed.data.assignmentId ?? null,
      parsed.data.channel,
      parsed.data.recipientContact ?? null,
      parsed.data.subject ?? null,
      parsed.data.body,
      JSON.stringify({ providerSendEnabled: false, approvalGate: "required" })
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function approveCustomerUpdateDraftAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.operations_customer_update_drafts
    set send_status = 'approved',
        updated_at = now(),
        metadata_json = metadata_json || $3::jsonb
    where tenant_id = $1 and id = $2 and send_status = 'draft'
    `,
    [tenantId, parsed.data.id, JSON.stringify({ approvedAt: new Date().toISOString() })]
  );
  revalidatePath("/app/operations-workforce");
}

export async function sendCustomerUpdateDraftAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    channel: string;
    recipient_contact: string | null;
    subject: string | null;
    body: string;
    send_status: string;
  }>(
    `
    select id, channel, recipient_contact, subject, body, send_status
    from public.operations_customer_update_drafts
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, parsed.data.id]
  );
  const draft = result?.rows[0];
  if (!draft) return;
  if (draft.send_status !== "approved" && draft.send_status !== "queued") {
    await queryPostgres(
      `
      update public.operations_customer_update_drafts
      set metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [tenantId, draft.id, JSON.stringify({ sendBlocked: "Draft must be approved first." })]
    );
    revalidatePath("/app/operations-workforce");
    return;
  }

  let sendResult: { ok: true; providerMessageId: string | null } | { ok: false; error: string; status?: number };
  if (draft.channel === "email") {
    const email = z.string().email().safeParse(draft.recipient_contact ?? "");
    sendResult = email.success
      ? await sendMessage({
          channel: "email",
          to: email.data,
          subject: draft.subject ?? "Update from your service team",
          body: draft.body,
          queueId: `operations_customer_update:${draft.id}`,
          idempotencyKey: `operations-customer-update:${draft.id}`,
          authorization: {
            source: "approved_operations_update",
            humanApproved: draft.send_status === "approved",
            policyAllowsAuto: draft.send_status === "queued"
          },
          tenantId
        })
      : { ok: false, error: "Missing valid email recipient." };
  } else if (draft.channel === "sms") {
    sendResult = draft.recipient_contact
      ? await sendMessage({
          tenantId,
          channel: "sms",
          to: draft.recipient_contact,
          body: draft.body,
          queueId: `operations_customer_update:${draft.id}`,
          idempotencyKey: `operations-customer-update:${draft.id}`,
          authorization: {
            source: "approved_operations_update",
            humanApproved: draft.send_status === "approved",
            policyAllowsAuto: draft.send_status === "queued"
          }
        })
      : { ok: false, error: "Missing text message recipient." };
  } else {
    sendResult = { ok: true, providerMessageId: `manual:${draft.channel}:${draft.id}` };
  }

  await queryPostgres(
    `
    update public.operations_customer_update_drafts
    set send_status = $3,
        provider_message_id = $4,
        metadata_json = metadata_json || $5::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      draft.id,
      sendResult.ok ? "sent" : "draft",
      sendResult.ok ? sendResult.providerMessageId : null,
      JSON.stringify(
        sendResult.ok
          ? { sentAt: new Date().toISOString(), providerMessageId: sendResult.providerMessageId }
          : { sendBlocked: sendResult.error, providerStatus: "status" in sendResult ? sendResult.status : 0 }
      )
    ]
  );
  revalidatePath("/app/operations-workforce");
}

export async function markPayrollExportReadyAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.operations_payroll_exports
    set status = 'ready',
        export_payload_json = export_payload_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status = 'draft'
    `,
    [tenantId, parsed.data.id, JSON.stringify({ readyForDownloadOrProvider: true, providerSendEnabled: false })]
  );
  revalidatePath("/app/operations-workforce");
}

export async function markPayrollExportedAction(formData: FormData) {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.operations_payroll_exports
    set status = 'exported',
        export_payload_json = export_payload_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2 and status in ('ready','draft')
    `,
    [tenantId, parsed.data.id, JSON.stringify({ exportedAt: new Date().toISOString(), exportedManually: true })]
  );
  revalidatePath("/app/operations-workforce");
}
