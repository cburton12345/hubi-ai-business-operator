"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashSessionToken, randomSessionToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { canAccessEmployeeAssignment, getEmployeeAccessContext } from "@/lib/employee/employee-access";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { uploadFieldMediaFile } from "@/lib/operations-workforce/field-media-upload";
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
  payrollType: z.enum(["hourly", "salary", "piece_rate", "per_job", "subcontractor"]),
  preferredLanguage: z.enum(["en", "es"]),
  sendInvite: z.boolean()
});

const cashAdvanceSchema = z.object({
  workerId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  amount: z.string().min(1),
  advancedAt: z.string().optional(),
  paymentMethod: z.enum(["cash", "check", "bank_transfer", "payroll", "other"]),
  purpose: z.string().max(600).optional()
});

const cashAdvanceResponseSchema = z.object({
  advanceId: z.string().uuid(),
  response: z.enum(["acknowledged", "disputed"]),
  note: z.string().max(600).optional()
});

const employeeLanguageSchema = z.object({
  language: z.enum(["en", "es"])
});

const employeeAccessDecisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  ownerNote: z.string().max(600).optional()
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

function employeeInviteUrl(token: string) {
  const baseUrl = env.FEROCITY_APP_URL ?? "https://ferocity.live";
  return new URL(`/invite/${token}`, baseUrl).toString();
}

async function createEmployeeInvite(input: {
  tenantId: string;
  workerId: string;
  workerName: string;
  email: string;
  invitedByUserId: string | null;
  language: "en" | "es";
}) {
  const token = randomSessionToken();
  const workspaceResult = await queryPostgres<{ name: string }>(
    "select name from public.tenants where id = $1 limit 1",
    [input.tenantId]
  );
  const workspaceName = workspaceResult?.rows[0]?.name ?? "your company";
  await queryPostgres(
    `
    insert into public.workspace_invites (
      tenant_id, email, role, status, invited_by_user_id, invite_token_hash, expires_at,
      worker_id, invite_purpose, updated_at
    )
    values ($1, lower($2), 'viewer', 'pending', $3, $4, now() + interval '14 days', $5, 'employee', now())
    on conflict (tenant_id, email) do update
    set role = 'viewer', status = 'pending', invited_by_user_id = excluded.invited_by_user_id,
        invite_token_hash = excluded.invite_token_hash, expires_at = excluded.expires_at,
        worker_id = excluded.worker_id, invite_purpose = 'employee', revoked_at = null, updated_at = now()
    `,
    [input.tenantId, input.email, input.invitedByUserId, hashSessionToken(token), input.workerId]
  );

  const spanish = input.language === "es";
  await sendTransactionalEmail({
    to: input.email,
    subject: spanish ? `Tu acceso de empleado a ${workspaceName}` : `Your employee access to ${workspaceName}`,
    text: spanish
      ? `Hola ${input.workerName},\n\n${workspaceName} te invitó a la aplicación de empleados de Ferocity. Tu enlace es privado, funciona una sola vez y vence en 14 días.\n\nCrear tu acceso:\n${employeeInviteUrl(token)}\n\nDespués de registrarte podrás ver tu horario, registrar horas, ubicación, trabajo realizado, millas, gastos y comprobantes.`
      : `Hi ${input.workerName},\n\n${workspaceName} invited you to the Ferocity employee app. Your link is private, works once, and expires in 14 days.\n\nCreate your access:\n${employeeInviteUrl(token)}\n\nAfter signing up, you can see your schedule and record hours, location, work performed, mileage, costs, and proof.`,
    tenantId: input.tenantId,
    eventKey: "employee_invite",
    metadata: { workerId: input.workerId, language: input.language, invitedByUserId: input.invitedByUserId }
  });
}

