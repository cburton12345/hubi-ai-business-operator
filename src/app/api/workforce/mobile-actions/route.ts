import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getEmployeeAccessContext } from "@/lib/employee/employee-access";
import { getTimeSupervisorScope,timeScopeAllowsWorker } from "@/lib/employee/time-supervisor";
import { changeTimeClockBreak,closeTimeClockEntry,createTimeClockEntry } from "@/lib/employee/time-clock";
import { queryPostgres,withPostgresTransactionResult } from "@/lib/db/postgres";
import { uploadReceiptPhoto } from "@/lib/operations-workforce/receipt-upload";

export const runtime = "nodejs";

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100_000).optional(),
  label: z.string().trim().max(220).optional()
}).optional();

const receiptSchema = z.object({
  name: z.string().min(1).max(180),
  type: z.string().max(120),
  size: z.number().int().positive().max(4_000_000),
  base64: z.string().max(5_400_000)
}).optional();

const actionSchema = z.object({
  clientMutationId: z.string().uuid(),
  actionType: z.enum(["clock_in","start_break","end_break","clock_out","expense","worker_payment"]),
  capturedAt: z.string().datetime({ offset: true }),
  workerId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  location: locationSchema,
  note: z.string().trim().max(1000).optional(),
  expense: z.object({
    vendor: z.string().trim().max(160).optional(),
    amountCents: z.number().int().min(0).max(100_000_000),
    category: z.string().trim().min(1).max(120),
    reimbursable: z.boolean(),
    receipt: receiptSchema
  }).optional(),
  payment: z.object({
    amountCents: z.number().int().positive().max(100_000_000),
    method: z.enum(["cash","check","ach","card","payroll_provider","other"]),
    paymentType: z.enum(["payroll","subcontractor","bonus","reimbursement","draw","other"])
  }).optional()
}).superRefine((value,context) => {
  if (value.actionType === "expense" && !value.expense) context.addIssue({ code: "custom",path: ["expense"],message: "Expense details are required." });
  if (value.actionType === "worker_payment" && !value.payment) context.addIssue({ code: "custom",path: ["payment"],message: "Payment details are required." });
});

const batchSchema = z.object({ actions: z.array(actionSchema).min(1).max(50) });

function safeCapturedAt(value: string) {
  const timestamp = new Date(value).getTime();
  const now = Date.now();
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000 || timestamp < now - 31 * 24 * 60 * 60_000) return null;
  return new Date(timestamp).toISOString();
}

function locationLabel(action: z.infer<typeof actionSchema>) {
  if (!action.location) return null;
  return action.location.label?.trim() || `${action.location.latitude.toFixed(5)}, ${action.location.longitude.toFixed(5)}`;
}

async function receiptFile(receipt: z.infer<typeof receiptSchema>) {
  if (!receipt) return null;
  const bytes = Buffer.from(receipt.base64,"base64");
  if (bytes.byteLength !== receipt.size || bytes.byteLength > 4_000_000) throw new Error("receipt_invalid");
  return new File([bytes],receipt.name,{ type: receipt.type || "application/octet-stream" });
}

