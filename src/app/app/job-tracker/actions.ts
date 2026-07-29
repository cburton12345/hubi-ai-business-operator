"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { extractReceiptFieldsWithVision } from "@/lib/operations-workforce/receipt-extraction";
import { isUploadFile, uploadReceiptPhoto } from "@/lib/operations-workforce/receipt-upload";
import { dollarsToCents } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const optionalUuid = z.string().uuid().optional();

const paymentSchema = z.object({
  payeeName: z.string().min(2).max(160),
  workerId: optionalUuid,
  serviceJobId: optionalUuid,
  assignmentId: optionalUuid,
  paymentType: z.enum(["payroll", "subcontractor", "bonus", "reimbursement", "draw", "other"]),
  amount: z.string().optional(),
  paymentDate: z.string().optional(),
  method: z.enum(["manual", "cash", "check", "ach", "card", "payroll_provider", "other"]),
  status: z.enum(["planned", "recorded", "reviewed", "void"]),
  notes: z.string().max(1000).optional()
});

const materialSchema = z.object({
  materialName: z.string().min(2).max(180),
  serviceJobId: optionalUuid,
  assignmentId: optionalUuid,
  quantity: z.string().optional(),
  unit: z.string().max(40).optional(),
  estimatedCost: z.string().optional(),
  actualCost: z.string().optional(),
  status: z.enum(["needed", "ordered", "purchased", "used", "returned", "cancelled"]),
  notes: z.string().max(1000).optional()
});

const receiptSchema = z.object({
  workerId: optionalUuid,
  serviceJobId: optionalUuid,
  vendor: z.string().max(160).optional(),
  amount: z.string().optional(),
  tax: z.string().optional(),
  category: z.string().max(120).optional(),
  expenseDate: z.string().optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(80).optional(),
  receiptUrl: z.string().url().optional(),
  extractReceipt: z.literal("on").optional(),
  reimbursementStatus: z.enum(["not_reimbursable", "submitted", "approved", "paid", "rejected"]),
  reimbursementDueDate: z.string().optional(),
  notes: z.string().max(1000).optional()
});

const simpleBidSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().max(160).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(80).optional(),
  jobTitle: z.string().min(2).max(180),
  paymentTerms: z.string().max(1000).optional(),
  deposit: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().max(1500).optional()
});

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.string().min(2).max(40)
});

function dateOrToday(value?: string) {
  return value || new Date().toISOString().slice(0, 10);
}

function decimalOrNull(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cents(value?: string) {
  return dollarsToCents(value ?? null);
}

async function refresh() {
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/service-command");
  revalidatePath("/app/service");
  revalidatePath("/app");
}

function numberedRows(formData: FormData, prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      name: text(formData, `${prefix}${number}Name`),
      description: text(formData, `${prefix}${number}Description`),
      quantity: decimalOrNull(text(formData, `${prefix}${number}Quantity`)) ?? 1,
      unitPriceCents: dollarsToCents(text(formData, `${prefix}${number}UnitPrice`) ?? null)
    };
  }).filter((row) => row.name && row.unitPriceCents > 0);
}

function materialRows(formData: FormData, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      name: text(formData, `material${number}Name`),
      quantity: decimalOrNull(text(formData, `material${number}Quantity`)),
      unit: text(formData, `material${number}Unit`),
      estimatedCostCents: dollarsToCents(text(formData, `material${number}Cost`) ?? null)
    };
  }).filter((row) => row.name);
}