async function resolveWorkerActionTarget(
  formData: FormData,
  requestedWorkerId?: string,
  assignmentId?: string
) {
  const employeeMode = formData.get("employeeMode") === "1";
  if (employeeMode) {
    const context = await getEmployeeAccessContext();
    if (!context.workerId) return null;
    if (assignmentId && !(await canAccessEmployeeAssignment(context, assignmentId))) return null;
    return { tenantId: context.tenantId, workerId: context.workerId, employeeMode: true };
  }

  const actor = await requirePermission("lead:manage");
  const tenantId = actor.workspace.id;
  if (requestedWorkerId) {
    const worker = await queryPostgres<{ allowed: boolean }>(
      `select exists(select 1 from public.operations_workers where tenant_id = $1 and id = $2 and availability_status <> 'inactive') as allowed`,
      [tenantId, requestedWorkerId]
    );
    if (worker?.rows[0]?.allowed !== true) return null;
  }
  if (assignmentId) {
    const assignment = await queryPostgres<{ allowed: boolean }>(
      `select exists(select 1 from public.operations_assignments where tenant_id = $1 and id = $2 and status <> 'archived') as allowed`,
      [tenantId, assignmentId]
    );
    if (assignment?.rows[0]?.allowed !== true) return null;
  }
  return { tenantId, workerId: requestedWorkerId ?? null, employeeMode: false };
}

