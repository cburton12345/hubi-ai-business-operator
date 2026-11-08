"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres, queryPostgresRequired, withPostgresTransactionResult } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { canAccessEmployeeAssignment, getEmployeeAccessContext } from "@/lib/employee/employee-access";
import { decideEmployeeAccessRequest } from "@/lib/employee/employee-access-decision";
import { attemptEmployeeInviteDelivery, type EmployeeInviteDeliveryResult } from "@/lib/employee/employee-invite-delivery";
import { deliverEmployeeInviteWithRecovery } from "@/lib/employee/employee-invite-delivery-workflow";
import { applyCrewTimeIntent,changeTimeClockBreak,closeTimeClockEntry,correctTimeClockEntry,createTimeClockEntry } from "@/lib/employee/time-clock";
import { getTimeSupervisorScope, timeScopeAllowsWorker } from "@/lib/employee/time-supervisor";
import {
  confirmWorkerPayAllocation,
  isWorkerDebtKind,
  parseWorkerMoneyToCents,
  recordWorkerBalanceRepayment
} from "@/lib/employee/worker-balance-ledger";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { uploadFieldMediaFile } from "@/lib/operations-workforce/field-media-upload";
import { extractReceiptFieldsWithVision } from "@/lib/operations-workforce/receipt-extraction";
import { isUploadFile, uploadReceiptPhoto } from "@/lib/operations-workforce/receipt-upload";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function workerMessage(language: "en" | "es",en: string,es: string) {
  return language === "es" ? es : en;
}