export async function createSimpleBidAction(formData: FormData) {
  const parsed = simpleBidSchema.safeParse({
    customerId: text(formData, "customerId"),
    customerName: text(formData, "customerName"),
    customerEmail: text(formData, "customerEmail"),
    customerPhone: text(formData, "customerPhone"),
    jobTitle: text(formData, "jobTitle"),
    paymentTerms: text(formData, "paymentTerms"),
    deposit: text(formData, "deposit"),
    validUntil: text(formData, "validUntil"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  let customerId = parsed.data.customerId;
  if (!customerId) {
    if (!parsed.data.customerName) return;
    const customerResult = await queryPostgres<{ id: string }>(
      `
      insert into public.customers (tenant_id, name, email, phone, notes, ai_summary)
      values ($1,$2,$3,$4,$5,$6)
      returning id
      `,
      [
        tenantId,
        parsed.data.customerName,
        parsed.data.customerEmail ?? null,
        parsed.data.customerPhone ?? null,
        parsed.data.notes ?? null,
        "Created from Simple Job Tracker bid flow."
      ]
    );
    customerId = customerResult?.rows[0]?.id;
  }
  if (!customerId) return;

  const lineItems = numberedRows(formData, "item", 6);
  if (lineItems.length === 0) return;
  const subtotalCents = lineItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPriceCents), 0);

  const estimateResult = await queryPostgres<{ id: string }>(
    `
    insert into public.service_estimates (
      tenant_id, customer_id, title, subtotal_cents, total_cents, customer_summary,
      internal_notes, manual_follow_up_draft, payment_terms, deposit_required_cents,
      acceptance_notes, valid_until
    )
    values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11)
    returning id
    `,
    [
      tenantId,
      customerId,
      parsed.data.jobTitle,
      subtotalCents,
      `Simple bid draft for ${parsed.data.jobTitle}. Review scope, payment terms, and materials before sending.`,
      parsed.data.notes ?? null,
      "Hi, I put together the bid for this work. Please review the scope, total, payment terms, and timing. Reply with any changes before approval.",
      parsed.data.paymentTerms ?? null,
      dollarsToCents(parsed.data.deposit ?? null),
      "Customer approval should be recorded before work is scheduled or materials are ordered.",
      parsed.data.validUntil || null
    ]
  );

  const estimateId = estimateResult?.rows[0]?.id;
  if (!estimateId) return;

  for (const [index, item] of lineItems.entries()) {
    await queryPostgres(
      `
      insert into public.estimate_line_items (
        tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents, position
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        tenantId,
        estimateId,
        item.name,
        item.description ?? null,
        item.quantity,
        item.unitPriceCents,
        Math.round(item.quantity * item.unitPriceCents),
        index
      ]
    );
  }

  for (const material of materialRows(formData, 5)) {
    await queryPostgres(
      `
      insert into public.job_material_list_items (
        tenant_id, material_name, quantity, unit, estimated_cost_cents, status, source, notes, metadata_json
      )
      values ($1,$2,$3,$4,$5,'needed','estimate',$6,$7::jsonb)
      `,
      [
        tenantId,
        material.name,
        material.quantity,
        material.unit ?? null,
        material.estimatedCostCents,
        `Created with bid ${parsed.data.jobTitle}. Link to job after the bid is approved.`,
        JSON.stringify({ estimateId, source: "simple_bid" })
      ]
    );
  }

  await refresh();
  revalidatePath(`/app/service/estimates/${estimateId}`);
}

export async function createWorkerPaymentAction(formData: FormData) {
  const parsed = paymentSchema.safeParse({
    payeeName: text(formData, "payeeName"),
    workerId: text(formData, "workerId"),
    serviceJobId: text(formData, "serviceJobId"),
    assignmentId: text(formData, "assignmentId"),
    paymentType: text(formData, "paymentType") ?? "payroll",
    amount: text(formData, "amount"),
    paymentDate: text(formData, "paymentDate"),
    method: text(formData, "method") ?? "manual",
    status: text(formData, "status") ?? "recorded",
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.operations_worker_payments (
      tenant_id, worker_id, service_job_id, assignment_id, payee_name, payment_type,
      amount_cents, payment_date, method, status, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.serviceJobId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.payeeName,
      parsed.data.paymentType,
      dollarsToCents(parsed.data.amount ?? null),
      dateOrToday(parsed.data.paymentDate),
      parsed.data.method,
      parsed.data.status,
      parsed.data.notes ?? null,
      JSON.stringify({ source: "job_tracker" })
    ]
  );
  await refresh();
}

export async function createMaterialListItemAction(formData: FormData) {
  const parsed = materialSchema.safeParse({
    materialName: text(formData, "materialName"),
    serviceJobId: text(formData, "serviceJobId"),
    assignmentId: text(formData, "assignmentId"),
    quantity: text(formData, "quantity"),
    unit: text(formData, "unit"),
    estimatedCost: text(formData, "estimatedCost"),
    actualCost: text(formData, "actualCost"),
    status: text(formData, "status") ?? "needed",
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    insert into public.job_material_list_items (
      tenant_id, service_job_id, assignment_id, material_name, quantity, unit,
      estimated_cost_cents, actual_cost_cents, status, source, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,$11::jsonb)
    `,
    [
      tenantId,
      parsed.data.serviceJobId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.materialName,
      decimalOrNull(parsed.data.quantity),
      parsed.data.unit ?? null,
      dollarsToCents(parsed.data.estimatedCost ?? null),
      dollarsToCents(parsed.data.actualCost ?? null),
      parsed.data.status,
      parsed.data.notes ?? null,
      JSON.stringify({ source: "job_tracker" })
    ]
  );
  await refresh();
}

export async function createReceiptExpenseAction(formData: FormData) {
  const parsed = receiptSchema.safeParse({
    workerId: text(formData, "workerId"),
    serviceJobId: text(formData, "serviceJobId"),
    vendor: text(formData, "vendor"),
    amount: text(formData, "amount"),
    tax: text(formData, "tax"),
    category: text(formData, "category"),
    expenseDate: text(formData, "expenseDate"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    receiptUrl: text(formData, "receiptUrl"),
    extractReceipt: text(formData, "extractReceipt"),
    reimbursementStatus: text(formData, "reimbursementStatus") ?? "submitted",
    reimbursementDueDate: text(formData, "reimbursementDueDate"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const receiptPhoto = isUploadFile(formData.get("receiptPhoto")) ? formData.get("receiptPhoto") as File : null;
  const uploaded = await uploadReceiptPhoto(tenantId, receiptPhoto);
  const extractionRequested = parsed.data.extractReceipt === "on";
  const extractionText = [
    parsed.data.vendor,
    parsed.data.category,
    parsed.data.amount,
    parsed.data.tax ? `tax ${parsed.data.tax}` : null,
    parsed.data.city && parsed.data.state ? `${parsed.data.city}, ${parsed.data.state}` : parsed.data.city,
    parsed.data.expenseDate,
    parsed.data.notes,
    uploaded.fileName
  ].filter(Boolean).join("\n");
  const extracted = extractionRequested
    ? await extractReceiptFieldsWithVision({
        tenantId,
        vendor: parsed.data.vendor,
        text: extractionText,
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
  const expenseDate = parsed.data.expenseDate ?? extracted?.expenseDate ?? null;
  const city = parsed.data.city ?? extracted?.city ?? null;
  const state = parsed.data.state ?? extracted?.state ?? null;
  const ownerReminder = parsed.data.reimbursementStatus === "submitted";
  const aiSummary = parsed.data.notes ?? (extractionRequested
    ? "Receipt submitted. Ferocity drafted fields for owner review before approval or payback."
    : "Receipt submitted for owner review.");
  const expenseResult = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_expenses (
      tenant_id, worker_id, service_job_id, vendor, expense_date, amount_cents, tax_cents,
      category, assign_to, receipt_url, ai_summary, status, reimbursement_status,
      reimbursement_due_date, reimbursement_notes, metadata_json
    )
    values ($1,$2,$3,$4,coalesce($5::date,current_date),$6,$7,$8,'job',$9,$10,'needs_review',$11,$12,$13,$14::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.workerId ?? null,
      parsed.data.serviceJobId ?? null,
      vendor,
      expenseDate,
      amountCents,
      taxCents,
      category,
      receiptUrl,
      aiSummary,
      parsed.data.reimbursementStatus,
      parsed.data.reimbursementDueDate || null,
      parsed.data.notes ?? null,
      JSON.stringify({
        source: "job_tracker",
        receiptFlow: true,
        ownerReminder,
        city,
        state,
        ocrRequested: extractionRequested,
        receiptPhotoName: uploaded.fileName,
        receiptPhotoMimeType: uploaded.mimeType,
        receiptUploadStatus: uploaded.uploadStatus,
        receiptUploadError: "uploadError" in uploaded ? uploaded.uploadError : undefined,
        extractedFields: extracted,
        reviewRequired: true
      })
    ]
  );
  const expenseId = expenseResult?.rows[0]?.id;

  if (expenseId && (receiptUrl || extractionRequested || uploaded.fileName)) {
    const fieldMedia = await queryPostgres<{ id: string }>(
      `
      insert into public.operations_field_media (
        tenant_id, worker_id, service_job_id, media_type, title, file_url, ai_summary,
        customer_visible, consent_status, status, metadata_json
      )
      values ($1,$2,$3,'receipt',$4,$5,$6,false,'internal_only','needs_review',$7::jsonb)
      returning id
      `,
      [
        tenantId,
        parsed.data.workerId ?? null,
        parsed.data.serviceJobId ?? null,
        vendor ?? uploaded.fileName ?? "Receipt",
        receiptUrl,
        aiSummary,
        JSON.stringify({
          source: "job_tracker",
          expenseId,
          uploadStatus: uploaded.uploadStatus,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType
        })
      ]
    );
    const fieldMediaId = fieldMedia?.rows[0]?.id;
    if (fieldMediaId && extracted) {
      await queryPostgres(
        `
        insert into public.operations_receipt_extractions (
          tenant_id, field_media_id, expense_id, vendor, extracted_total_cents, confidence, extracted_text, extracted_fields_json
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `,
        [
          tenantId,
          fieldMediaId,
          expenseId,
          extracted.vendor,
          extracted.totalCents,
          extracted.confidence,
          extracted.extractedText,
          JSON.stringify({
            ...extracted.fields,
            taxCents: extracted.taxCents,
            category: extracted.category,
            city: extracted.city,
            state: extracted.state,
            expenseDate: extracted.expenseDate,
            reimbursementLikely: extracted.reimbursementLikely
          })
        ]
      );
    }
  }
  await refresh();
  revalidatePath("/app/operations-workforce");
}

export async function updateWorkerPaymentStatusAction(formData: FormData) {
  const parsed = statusSchema.safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success || !["planned", "recorded", "reviewed", "void"].includes(parsed.data.status)) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    "update public.operations_worker_payments set status = $1, updated_at = now() where tenant_id = $2 and id = $3",
    [parsed.data.status, tenantId, parsed.data.id]
  );
  await refresh();
}

export async function updateMaterialStatusAction(formData: FormData) {
  const parsed = statusSchema.safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success || !["needed", "ordered", "purchased", "used", "returned", "cancelled"].includes(parsed.data.status)) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    "update public.job_material_list_items set status = $1, updated_at = now() where tenant_id = $2 and id = $3",
    [parsed.data.status, tenantId, parsed.data.id]
  );
  await refresh();
}

export async function updateReceiptExpenseAction(formData: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["needs_review", "approved", "rejected", "exported"]),
    reimbursementStatus: z.enum(["not_reimbursable", "submitted", "approved", "paid", "rejected"])
  }).safeParse({
    id: text(formData, "id"),
    status: text(formData, "status"),
    reimbursementStatus: text(formData, "reimbursementStatus")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.operations_expenses
    set status = $1,
        reimbursement_status = $2,
        paid_back_at = case when $2 = 'paid' and paid_back_at is null then now() else paid_back_at end,
        paid_back_cents = case when $2 = 'paid' and paid_back_cents = 0 then amount_cents + tax_cents else paid_back_cents end,
        updated_at = now()
    where tenant_id = $3 and id = $4
    `,
    [parsed.data.status, parsed.data.reimbursementStatus, tenantId, parsed.data.id]
  );
  await refresh();
  revalidatePath("/app/operations-workforce");
}