export async function createWorkerAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const parsed = workerSchema.safeParse({
    name: text(formData, "name"),
    roleType: text(formData, "roleType") ?? "employee",
    trade: text(formData, "trade"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    hourlyRate: text(formData, "hourlyRate"),
    payrollType: text(formData, "payrollType") ?? "hourly",
    preferredLanguage: text(formData, "preferredLanguage") ?? "en",
    sendInvite: formData.get("sendInvite") === "on"
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
  const workerResult = await queryPostgres<{ id: string; user_id: string | null }>(
    `
    insert into public.operations_workers (
      tenant_id, user_id, name, role_type, trade, phone, email, hourly_rate_cents, payroll_type,
      preferred_language, metadata_json
    )
    select $1, matched_user.id, $2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb
    from (values (1)) seed(value)
    left join lateral (
      select u.id
      from public.users u
      join public.tenant_users tu
        on tu.user_id = u.id and tu.tenant_id = $1 and tu.status = 'active'
      where $6::text is not null
        and lower(u.email) = lower($6)
        and not exists (
          select 1 from public.operations_workers existing
          where existing.tenant_id = $1 and existing.user_id = u.id
        )
      limit 1
    ) matched_user on true
    returning id, user_id
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
      parsed.data.preferredLanguage,
      JSON.stringify({ source: "operations_workforce" })
    ]
  );
  const workerId = workerResult?.rows[0]?.id;
  if (workerId && !workerResult?.rows[0]?.user_id && parsed.data.email && parsed.data.sendInvite) {
    const session = await getCurrentAppSession();
    await createEmployeeInvite({
      tenantId,
      workerId,
      workerName: parsed.data.name,
      email: parsed.data.email,
      invitedByUserId: session?.userId ?? null,
      language: parsed.data.preferredLanguage
    });
    await queryPostgres(
      `insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, risk_type, confidence_score, metadata_json
      ) values ($1, 'ferocity-workforce', 'Ferocity Workforce', $2, 'employee.invited', $3, $4,
        'info', 'watching', false, true, $5, $6, '/app/operations-workforce', 'approval', 98, $7::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing`,
      [
        tenantId,
        `employee-invite-${workerId}`,
        `${parsed.data.name} was invited`,
        `Ferocity sent a secure, employee-bound invitation to ${parsed.data.email}.`,
        "The invitation is email-bound, single-use, and expires after 14 days.",
        "No action is needed unless the employee has trouble signing in.",
        JSON.stringify({ workerId, email: parsed.data.email, language: parsed.data.preferredLanguage })
      ]
    );
  }
  revalidatePath("/app/operations-workforce");
}

export async function sendEmployeeInviteAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const parsed = z.object({ workerId: z.string().uuid() }).safeParse({ workerId: text(formData, "workerId") });
  if (!parsed.success) return;
  const workerResult = await queryPostgres<{
    id: string; name: string; email: string | null; preferred_language: "en" | "es"; user_id: string | null;
  }>(
    `select id, name, email, preferred_language, user_id
     from public.operations_workers
     where tenant_id = $1 and id = $2 and availability_status <> 'inactive' limit 1`,
    [actor.workspace.id, parsed.data.workerId]
  );
  const worker = workerResult?.rows[0];
  if (!worker?.email || worker.user_id) return;
  const session = await getCurrentAppSession();
  await createEmployeeInvite({
    tenantId: actor.workspace.id,
    workerId: worker.id,
    workerName: worker.name,
    email: worker.email,
    invitedByUserId: session?.userId ?? null,
    language: worker.preferred_language === "es" ? "es" : "en"
  });
  revalidatePath("/app/operations-workforce");
}

export async function decideEmployeeAccessRequestAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const parsed = employeeAccessDecisionSchema.safeParse({
    requestId: text(formData, "requestId"),
    decision: text(formData, "decision"),
    ownerNote: text(formData, "ownerNote")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
  const requestResult = await queryPostgres<{
    id: string; name: string; email: string; phone: string | null; preferred_language: "en" | "es";
  }>(
    `select id, name, email, phone, preferred_language
     from public.employee_access_requests
     where tenant_id = $1 and id = $2 and status = 'pending' limit 1`,
    [tenantId, parsed.data.requestId]
  );
  const accessRequest = requestResult?.rows[0];
  if (!accessRequest) return;
  const reviewerUserId = actor.userId === "admin-token" ? null : actor.userId;

  if (parsed.data.decision === "declined") {
    await queryPostgres(
      `update public.employee_access_requests
       set status = 'declined', owner_note = $3, reviewed_by_user_id = $4, reviewed_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2 and status = 'pending'`,
      [tenantId, accessRequest.id, parsed.data.ownerNote ?? null, reviewerUserId]
    );
    await sendTransactionalEmail({
      to: accessRequest.email,
      subject: "Ferocity employee access request update",
      text: accessRequest.preferred_language === "es"
        ? `Hola ${accessRequest.name},\n\nLa empresa no aprobó esta solicitud de acceso. Si cree que es un error, comuníquese directamente con su supervisor o dueño.\n\nFerocity no compartió información de la empresa con esta solicitud.`
        : `Hi ${accessRequest.name},\n\nThe company did not approve this access request. If you think this is a mistake, contact your supervisor or company owner directly.\n\nFerocity did not share any company information through this request.`,
      tenantId,
      eventKey: "employee_access_declined",
      metadata: { accessRequestId: accessRequest.id }
    });
  } else {
    const workerResult = await queryPostgres<{ id: string; user_id: string | null }>(
      `with existing as (
         select id, user_id from public.operations_workers
         where tenant_id = $1 and lower(email) = lower($2) and availability_status <> 'inactive'
         order by updated_at desc limit 1
       ), inserted as (
         insert into public.operations_workers (
           tenant_id, name, role_type, phone, email, payroll_type, preferred_language, metadata_json
         )
         select $1,$3,'employee',$4,lower($2),'hourly',$5,$6::jsonb
         where not exists (select 1 from existing)
         returning id, user_id
       )
       select id, user_id from existing union all select id, user_id from inserted limit 1`,
      [
        tenantId,
        accessRequest.email,
        accessRequest.name,
        accessRequest.phone,
        accessRequest.preferred_language,
        JSON.stringify({ source: "employee_self_service", accessRequestId: accessRequest.id })
      ]
    );
    const worker = workerResult?.rows[0];
    if (!worker) return;
    if (!worker.user_id) {
      await createEmployeeInvite({
        tenantId,
        workerId: worker.id,
        workerName: accessRequest.name,
        email: accessRequest.email,
        invitedByUserId: reviewerUserId,
        language: accessRequest.preferred_language === "es" ? "es" : "en"
      });
    }
    await queryPostgres(
      `update public.employee_access_requests
       set status = 'approved', owner_note = $3, reviewed_by_user_id = $4, reviewed_at = now(),
           metadata_json = metadata_json || $5::jsonb, updated_at = now()
       where tenant_id = $1 and id = $2 and status = 'pending'`,
      [tenantId, accessRequest.id, parsed.data.ownerNote ?? null, reviewerUserId, JSON.stringify({ workerId: worker.id, alreadyLinked: Boolean(worker.user_id) })]
    );
  }

  await queryPostgres(
    `update public.owner_command_events
     set status = 'resolved', owner_attention = false, ai_handled = true,
         ai_summary = $3, metadata_json = metadata_json || $4::jsonb, updated_at = now()
     where tenant_id = $1 and platform_key = 'ferocity-workforce'
       and external_event_id = $2`,
    [
      tenantId,
      `employee-access-request-${accessRequest.id}`,
      parsed.data.decision === "approved" ? "An authorized user approved the request and Ferocity prepared secure employee access." : "An authorized user declined the request; no access was granted.",
      JSON.stringify({ decision: parsed.data.decision, reviewedByUserId: reviewerUserId })
    ]
  );
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/notifications");
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
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target?.workerId) return;
  const tenantId = target.tenantId;
  await queryPostgres(
    `
    insert into public.operations_time_entries (
      tenant_id, worker_id, assignment_id, clock_in_location, gps_verified, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      tenantId,
      target.workerId,
      parsed.data.assignmentId ?? null,
      parsed.data.clockInLocation ?? null,
      parsed.data.gpsVerified,
      parsed.data.notes ?? null,
      JSON.stringify({
        clockMode: parsed.data.gpsVerified ? "gps_verified" : "manual",
        source: target.employeeMode ? "employee_app" : "operations_workforce"
      })
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
  const employeeMode = formData.get("employeeMode") === "1";
  const context = employeeMode ? await getEmployeeAccessContext() : null;
  if (employeeMode && !context?.workerId) return;
  const tenantId = employeeMode
    ? context!.tenantId
    : (await requirePermission("lead:manage")).workspace.id;
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
      and ($7::uuid is null or worker_id = $7)
    `,
    [
      parsed.data.timeEntryId,
      tenantId,
      parsed.data.clockOutLocation ?? null,
      Math.max(0, Math.round(numeric(parsed.data.breakMinutes))),
      parsed.data.notes ?? null,
      JSON.stringify({
        clockOutMode: "manual",
        payrollReviewRequired: true,
        source: employeeMode ? "employee_app" : "operations_workforce"
      }),
      context?.workerId ?? null
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
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target) return;
  const tenantId = target.tenantId;
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
      target.workerId,
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
        target.workerId,
        parsed.data.assignmentId ?? null,
        vendor ?? uploaded.fileName ?? "Receipt",
        receiptUrl,
        parsed.data.aiSummary ?? "Receipt submitted from employee view.",
        JSON.stringify({
          source: target.employeeMode ? "employee_app" : "operations_workforce",
          expenseId,
          uploadStatus: uploaded.uploadStatus
        })
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
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target) return;
  const tenantId = target.tenantId;
  await queryPostgres(
    `
    insert into public.operations_mileage_entries (
      tenant_id, worker_id, assignment_id, vehicle_label, start_location, end_location, miles, entry_method, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    `,
    [
      tenantId,
      target.workerId,
      parsed.data.assignmentId ?? null,
      parsed.data.vehicleLabel ?? null,
      parsed.data.startLocation ?? null,
      parsed.data.endLocation ?? null,
      numeric(parsed.data.miles),
      parsed.data.entryMethod,
      JSON.stringify({
        irsFriendly: true,
        source: target.employeeMode ? "employee_app" : "operations_workforce"
      })
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
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target) return;
  const tenantId = target.tenantId;
  const mediaEntry = formData.get("mediaFile");
  const mediaFile =
    mediaEntry &&
    typeof mediaEntry === "object" &&
    "arrayBuffer" in mediaEntry &&
    "size" in mediaEntry &&
    typeof mediaEntry.size === "number" &&
    mediaEntry.size > 0
      ? mediaEntry as File
      : null;
  const uploaded = await uploadFieldMediaFile({
    tenantId,
    assignmentId: parsed.data.assignmentId,
    file: mediaFile
  });
  if (target.employeeMode && !uploaded.storageUri) return;
  if (uploaded.uploadStatus !== "none" && uploaded.uploadStatus !== "uploaded") return;
  const fileUrl = uploaded.storageUri ?? parsed.data.fileUrl ?? null;
  const insert = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_field_media (
      tenant_id, worker_id, assignment_id, service_job_id, media_type, title, file_url, ai_summary,
      customer_visible, consent_status, metadata_json
    )
    select $1,$2,$3,a.service_job_id,$4,$5,$6,$7,$8,$9,$10::jsonb
    from public.operations_assignments a
    where a.tenant_id = $1 and a.id = $3
    union all
    select $1,$2,null,null,$4,$5,$6,$7,$8,$9,$10::jsonb
    where $3::uuid is null
    returning id
    `,
    [
      tenantId,
      target.workerId,
      parsed.data.assignmentId ?? null,
      parsed.data.mediaType,
      parsed.data.title,
      fileUrl,
      parsed.data.aiSummary ?? "AI proof summary pending.",
      parsed.data.consentStatus === "approved_for_customer" || parsed.data.consentStatus === "approved_for_marketing",
      parsed.data.consentStatus,
      JSON.stringify({
        uploadPipeline: uploaded.uploadStatus === "uploaded" ? "private_storage" : "external_link",
        aiWalkthroughLinkReady: true,
        originalFileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        uploadStatus: uploaded.uploadStatus,
        source: target.employeeMode ? "employee_app" : "operations_workforce"
      })
    ]
  );
  const fieldMediaId = insert?.rows[0]?.id;
  if (fieldMediaId && parsed.data.mediaType === "receipt") {
    const extracted = await extractReceiptFieldsWithVision({
      tenantId,
      vendor: parsed.data.title,
      text: parsed.data.aiSummary ?? parsed.data.title,
      imageUrl: uploaded.signedUrl ?? parsed.data.fileUrl ?? null,
      mimeType: uploaded.mimeType ?? (parsed.data.fileUrl ? "image/unknown" : null)
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
  revalidatePath("/employee");
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

export async function createEmployeeCashAdvanceAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const parsed = cashAdvanceSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    amount: text(formData, "amount"),
    advancedAt: text(formData, "advancedAt"),
    paymentMethod: text(formData, "paymentMethod") ?? "cash",
    purpose: text(formData, "purpose")
  });
  if (!parsed.success || cents(parsed.data.amount) <= 0) return;
  const tenantId = actor.workspace.id;
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target?.workerId || target.employeeMode) return;
  const result = await queryPostgres<{ id: string; worker_name: string; user_id: string | null }>(
    `
    with inserted as (
      insert into public.employee_cash_advances (
        tenant_id, worker_id, assignment_id, amount_cents, advanced_at, payment_method,
        purpose, created_by_user_id, metadata_json
      )
      values ($1,$2,$3,$4,coalesce($5::date,current_date),$6,$7,$8,$9::jsonb)
      returning id, worker_id
    )
    select inserted.id, worker.name as worker_name, worker.user_id
    from inserted
    join public.operations_workers worker on worker.id = inserted.worker_id and worker.tenant_id = $1
    `,
    [
      tenantId,
      target.workerId,
      parsed.data.assignmentId ?? null,
      cents(parsed.data.amount),
      parsed.data.advancedAt ?? null,
      parsed.data.paymentMethod,
      parsed.data.purpose ?? null,
      actor.userId === "admin-token" ? null : actor.userId,
      JSON.stringify({ automaticPayrollDeduction: false, employeeReviewRequired: true })
    ]
  );
  const advance = result?.rows[0];
  if (advance) {
    await queryPostgres(
      `insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, money_cents, risk_type, confidence_score, metadata_json
      ) values ($1, 'ferocity-workforce', 'Ferocity Workforce', $2, 'employee.advance.recorded', $3, $4,
        'medium', 'watching', false, true, $5, $6, '/app/operations-workforce', $7, 'financial', 98, $8::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing`,
      [
        tenantId,
        `employee-advance-${advance.id}`,
        `Money advanced to ${advance.worker_name}`,
        `${advance.worker_name} can review and acknowledge the ${parsed.data.paymentMethod.replaceAll("_", " ")} advance in the employee app.`,
        "Ferocity recorded the advance but will not deduct it from wages automatically.",
        "Review the record during payroll and resolve any employee dispute before recovery.",
        cents(parsed.data.amount),
        JSON.stringify({ advanceId: advance.id, workerId: target.workerId, recipientUserId: advance.user_id })
      ]
    );
  }
  revalidatePath("/app/operations-workforce");
  revalidatePath("/employee");
  revalidatePath("/app/notifications");
}

export async function respondToEmployeeCashAdvanceAction(formData: FormData) {
  const parsed = cashAdvanceResponseSchema.safeParse({
    advanceId: text(formData, "advanceId"),
    response: text(formData, "response"),
    note: text(formData, "note")
  });
  if (!parsed.success) return;
  const context = await getEmployeeAccessContext();
  if (!context.workerId) return;
  const result = await queryPostgres<{ id: string; amount_cents: number }>(
    `update public.employee_cash_advances
     set status = $4, employee_response_note = $5, employee_responded_at = now(), updated_at = now()
     where id = $1 and tenant_id = $2 and worker_id = $3 and status in ('recorded','acknowledged','disputed')
     returning id, amount_cents`,
    [parsed.data.advanceId, context.tenantId, context.workerId, parsed.data.response, parsed.data.note ?? null]
  );
  const advance = result?.rows[0];
  if (advance) {
    await queryPostgres(
      `insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, money_cents, risk_type, confidence_score, metadata_json
      ) values ($1, 'ferocity-workforce', 'Ferocity Workforce', $2, 'employee.advance.responded', $3, $4,
        $5, $6, $7, false, $8, $9, '/app/operations-workforce', $10, 'financial', 99, $11::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
      set title = excluded.title, summary = excluded.summary, severity = excluded.severity,
          status = excluded.status, owner_attention = excluded.owner_attention,
          recommended_action = excluded.recommended_action, metadata_json = excluded.metadata_json,
          occurred_at = now(), updated_at = now()`,
      [
        context.tenantId,
        `employee-advance-response-${advance.id}`,
        parsed.data.response === "disputed" ? "Employee disputed a money advance" : "Employee acknowledged a money advance",
        parsed.data.note || `${context.workerName ?? "The employee"} selected ${parsed.data.response}.`,
        parsed.data.response === "disputed" ? "high" : "info",
        parsed.data.response === "disputed" ? "needs_owner" : "resolved",
        parsed.data.response === "disputed",
        parsed.data.response === "disputed" ? "Ferocity stopped recovery and routed the record for owner review." : "The employee acknowledgment is recorded for payroll review.",
        parsed.data.response === "disputed" ? "Review the advance with the employee before any payroll action." : "No action is needed until payroll review.",
        advance.amount_cents,
        JSON.stringify({ advanceId: advance.id, workerId: context.workerId, response: parsed.data.response })
      ]
    );
  }
  revalidatePath("/employee");
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/notifications");
}

export async function updateEmployeeLanguageAction(formData: FormData) {
  const parsed = employeeLanguageSchema.safeParse({ language: text(formData, "language") });
  if (!parsed.success) return;
  const context = await getEmployeeAccessContext();
  if (!context.workerId) return;
  await queryPostgres(
    `update public.operations_workers set preferred_language = $3, updated_at = now()
     where tenant_id = $1 and id = $2`,
    [context.tenantId, context.workerId, parsed.data.language]
  );
  revalidatePath("/employee");
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