function cents(value: string | undefined) {
  if (!value) return 0;
  const number = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

type TenantReferenceTable = "operations_workers" | "operations_assignments";

async function tenantOwnsReference(tenantId: string, table: TenantReferenceTable, id?: string) {
  if (!id) return true;
  const result = await queryPostgres<{ allowed: boolean }>(
    `select exists(select 1 from public.${table} where tenant_id = $1 and id = $2) as allowed`,
    [tenantId, id]
  );
  return result?.rows[0]?.allowed === true;
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
  purpose: z.string().min(2).max(600),
  entryKind: z.enum(["cash_advance","personal_purchase","gift","business_expense","reimbursement","loss_damage"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  repaymentTerms: z.string().max(1000).optional(),
  receiptUrl: z.string().url().optional(),
  moneyLocale: z.enum(["en","es"])
});

const cashAdvanceResponseSchema = z.object({
  advanceId: z.string().uuid(),
  response: z.enum(["acknowledged", "authorized", "disputed"]),
  note: z.string().max(600).optional()
}).superRefine((value, context) => {
  if (value.response === "authorized" && !value.note?.trim()) {
    context.addIssue({ code: "custom", path: ["note"], message: "Written authorization terms are required." });
  }
});

const workerBalanceReviewSchema = z.object({
  advanceId: z.string().uuid(),
  decision: z.enum(["approved","rejected","reversed"]),
  note: z.string().min(2).max(1000)
});

const workerBalanceRepaymentSchema = z.object({
  requestId: z.string().uuid(),
  advanceId: z.string().uuid(),
  amount: z.string().min(1),
  repaidAt: z.string().min(8),
  method: z.enum(["cash","check","bank_transfer","other"]),
  note: z.string().max(600).optional(),
  moneyLocale: z.enum(["en","es"])
});

const workerBalanceAllocationSchema = z.object({
  requestId: z.string().uuid(),
  advanceId: z.string().uuid(),
  amount: z.string().min(1),
  payPeriodStart: z.string().min(8),
  payPeriodEnd: z.string().min(8),
  workerAuthorizationEvidence: z.string().min(2).max(1000),
  legalPolicyReview: z.string().min(2).max(1000),
  moneyLocale: z.enum(["en","es"])
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

const assignmentTaskStatusSchema = z.object({
  assignmentId: z.string().uuid(),
  taskIndex: z.coerce.number().int().min(0).max(49),
  status: z.enum(["open", "done"])
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
  breakMinutes: z.string().regex(/^\d{1,4}$/).optional(),
  notes: z.string().max(1000).optional()
});

const breakSchema = z.object({
  timeEntryId: z.string().uuid(),
  mode: z.enum(["start","end"])
});

const bulkTimeSchema = z.object({
  workerIds: z.array(z.string().uuid()).min(1).max(50),
  intent: z.enum(["clock_in","start_break","end_break","clock_out"]),
  assignmentId: z.string().uuid().optional(),
  note: z.string().max(600).optional()
});

const timeCorrectionSchema = z.object({
  timeEntryId: z.string().uuid(),
  clockInAt: z.string().min(10),
  clockOutAt: z.string().min(10),
  breakMinutes: z.coerce.number().int().min(0).max(1440),
  clockInOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  clockOutOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  reason: z.string().min(3).max(1000)
});

export type TimeClockActionState = {
  ok: boolean;
  message: string;
};

export type BulkTimeActionState = TimeClockActionState & {
  applied: number;
  skipped: number;
  failures: string[];
};

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

function localDateTimeToIso(value: string,timezoneOffsetMinutes: number) {
  const assumedUtc = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(assumedUtc)) return null;
  return new Date(assumedUtc+timezoneOffsetMinutes*60_000).toISOString();
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
  return deliverEmployeeInviteWithRecovery(input, (token) => sendEmployeeInviteMessage(input, token));
}

async function sendEmployeeInviteMessage(input: {
  tenantId: string;
  workerId: string;
  workerName: string;
  email: string;
  invitedByUserId: string | null;
  language: "en" | "es";
}, token: string) {
  const workspaceResult = await queryPostgres<{ name: string }>(
    "select name from public.tenants where id = $1 limit 1",
    [input.tenantId]
  );
  const workspaceName = workspaceResult?.rows[0]?.name ?? "your company";

  const spanish = input.language === "es";
  return attemptEmployeeInviteDelivery(() => sendTransactionalEmail({
    to: input.email,
    subject: spanish ? `Tu acceso de empleado a ${workspaceName}` : `Your employee access to ${workspaceName}`,
    text: spanish
      ? `Hola ${input.workerName},\n\n${workspaceName} te invitó a la aplicación de empleados de Ferocity. Tu enlace es privado, funciona una sola vez y vence en 14 días.\n\nCrear tu acceso:\n${employeeInviteUrl(token)}\n\nDespués de registrarte podrás ver tu horario, registrar horas, ubicación, trabajo realizado, millas, gastos y comprobantes.`
      : `Hi ${input.workerName},\n\n${workspaceName} invited you to the Ferocity employee app. Your link is private, works once, and expires in 14 days.\n\nCreate your access:\n${employeeInviteUrl(token)}\n\nAfter signing up, you can see your schedule and record hours, location, work performed, mileage, costs, and proof.`,
    tenantId: input.tenantId,
    eventKey: "employee_invite",
    metadata: { workerId: input.workerId, language: input.language, invitedByUserId: input.invitedByUserId }
  }));
}

async function finalizeDeclineDelivery(input: {
  tenantId: string;
  externalEventId: string;
  delivered: boolean;
}) {
  const result = await queryPostgresRequired(
    `update public.owner_command_events
     set event_type=$3,title=$4,summary=$5,severity=$6,status=$7,owner_attention=$8,ai_handled=$9,
         ai_summary=$10,recommended_action=$11,
         metadata_json=metadata_json || $12::jsonb,updated_at=now()
     where tenant_id=$1 and platform_key='ferocity-workforce' and external_event_id=$2
     returning id`,
    input.delivered
      ? [
          input.tenantId,input.externalEventId,"employee.decline_notice_delivered",
          "Employee decline notice delivered",
          "Ferocity confirmed delivery of the employee access-request decision.","info","resolved",false,true,
          "The decline notice was delivered; no workspace access was granted.","No further action is required.",
          JSON.stringify({ declineDelivery: "delivered" })
        ]
      : [
          input.tenantId,input.externalEventId,"employee.decline_delivery_failed",
          "Employee decline notice was not delivered",
          "The request remains declined and no access was granted, but Ferocity could not confirm email delivery.",
          "high","needs_owner",true,false,
          "The decline remains authoritative; only its notification failed.",
          "Contact the person directly about the declined request. Do not send an employee invite.",
          JSON.stringify({ declineDelivery: "failed" })
        ],
    "employee-decline-delivery-finalization"
  );
  if (result.rowCount !== 1) throw new Error("Decline delivery recovery state was not found.");
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
    return { tenantId: context.tenantId, workerId: context.workerId, employeeMode: true, actorUserId: context.userId,preferredLanguage: context.preferredLanguage };
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
  return {
    tenantId,
    workerId: requestedWorkerId ?? null,
    employeeMode: false,
    actorUserId: actor.userId === "admin-token" ? null : actor.userId,
    preferredLanguage: "en" as const
  };
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
  }
  revalidatePath("/app/operations-workforce");
}

export async function sendEmployeeInviteAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
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
  revalidatePath("/app/notifications");
}

export async function decideEmployeeAccessRequestAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const parsed = employeeAccessDecisionSchema.safeParse({
    requestId: text(formData, "requestId"),
    decision: text(formData, "decision"),
    ownerNote: text(formData, "ownerNote")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
  const reviewerUserId = actor.userId === "admin-token" ? null : actor.userId;
  const result = await withPostgresTransactionResult((client) => decideEmployeeAccessRequest(client, {
    tenantId,
    requestId: parsed.data.requestId,
    decision: parsed.data.decision,
    ownerNote: parsed.data.ownerNote ?? null,
    reviewerUserId
  }));
  if (!result.ok) return;
  if (result.value.outcome === "not_pending") {
    revalidatePath("/app/operations-workforce");
    revalidatePath("/app/notifications");
    return;
  }

  const accessRequest = result.value.request;
  if (result.value.outcome === "declined") {
    const delivery: EmployeeInviteDeliveryResult = await attemptEmployeeInviteDelivery(() => sendTransactionalEmail({
      to: accessRequest.email,
      subject: "Ferocity employee access request update",
      text: accessRequest.preferred_language === "es"
        ? `Hola ${accessRequest.name},\n\nLa empresa no aprobó esta solicitud de acceso. Si cree que es un error, comuníquese directamente con su supervisor o dueño.\n\nFerocity no compartió información de la empresa con esta solicitud.`
        : `Hi ${accessRequest.name},\n\nThe company did not approve this access request. If you think this is a mistake, contact your supervisor or company owner directly.\n\nFerocity did not share any company information through this request.`,
      tenantId,
      eventKey: "employee_access_declined",
      metadata: { accessRequestId: accessRequest.id }
    }));
    await finalizeDeclineDelivery({
      tenantId,
      externalEventId: `employee-access-decline-delivery-${accessRequest.id}`,
      delivered: delivery.ok
    }).catch(() => undefined);
  } else if (result.value.inviteRequired) {
    await createEmployeeInvite({
      tenantId,
      workerId: result.value.workerId,
      workerName: accessRequest.name,
      email: accessRequest.email,
      invitedByUserId: reviewerUserId,
      language: accessRequest.preferred_language === "es" ? "es" : "en"
    });
  }
  revalidatePath("/app/operations-workforce");
  revalidatePath("/app/notifications");
}

export async function createAssignmentAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
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
  const tenantId = actor.workspace.id;
  if (!(await tenantOwnsReference(tenantId, "operations_workers", parsed.data.workerId))) return;
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

export async function updateAssignmentTaskStatusAction(formData: FormData) {
  const parsed = assignmentTaskStatusSchema.safeParse({
    assignmentId: text(formData, "assignmentId"),
    taskIndex: text(formData, "taskIndex"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;
  const context = await getEmployeeAccessContext();
  if (!(await canAccessEmployeeAssignment(context, parsed.data.assignmentId))) return;

  await queryPostgres(
    `with rebuilt as (
       select assignment.id,
         jsonb_agg(
           case when item.ordinality - 1 = $3 then
             (case when jsonb_typeof(item.value)='object' then item.value
               else jsonb_build_object('title',coalesce(item.value #>> '{}','Task ' || item.ordinality::text)) end) || jsonb_build_object(
               'status',$4::text,
               'completedAt',case when $4='done' then now() else null end,
               'completedByWorkerId',case when $4='done' then $5::uuid else null end
             )
           else item.value end
           order by item.ordinality
         ) as task_list_json
       from public.operations_assignments assignment,
         jsonb_array_elements(assignment.task_list_json) with ordinality as item(value,ordinality)
       where assignment.tenant_id=$1 and assignment.id=$2
         and jsonb_array_length(assignment.task_list_json) > $3
       group by assignment.id
     ), task_state as (
       select rebuilt.id,rebuilt.task_list_json,
         not exists(
           select 1 from jsonb_array_elements(rebuilt.task_list_json) task
           where coalesce(task->>'status','open') <> 'done'
         ) as all_done
       from rebuilt
     )
     update public.operations_assignments assignment set
       task_list_json=task_state.task_list_json,
       status=case
         when task_state.all_done then 'completed'
         when assignment.status in ('scheduled','completed') then 'in_progress'
         else assignment.status end,
       metadata_json=assignment.metadata_json || jsonb_build_object(
         'lastTaskUpdateAt',now(),'lastTaskUpdateByWorkerId',$5::uuid,
         'allPunchListTasksCompleted',task_state.all_done
       ),updated_at=now()
     from task_state
     where assignment.tenant_id=$1 and assignment.id=task_state.id`,
    [
      context.tenantId,
      parsed.data.assignmentId,
      parsed.data.taskIndex,
      parsed.data.status,
      context.workerId
    ]
  );
  revalidatePath("/employee");
  revalidatePath("/app/employee");
  revalidatePath("/app/operations-workforce");
}

export async function createClockInAction(formData: FormData): Promise<TimeClockActionState> {
  const parsed = clockSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    clockInLocation: text(formData, "clockInLocation"),
    notes: text(formData, "notes"),
    gpsVerified: formData.get("gpsVerified") === "on"
  });
  if (!parsed.success) return { ok: false, message: "Check the clock-in details and try again." };
  const target = await resolveWorkerActionTarget(formData, parsed.data.workerId, parsed.data.assignmentId);
  if (!target?.workerId) return { ok: false, message: "That employee or job is not available for clock-in." };
  const workerId = target.workerId;
  const result = await withPostgresTransactionResult((client) => createTimeClockEntry(client, {
    tenantId: target.tenantId,
    workerId,
    assignmentId: parsed.data.assignmentId ?? null,
    clockInLocation: parsed.data.clockInLocation ?? null,
    gpsVerified: parsed.data.gpsVerified,
    notes: parsed.data.notes ?? null,
    source: target.employeeMode ? "employee_app" : "operations_workforce",
    actorUserId: target.actorUserId,
    actorWorkerId: target.employeeMode ? target.workerId : null
  }));
  if (!result.ok) return { ok: false, message: workerMessage(target.preferredLanguage,"Clock-in was not saved. Your time is still unchanged; please try again.","No se guardó la entrada. Su tiempo no cambió; inténtelo de nuevo.") };
  revalidatePath("/app/operations-workforce");
  if (target.employeeMode) revalidatePath("/employee");
  return result.value.created
    ? { ok: true, message: workerMessage(target.preferredLanguage,"Clock-in saved.","Entrada guardada.") }
    : { ok: true, message: workerMessage(target.preferredLanguage,"You were already clocked in. No duplicate shift was created.","Ya tenía la entrada marcada. No se creó un turno duplicado.") };
}

export async function createClockInForOfficeAction(formData: FormData): Promise<void> {
  await createClockInAction(formData);
}

export async function clockOutTimeEntryAction(formData: FormData): Promise<TimeClockActionState> {
  const parsed = clockOutSchema.safeParse({
    timeEntryId: text(formData, "timeEntryId"),
    clockOutLocation: text(formData, "clockOutLocation"),
    breakMinutes: text(formData, "breakMinutes"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return { ok: false, message: "Check the clock-out details and use whole break minutes." };
  const employeeMode = formData.get("employeeMode") === "1";
  const context = employeeMode ? await getEmployeeAccessContext() : null;
  if (employeeMode && !context?.workerId) return { ok: false, message: "Your employee profile is not linked." };
  const officeActor = employeeMode ? null : await requirePermission("lead:manage");
  const tenantId = employeeMode
    ? context!.tenantId
    : officeActor!.workspace.id;
  const breakMinutes = Number(parsed.data.breakMinutes ?? "0");
  const result = await withPostgresTransactionResult((client) => closeTimeClockEntry(client, {
    tenantId,
    timeEntryId: parsed.data.timeEntryId,
    workerId: context?.workerId ?? null,
    clockOutLocation: parsed.data.clockOutLocation ?? null,
    breakMinutes,
    notes: parsed.data.notes ?? null,
    source: employeeMode ? "employee_app" : "operations_workforce",
    actorUserId: context?.userId ?? (officeActor?.userId === "admin-token" ? null : officeActor?.userId),
    actorWorkerId: context?.workerId ?? null
  }));
  const resultLanguage = context?.preferredLanguage ?? "en";
  if (!result.ok) return { ok: false, message: workerMessage(resultLanguage,"Clock-out was not saved. Your shift remains open; please try again.","No se guardó la salida. Su turno sigue abierto; inténtelo de nuevo.") };
  if (!result.value.closed) {
    const message = result.value.reason === "break_exceeds_shift"
      ? workerMessage(resultLanguage,"Break minutes cannot exceed the time since clock-in. Your shift remains open.","Los minutos de descanso no pueden exceder el tiempo desde la entrada. Su turno sigue abierto.")
      : workerMessage(resultLanguage,"This shift is no longer open for your employee profile. Refresh before trying again.","Este turno ya no está abierto para su perfil. Actualice antes de intentarlo de nuevo.");
    return { ok: false, message };
  }
  revalidatePath("/app/operations-workforce");
  if (employeeMode) revalidatePath("/employee");
  return { ok: true, message: workerMessage(resultLanguage,"Clock-out saved and sent for review.","Salida guardada y enviada para revisión.") };
}

export async function clockOutTimeEntryForOfficeAction(formData: FormData): Promise<void> {
  await clockOutTimeEntryAction(formData);
}

export async function changeEmployeeBreakAction(formData: FormData): Promise<TimeClockActionState> {
  const parsed = breakSchema.safeParse({ timeEntryId: text(formData,"timeEntryId"),mode: text(formData,"mode") });
  if (!parsed.success) return { ok: false,message: "That break action is not valid." };
  const context = await getEmployeeAccessContext();
  const language = context.preferredLanguage;
  if (!context.workerId) return { ok: false,message: workerMessage(language,"Your worker profile is not linked.","Su perfil de trabajador no está vinculado.") };
  const result = await withPostgresTransactionResult((client) => changeTimeClockBreak(client, {
    tenantId: context.tenantId,timeEntryId: parsed.data.timeEntryId,workerId: context.workerId,
    mode: parsed.data.mode,actorUserId: context.userId,actorWorkerId: context.workerId,source: "employee_app"
  }));
  if (!result.ok) return { ok: false,message: workerMessage(language,"The break was not saved. Your time remains unchanged; try again.","No se guardó el descanso. Su tiempo no cambió; inténtelo de nuevo.") };
  if (!result.value.changed) {
    const messages = {
      not_open: "This shift is no longer open. Refresh before trying again.",
      wrong_worker: "This shift belongs to another worker.",
      already_on_break: "Your break is already running.",
      not_on_break: "You are already working; no break was running."
    };
    const translated = language === "es" ? {
      not_open: "Este turno ya no está abierto. Actualice antes de intentarlo de nuevo.",
      wrong_worker: "Este turno pertenece a otro trabajador.",
      already_on_break: "Su descanso ya está en curso.",
      not_on_break: "Ya está trabajando; no había un descanso en curso."
    } : messages;
    return { ok: result.value.reason === "already_on_break" || result.value.reason === "not_on_break",message: translated[result.value.reason] };
  }
  revalidatePath("/employee");
  revalidatePath("/app/employee");
  revalidatePath("/app/operations-workforce");
  return { ok: true,message: parsed.data.mode === "start"
    ? workerMessage(language,"Break started.","Descanso iniciado.")
    : workerMessage(language,"Break ended. You are back on the clock.","Descanso terminado. Ha vuelto al tiempo de trabajo.") };
}

export async function bulkCrewTimeAction(_previous: BulkTimeActionState, formData: FormData): Promise<BulkTimeActionState> {
  const parsed = bulkTimeSchema.safeParse({
    workerIds: formData.getAll("workerIds").filter((value): value is string => typeof value === "string"),
    intent: text(formData,"intent"),assignmentId: text(formData,"assignmentId"),note: text(formData,"note")
  });
  if (!parsed.success) return { ok: false,message: "Select at least one worker and try again.",applied: 0,skipped: 0,failures: [] };
  const scope = await getTimeSupervisorScope();
  if (scope.mode === "none") return { ok: false,message: "You are not assigned to manage crew time.",applied: 0,skipped: 0,failures: [] };
  const requestedIds = [...new Set(parsed.data.workerIds)];
  if (parsed.data.assignmentId) {
    const assignment = await queryPostgresRequired<{ allowed: boolean }>(
      `select exists(
         select 1 from public.operations_assignments assignment
         where assignment.tenant_id=$1 and assignment.id=$2 and assignment.status<>'archived'
           and ($3::boolean=false
             or assignment.worker_id=any($4::uuid[])
             or exists (select 1 from public.operations_crews crew
                        where crew.tenant_id=assignment.tenant_id and crew.id=assignment.crew_id
                          and crew.crew_leader_worker_id=$5 and crew.status='active'))
       ) as allowed`,
      [scope.tenantId,parsed.data.assignmentId,scope.mode === "crew_leader",scope.allowedWorkerIds ?? [],scope.actorWorkerId]
    );
    if (assignment.rows[0]?.allowed !== true) return { ok: false,message: "That assignment is outside your workspace or crew.",applied: 0,skipped: 0,failures: [] };
  }
  const eligible = await queryPostgresRequired<{ id: string;name: string }>(
    `select id,name from public.operations_workers where tenant_id=$1 and id=any($2::uuid[]) and availability_status<>'inactive'`,
    [scope.tenantId,requestedIds]
  );
  const workers = eligible.rows.filter((worker) => timeScopeAllowsWorker(scope,worker.id));
  const failures: string[] = [];
  let applied = 0;
  let skipped = 0;
  for (const worker of workers) {
    const result = await withPostgresTransactionResult((client) => applyCrewTimeIntent(client, {
      tenantId: scope.tenantId,workerId: worker.id,intent: parsed.data.intent,
      assignmentId: parsed.data.assignmentId ?? null,note: parsed.data.note ?? null,
      actorUserId: scope.actorUserId,actorWorkerId: scope.actorWorkerId
    }));
    if (!result.ok) failures.push(worker.name);
    else if (result.value.outcome === "skipped") skipped += 1;
    else if (result.value.outcome === "failed") failures.push(worker.name);
    else applied += 1;
  }
  const unauthorizedCount = requestedIds.length-workers.length;
  if (unauthorizedCount > 0) failures.push(`${unauthorizedCount} unavailable or outside your crew`);
  revalidatePath("/app/operations-workforce");
  const ok = failures.length === 0;
  return {
    ok,message: `${applied} updated, ${skipped} already in that state${failures.length ? `, ${failures.length} failed` : ""}.`,
    applied,skipped,failures
  };
}

export async function correctCrewTimeEntryAction(formData: FormData): Promise<TimeClockActionState> {
  const parsed = timeCorrectionSchema.safeParse({
    timeEntryId: text(formData,"timeEntryId"),clockInAt: text(formData,"clockInAt"),
    clockOutAt: text(formData,"clockOutAt"),breakMinutes: text(formData,"breakMinutes") ?? "0",
    clockInOffsetMinutes: text(formData,"clockInOffsetMinutes") ?? "0",
    clockOutOffsetMinutes: text(formData,"clockOutOffsetMinutes") ?? "0",reason: text(formData,"reason")
  });
  if (!parsed.success) return { ok: false,message: "Check the corrected times, break minutes, and reason." };
  const scope = await getTimeSupervisorScope();
  if (scope.mode === "none") return { ok: false,message: "You are not assigned to correct crew time." };
  const owner = await queryPostgresRequired<{ worker_id: string }>(
    `select worker_id from public.operations_time_entries where tenant_id=$1 and id=$2 limit 1`,
    [scope.tenantId,parsed.data.timeEntryId]
  );
  const workerId = owner.rows[0]?.worker_id;
  if (!workerId || !timeScopeAllowsWorker(scope,workerId)) return { ok: false,message: "That time entry is outside your crew." };
  if (!scope.actorUserId) return { ok: false,message: "A signed-in manager identity is required for a correction." };
  const actorUserId = scope.actorUserId;
  const clockInAt = localDateTimeToIso(parsed.data.clockInAt,parsed.data.clockInOffsetMinutes);
  const clockOutAt = localDateTimeToIso(parsed.data.clockOutAt,parsed.data.clockOutOffsetMinutes);
  if (!clockInAt || !clockOutAt) return { ok: false,message: "Those local date/time values are invalid." };
  const result = await withPostgresTransactionResult((client) => correctTimeClockEntry(client, {
    tenantId: scope.tenantId,timeEntryId: parsed.data.timeEntryId,clockInAt,
    clockOutAt,breakMinutes: parsed.data.breakMinutes,reason: parsed.data.reason,
    actorUserId,actorWorkerId: scope.actorWorkerId
  }));
  if (!result.ok) return { ok: false,message: "The correction was not saved; the original time remains unchanged." };
  if (!result.value.corrected) return { ok: false,message: "That entry cannot be corrected with those values." };
  revalidatePath("/app/operations-workforce");
  return { ok: true,message: "Time correction saved for review. The original values remain in the audit history." };
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
  const actor = await requirePermission("lead:manage");
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
  const tenantId = actor.workspace.id;
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
  const actor = await requirePermission("lead:manage");
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "paused", "archived"])
  }).safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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
  const actor = await requirePermission("lead:manage");
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
  const tenantId = actor.workspace.id;
  const [workerAllowed, assignmentAllowed] = await Promise.all([
    tenantOwnsReference(tenantId, "operations_workers", parsed.data.workerId),
    tenantOwnsReference(tenantId, "operations_assignments", parsed.data.assignmentId)
  ]);
  if (!workerAllowed || !assignmentAllowed) return;
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
  const actor = await requirePermission("lead:manage");
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
  const tenantId = actor.workspace.id;
  const [workerAllowed, assignmentAllowed] = await Promise.all([
    tenantOwnsReference(tenantId, "operations_workers", parsed.data.workerId),
    tenantOwnsReference(tenantId, "operations_assignments", parsed.data.assignmentId)
  ]);
  if (!workerAllowed || !assignmentAllowed) return;
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
  const actor = await requirePermission("tenant:manage");
  const parsed = payrollExportSchema.safeParse({
    provider: text(formData, "provider") ?? "csv",
    periodStart: text(formData, "periodStart"),
    periodEnd: text(formData, "periodEnd"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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

export async function createEmployeeCashAdvanceAction(formData: FormData): Promise<TimeClockActionState> {
  const parsed = cashAdvanceSchema.safeParse({
    workerId: text(formData, "workerId"),
    assignmentId: text(formData, "assignmentId"),
    amount: text(formData, "amount"),
    advancedAt: text(formData, "advancedAt"),
    paymentMethod: text(formData, "paymentMethod") ?? "cash",
    purpose: text(formData, "purpose"),
    entryKind: text(formData, "entryKind") ?? "cash_advance",
    currency: text(formData, "currency") ?? "USD",
    repaymentTerms: text(formData, "repaymentTerms"),
    receiptUrl: text(formData, "receiptUrl"),
    moneyLocale: text(formData, "moneyLocale") ?? "en"
  });
  const amountCents = parsed.success ? parseWorkerMoneyToCents(parsed.data.amount, parsed.data.moneyLocale) : null;
  if (!parsed.success || amountCents === null) return { ok: false,message: "Check the amount, category, currency, and reason." };
  const employeeSubmission = formData.get("employeeMode") === "1";
  const target = employeeSubmission
    ? await resolveWorkerActionTarget(formData,parsed.data.workerId,parsed.data.assignmentId)
    : await (async () => {
        const scope = await getTimeSupervisorScope();
        if (scope.mode === "none" || !timeScopeAllowsWorker(scope,parsed.data.workerId)) return null;
        if (!(await tenantOwnsReference(scope.tenantId,"operations_workers",parsed.data.workerId))) return null;
        if (parsed.data.assignmentId) {
          const assignment = await queryPostgresRequired<{ allowed: boolean }>(
            `select exists (
               select 1 from public.operations_assignments assignment
               where assignment.tenant_id=$1 and assignment.id=$2 and assignment.status<>'archived'
                 and ($3::boolean=false
                   or assignment.worker_id=$4
                   or assignment.worker_id=any($5::uuid[])
                   or exists (
                     select 1 from public.operations_crews crew
                     where crew.tenant_id=assignment.tenant_id and crew.id=assignment.crew_id
                       and crew.crew_leader_worker_id=$6 and crew.status='active'
                   ))
             ) as allowed`,
            [scope.tenantId,parsed.data.assignmentId,scope.mode === "crew_leader",parsed.data.workerId,scope.allowedWorkerIds ?? [],scope.actorWorkerId]
          );
          if (assignment.rows[0]?.allowed !== true) return null;
        }
        return { tenantId: scope.tenantId,workerId: parsed.data.workerId,employeeMode: false,
          actorUserId: scope.actorUserId,preferredLanguage: "en" as const };
      })();
  if (!target?.workerId) return { ok: false,message: "That worker or assignment is not available to you." };
  const tenantId = target.tenantId;
  const receiptPhoto = isUploadFile(formData.get("receiptPhoto")) ? formData.get("receiptPhoto") as File : null;
  const uploaded = await uploadReceiptPhoto(tenantId, receiptPhoto);
  const receiptUrl = uploaded.storageUri ?? parsed.data.receiptUrl ?? null;
  const workerDebt = isWorkerDebtKind(parsed.data.entryKind);
  const transaction = await withPostgresTransactionResult(async (client) => {
    const result = await client.query<{ id: string; worker_name: string; user_id: string | null }>(
      `with inserted as (
         insert into public.employee_cash_advances (
           tenant_id,worker_id,assignment_id,amount_cents,advanced_at,payment_method,purpose,
           entry_kind,currency,is_worker_debt,approval_status,worker_authorization_status,
           repayment_terms,receipt_url,created_by_user_id,metadata_json
         ) values ($1,$2,$3,$4,coalesce($5::date,current_date),$6,$7,$8,$9,$10,'pending','pending',$11,$12,$13,$14::jsonb)
         returning id,worker_id
       )
       select inserted.id,worker.name as worker_name,worker.user_id
       from inserted join public.operations_workers worker on worker.id=inserted.worker_id and worker.tenant_id=$1`,
      [
        tenantId,target.workerId,parsed.data.assignmentId ?? null,amountCents,
        parsed.data.advancedAt ?? null,parsed.data.paymentMethod,parsed.data.purpose,
        parsed.data.entryKind,parsed.data.currency,workerDebt,parsed.data.repaymentTerms ?? null,receiptUrl,
        target.actorUserId,
        JSON.stringify({ source: target.employeeMode ? "employee_app" : "operations_workforce", automaticPayrollDeduction: false })
      ]
    );
    const advance = result.rows[0];
    if (!advance) throw new Error("Worker balance entry was not saved.");
    const audit = await client.query(
      `insert into public.employee_advance_events
         (tenant_id,advance_id,worker_id,event_type,actor_user_id,actor_worker_id,note,new_state_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        tenantId,advance.id,target.workerId,target.employeeMode ? "submitted" : "created",
        target.actorUserId,target.employeeMode ? target.workerId : null,parsed.data.purpose,
        JSON.stringify({ entryKind: parsed.data.entryKind, amountCents, currency: parsed.data.currency, isWorkerDebt: workerDebt, approvalStatus: "pending" })
      ]
    );
    if (audit.rowCount !== 1) throw new Error("Worker balance audit evidence was not saved.");
    return advance;
  });
  const advance = transaction.ok ? transaction.value : null;
  if (!advance) return { ok: false,message: "The balance entry was not saved. No worker balance changed; try again." };
  if (advance && receiptUrl) {
    await queryPostgres(
      `insert into public.operations_field_media
         (tenant_id,assignment_id,worker_id,media_type,title,file_url,ai_summary,customer_visible,consent_status,status,metadata_json)
       values ($1,$2,$3,'receipt',$4,$5,$6,false,'internal_only','needs_review',$7::jsonb)`,
      [tenantId,parsed.data.assignmentId ?? null,target.workerId,uploaded.fileName ?? "Worker balance receipt",receiptUrl,parsed.data.purpose,JSON.stringify({ advanceId: advance.id, entryKind: parsed.data.entryKind })]
    );
  }
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
        `Worker balance entry for ${advance.worker_name}`,
        `${advance.worker_name} can review the ${parsed.data.entryKind.replaceAll("_", " ")} entry in the worker app.`,
        workerDebt ? "The proposed debt is pending manager review and separate worker authorization." : "This entry is classified as non-debt and will not reduce worker pay.",
        "Review classification and evidence. Any payroll allocation requires a separate confirmed action.",
        amountCents,
        JSON.stringify({ advanceId: advance.id, workerId: target.workerId, recipientUserId: advance.user_id, entryKind: parsed.data.entryKind, isWorkerDebt: workerDebt })
      ]
    );
  }
  revalidatePath("/app/operations-workforce");
  revalidatePath("/employee");
  revalidatePath("/app/notifications");
  return { ok: true,message: target.employeeMode
    ? workerMessage(target.preferredLanguage,"Submitted for manager review. No payroll deduction was made.","Enviado para revisión del gerente. No se hizo ningún descuento de nómina.")
    : "Balance fact recorded for review. No payroll deduction was made." };
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
  const transaction = await withPostgresTransactionResult(async (client) => {
    const locked = await client.query<{ id: string; amount_cents: number; is_worker_debt: boolean; status: string; approval_status: string; worker_authorization_status: string }>(
      `select id,amount_cents,is_worker_debt,status,approval_status,worker_authorization_status
       from public.employee_cash_advances where id=$1 and tenant_id=$2 and worker_id=$3 for update`,
      [parsed.data.advanceId,context.tenantId,context.workerId]
    );
    const current = locked.rows[0];
    if (!current || current.status === "void") return null;
    if (parsed.data.response === "authorized" && (!current.is_worker_debt || current.approval_status === "rejected")) return null;
    const nextStatus = parsed.data.response === "disputed" ? "disputed" : "acknowledged";
    const authorizationStatus = parsed.data.response === "authorized" ? "authorized" : parsed.data.response === "disputed" ? "disputed" : current.worker_authorization_status;
    const updated = await client.query<{ id: string; amount_cents: number }>(
      `update public.employee_cash_advances
       set status=$4,worker_authorization_status=$5,employee_response_note=$6,employee_responded_at=now(),updated_at=now()
       where id=$1 and tenant_id=$2 and worker_id=$3 returning id,amount_cents`,
      [parsed.data.advanceId,context.tenantId,context.workerId,nextStatus,authorizationStatus,parsed.data.note ?? null]
    );
    const audit = await client.query(
      `insert into public.employee_advance_events
         (tenant_id,advance_id,worker_id,event_type,actor_user_id,actor_worker_id,note,previous_state_json,new_state_json)
       values ($1,$2,$3,$4,$5,$3,$6,$7::jsonb,$8::jsonb)`,
      [
        context.tenantId,current.id,context.workerId,
        parsed.data.response === "disputed" ? "worker_disputed" : parsed.data.response === "authorized" ? "worker_authorized" : "corrected",
        context.userId,parsed.data.note ?? null,
        JSON.stringify({ status: current.status, workerAuthorizationStatus: current.worker_authorization_status }),
        JSON.stringify({ status: nextStatus, workerAuthorizationStatus: authorizationStatus })
      ]
    );
    if (audit.rowCount !== 1) throw new Error("Worker response audit evidence was not saved.");
    return updated.rows[0] ?? null;
  });
  const advance = transaction.ok ? transaction.value : null;
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

export async function reviewWorkerBalanceEntryAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return;
  const parsed = workerBalanceReviewSchema.safeParse({
    advanceId: text(formData, "advanceId"),
    decision: text(formData, "decision"),
    note: text(formData, "note")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
  const actorUserId = actor.userId === "admin-token" ? null : actor.userId;
  const result = await withPostgresTransactionResult(async (client) => {
    const locked = await client.query<{ id: string; worker_id: string; approval_status: string; status: string }>(
      `select id,worker_id,approval_status,status from public.employee_cash_advances
       where tenant_id=$1 and id=$2 for update`,
      [tenantId,parsed.data.advanceId]
    );
    const entry = locked.rows[0];
    if (!entry || entry.status === "void") return false;
    const update = parsed.data.decision === "reversed"
      ? await client.query(
          `update public.employee_cash_advances
           set status='void',reversed_by_user_id=$3,reversed_at=now(),reversal_reason=$4,updated_at=now()
           where tenant_id=$1 and id=$2`,
          [tenantId,entry.id,actorUserId,parsed.data.note]
        )
      : await client.query(
          `update public.employee_cash_advances
           set approval_status=$3,
               approved_by_user_id=case when $3='approved' then $4 else approved_by_user_id end,
               approved_at=case when $3='approved' then now() else approved_at end,
               rejected_by_user_id=case when $3='rejected' then $4 else rejected_by_user_id end,
               rejected_at=case when $3='rejected' then now() else rejected_at end,
               updated_at=now()
           where tenant_id=$1 and id=$2 and approval_status='pending'`,
          [tenantId,entry.id,parsed.data.decision,actorUserId]
        );
    if (update.rowCount !== 1) return false;
    if (parsed.data.decision === "reversed") {
      await client.query(
        `update public.employee_advance_repayments
         set status='reversed',reversed_by_user_id=$3,reversed_at=now(),reversal_reason=$4
         where tenant_id=$1 and advance_id=$2 and status='recorded'`,
        [tenantId,entry.id,actorUserId,parsed.data.note]
      );
      await client.query(
        `update public.employee_advance_pay_allocations
         set status='reversed',reversed_by_user_id=$3,reversed_at=now(),reversal_reason=$4
         where tenant_id=$1 and advance_id=$2 and status in ('proposed','confirmed')`,
        [tenantId,entry.id,actorUserId,parsed.data.note]
      );
    }
    const audit = await client.query(
      `insert into public.employee_advance_events
         (tenant_id,advance_id,worker_id,event_type,actor_user_id,note,previous_state_json,new_state_json)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
      [
        tenantId,entry.id,entry.worker_id,parsed.data.decision === "reversed" ? "reversed" : parsed.data.decision,
        actorUserId,parsed.data.note,
        JSON.stringify({ approvalStatus: entry.approval_status, status: entry.status }),
        JSON.stringify(parsed.data.decision === "reversed" ? { status: "void" } : { approvalStatus: parsed.data.decision })
      ]
    );
    if (audit.rowCount !== 1) throw new Error("Worker balance review evidence was not saved.");
    return true;
  });
  if (!result.ok || !result.value) return;
  revalidatePath("/app/operations-workforce");
  revalidatePath("/employee");
}

export async function recordWorkerBalanceRepaymentAction(formData: FormData): Promise<TimeClockActionState> {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return { ok: false,message: "A named authorized user is required for repayment evidence." };
  const parsed = workerBalanceRepaymentSchema.safeParse({
    requestId: text(formData,"requestId"),advanceId: text(formData, "advanceId"), amount: text(formData, "amount"),
    repaidAt: text(formData, "repaidAt"), method: text(formData, "method"), note: text(formData, "note"),
    moneyLocale: text(formData, "moneyLocale") ?? "en"
  });
  const amountCents = parsed.success ? parseWorkerMoneyToCents(parsed.data.amount, parsed.data.moneyLocale) : null;
  if (!parsed.success || amountCents === null) return { ok: false,message: "Check the repayment amount, date, method, and request." };
  const transaction = await withPostgresTransactionResult((client) => recordWorkerBalanceRepayment(client, {
    tenantId: actor.workspace.id,advanceId: parsed.data.advanceId,amountCents,
    repaidAt: parsed.data.repaidAt,method: parsed.data.method,note: parsed.data.note ?? null,
    idempotencyKey: parsed.data.requestId,actorUserId: actor.userId
  }));
  if (!transaction.ok) return { ok: false,message: "The repayment was not saved. Check the ledger before retrying." };
  const outcome = transaction.value.outcome;
  if (outcome === "idempotency_conflict") return { ok: false,message: "That request ID was already used for different repayment details. Refresh and submit again." };
  if (outcome === "not_found" || outcome === "not_recoverable") return { ok: false,message: "That advance is no longer available for repayment." };
  if (outcome === "exceeds_outstanding") return { ok: false,message: "The amount exceeds the current outstanding balance." };
  revalidatePath("/app/operations-workforce");
  revalidatePath("/employee");
  return { ok: true,message: outcome === "already_recorded" ? "This repayment was already recorded." : "Repayment recorded with audit evidence." };
}

export async function confirmWorkerPayAllocationAction(formData: FormData): Promise<TimeClockActionState> {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return { ok: false,message: "A named authorized user is required for a pay allocation decision." };
  const parsed = workerBalanceAllocationSchema.safeParse({
    requestId: text(formData,"requestId"),advanceId: text(formData, "advanceId"), amount: text(formData, "amount"),
    payPeriodStart: text(formData, "payPeriodStart"), payPeriodEnd: text(formData, "payPeriodEnd"),
    workerAuthorizationEvidence: text(formData, "workerAuthorizationEvidence"),
    legalPolicyReview: text(formData, "legalPolicyReview"),
    moneyLocale: text(formData, "moneyLocale") ?? "en"
  });
  const amountCents = parsed.success ? parseWorkerMoneyToCents(parsed.data.amount, parsed.data.moneyLocale) : null;
  if (!parsed.success || amountCents === null) return { ok: false,message: "Check the allocation amount, pay period, and evidence." };
  const transaction = await withPostgresTransactionResult((client) => confirmWorkerPayAllocation(client, {
    tenantId: actor.workspace.id,advanceId: parsed.data.advanceId,amountCents,
    payPeriodStart: parsed.data.payPeriodStart,payPeriodEnd: parsed.data.payPeriodEnd,
    workerAuthorizationEvidence: parsed.data.workerAuthorizationEvidence,
    legalPolicyReview: parsed.data.legalPolicyReview,idempotencyKey: parsed.data.requestId,actorUserId: actor.userId
  }));
  if (!transaction.ok) return { ok: false,message: "The allocation was not saved. Check the ledger before retrying." };
  const outcome = transaction.value.outcome;
  if (outcome === "idempotency_conflict") return { ok: false,message: "That request ID was already used for different allocation details. Refresh and submit again." };
  if (outcome === "not_found" || outcome === "not_authorized") return { ok: false,message: "That advance is not authorized for allocation." };
  if (outcome === "currency_not_supported") return { ok: false,message: "Pay allocation previews currently support USD balances only." };
  if (outcome === "missing_evidence") return { ok: false,message: "Worker authorization and legal-policy review evidence are both required." };
  if (outcome === "exceeds_outstanding") return { ok: false,message: "The amount exceeds the current outstanding balance." };
  revalidatePath("/app/operations-workforce");
  revalidatePath("/employee");
  return { ok: true,message: outcome === "already_confirmed" ? "This allocation was already confirmed." : "Allocation preview confirmed with audit evidence." };
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
  const actor = await requirePermission("lead:manage");
  const parsed = customerUpdateSchema.safeParse({
    assignmentId: text(formData, "assignmentId"),
    channel: text(formData, "channel") ?? "sms",
    recipientContact: text(formData, "recipientContact"),
    subject: text(formData, "subject"),
    body: text(formData, "body")
  });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
  if (!(await tenantOwnsReference(tenantId, "operations_assignments", parsed.data.assignmentId))) return;
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
  const actor = await requirePermission("approval:review_low");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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
  const actor = await requirePermission("approval:review_medium");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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
  const actor = await requirePermission("tenant:manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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
  const actor = await requirePermission("tenant:manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const tenantId = actor.workspace.id;
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