export async function POST(request: Request) {
  const session = await getCurrentAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" },{ status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 6_000_000) return NextResponse.json({ error: "Action payload is too large." },{ status: 413 });
  const body = await request.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid workforce action batch." },{ status: 400 });

  const [employee,supervisor] = await Promise.all([getEmployeeAccessContext(),getTimeSupervisorScope()]);
  const results: Array<{ clientMutationId: string;status: "applied" | "rejected" | "failed";message: string }> = [];

  for (const action of parsed.data.actions) {
    const capturedAt = safeCapturedAt(action.capturedAt);
    if (!capturedAt) {
      results.push({ clientMutationId: action.clientMutationId,status: "rejected",message: "The saved action time is outside the allowed range." });
      continue;
    }
    const ownWorker = employee.workerId === action.workerId;
    const canSupervise = supervisor.mode !== "none" && timeScopeAllowsWorker(supervisor,action.workerId);
    if (!ownWorker && !canSupervise) {
      results.push({ clientMutationId: action.clientMutationId,status: "rejected",message: "That worker is outside your crew or workspace." });
      continue;
    }
    if (action.actionType === "worker_payment" && supervisor.mode === "none") {
      results.push({ clientMutationId: action.clientMutationId,status: "rejected",message: "Only an authorized owner or manager can record a payment." });
      continue;
    }

    try {
      if (action.actionType === "expense" || action.actionType === "worker_payment") {
        const replay = await queryPostgres<{ applied: boolean }>(
          action.actionType === "expense"
            ? `select exists(select 1 from public.operations_expenses where tenant_id=$1 and client_mutation_id=$2) as applied`
            : `select exists(select 1 from public.operations_worker_payments where tenant_id=$1 and client_mutation_id=$2) as applied`,
          [employee.tenantId,action.clientMutationId]
        );
        if (replay?.rows[0]?.applied) {
          results.push({ clientMutationId: action.clientMutationId,status: "applied",message: "Already saved." });
          continue;
        }
      }
      let uploadedReceipt: Awaited<ReturnType<typeof uploadReceiptPhoto>> | null = null;
      if (action.actionType === "expense" && action.expense?.receipt) {
        uploadedReceipt = await uploadReceiptPhoto(employee.tenantId,await receiptFile(action.expense.receipt));
        if (uploadedReceipt.uploadStatus !== "uploaded") throw new Error(`receipt_${uploadedReceipt.uploadStatus}`);
      }

      const transaction = await withPostgresTransactionResult(async (client) => {
        const worker = await client.query<{ name: string }>(
          `select name from public.operations_workers where tenant_id=$1 and id=$2 and availability_status<>'inactive' limit 1`,
          [employee.tenantId,action.workerId]
        );
        if (!worker.rows[0]) throw new Error("worker_unavailable");
        if (action.assignmentId) {
          const assignment = await client.query<{ allowed: boolean }>(
            `select exists(select 1 from public.operations_assignments where tenant_id=$1 and id=$2 and status<>'archived') as allowed`,
            [employee.tenantId,action.assignmentId]
          );
          if (assignment.rows[0]?.allowed !== true) throw new Error("assignment_unavailable");
        }

        const source = ownWorker ? "employee_app" as const : "operations_workforce" as const;
        const actorUserId = employee.userId;
        const actorWorkerId = employee.workerId;
        const place = locationLabel(action);

        if (action.actionType === "clock_in") {
          await createTimeClockEntry(client,{
            tenantId: employee.tenantId,workerId: action.workerId,assignmentId: action.assignmentId ?? null,
            clockInLocation: place,gpsVerified: Boolean(action.location),notes: action.note ?? null,source,
            actorUserId,actorWorkerId,occurredAt: capturedAt,idempotencyKey: action.clientMutationId
          });
        } else if (["start_break","end_break","clock_out"].includes(action.actionType)) {
          const open = await client.query<{ id: string }>(
            `select id from public.operations_time_entries where tenant_id=$1 and worker_id=$2 and status='open' order by clock_in_at desc limit 1 for update`,
            [employee.tenantId,action.workerId]
          );
          const timeEntryId = open.rows[0]?.id;
          if (!timeEntryId) {
            const replay = await client.query<{ applied: boolean }>(
              `select exists(select 1 from public.operations_time_entry_events where tenant_id=$1 and idempotency_key=$2) as applied`,
              [employee.tenantId,action.clientMutationId]
            );
            if (replay.rows[0]?.applied) return;
            throw new Error("no_open_shift");
          }
          if (action.actionType === "clock_out") {
            const closed = await closeTimeClockEntry(client,{
              tenantId: employee.tenantId,timeEntryId,workerId: action.workerId,clockOutLocation: place,
              breakMinutes: 0,notes: action.note ?? null,source,actorUserId,actorWorkerId,
              occurredAt: capturedAt,idempotencyKey: action.clientMutationId
            });
            if (!closed.closed) throw new Error(closed.reason);
          } else {
            const changed = await changeTimeClockBreak(client,{
              tenantId: employee.tenantId,timeEntryId,workerId: action.workerId,
              mode: action.actionType === "start_break" ? "start" : "end",source,actorUserId,actorWorkerId,
              occurredAt: capturedAt,idempotencyKey: action.clientMutationId
            });
            if (!changed.changed && !["already_on_break","not_on_break"].includes(changed.reason)) throw new Error(changed.reason);
          }
        } else if (action.actionType === "expense" && action.expense) {
          await client.query(
            `insert into public.operations_expenses
               (tenant_id,worker_id,assignment_id,vendor,expense_date,amount_cents,category,assign_to,receipt_url,
                reimbursement_status,ai_summary,client_mutation_id,metadata_json)
             values ($1,$2,$3,$4,$5::timestamptz::date,$6,$7,'job',$8,$9,$10,$11,$12::jsonb)
             on conflict (tenant_id,client_mutation_id) where client_mutation_id is not null do nothing`,
            [employee.tenantId,action.workerId,action.assignmentId ?? null,action.expense.vendor ?? null,capturedAt,
              action.expense.amountCents,action.expense.category,uploadedReceipt?.storageUri ?? null,
              action.expense.reimbursable ? "submitted" : "not_reimbursable",action.note ?? null,action.clientMutationId,
              JSON.stringify({ source,location: action.location ?? null,locationLabel: place,receiptUploadStatus: uploadedReceipt?.uploadStatus ?? "none",reviewRequired: true })]
          );
        } else if (action.actionType === "worker_payment" && action.payment) {
          await client.query(
            `insert into public.operations_worker_payments
               (tenant_id,worker_id,assignment_id,payee_name,payment_type,amount_cents,payment_date,method,status,notes,client_mutation_id,metadata_json)
             values ($1,$2,$3,$4,$5,$6,$7::timestamptz::date,$8,'recorded',$9,$10,$11::jsonb)
             on conflict (tenant_id,client_mutation_id) where client_mutation_id is not null do nothing`,
            [employee.tenantId,action.workerId,action.assignmentId ?? null,worker.rows[0].name,action.payment.paymentType,
              action.payment.amountCents,capturedAt,action.payment.method,action.note ?? null,action.clientMutationId,
              JSON.stringify({ source: "workforce_quick_action",actorUserId,location: action.location ?? null,locationLabel: place })]
          );
        }

        if (action.location) {
          await client.query(
            `insert into public.operations_location_pings
               (tenant_id,worker_id,assignment_id,latitude,longitude,accuracy_meters,location_label,ping_source,alert_status,client_mutation_id,metadata_json)
             values ($1,$2,$3,$4,$5,$6,$7,'gps','normal',$8,$9::jsonb)
             on conflict (tenant_id,client_mutation_id) where client_mutation_id is not null do nothing`,
            [employee.tenantId,action.workerId,action.assignmentId ?? null,action.location.latitude,action.location.longitude,
              action.location.accuracyMeters ?? null,place,action.clientMutationId,JSON.stringify({ sourceAction: action.actionType,clientMutationId: action.clientMutationId,capturedAt,explicitActionOnly: true })]
          );
        }
      });
      if (!transaction.ok) throw transaction.error;
      results.push({ clientMutationId: action.clientMutationId,status: "applied",message: "Saved." });
    } catch (error) {
      const code = error instanceof Error ? error.message : "save_failed";
      const retryable = !["worker_unavailable","assignment_unavailable","no_open_shift","wrong_worker","break_exceeds_shift"].includes(code);
      results.push({ clientMutationId: action.clientMutationId,status: retryable ? "failed" : "rejected",message: retryable ? "Could not save yet; it remains queued on this device." : "The action conflicts with the current time record and needs review." });
    }
  }

  return NextResponse.json({ results },{ headers: { "cache-control": "no-store" } });
}
