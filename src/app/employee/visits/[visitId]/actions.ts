"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { requireEmployeeVisitAccess } from "@/lib/employee/employee-access";
import { evaluateVisitCompletion } from "@/lib/field-ops/evaluate-visit-completion";
import { evaluateVisitSchedule } from "@/lib/scheduling/evaluate-visit";

const formSubmissionSchema = z.object({
  assignmentId: z.string().uuid(),
  visitId: z.string().uuid()
});

const signatureSchema = z.object({
  visitId: z.string().uuid(),
  signatureType: z.enum(["customer_authorization", "scope_change", "work_completion", "worker_attestation", "other"]),
  signerName: z.string().trim().min(1).max(180),
  signerRole: z.string().trim().max(120).optional(),
  statementText: z.string().trim().min(10).max(2400),
  signatureDataUrl: z.string().max(1_500_000).optional()
});

const noteSchema = z.object({
  visitId: z.string().uuid(),
  note: z.string().trim().min(1).max(4000)
});

const statusSchema = z.object({
  visitId: z.string().uuid(),
  status: z.enum(["dispatched", "en_route", "arrived", "in_progress", "paused", "completed", "no_show", "canceled"])
});

function legacyJobStatus(status: z.infer<typeof statusSchema>["status"]) {
  if (["dispatched", "en_route"].includes(status)) return "scheduled";
  if (["arrived", "in_progress", "paused"].includes(status)) return "in_progress";
  if (status === "completed") return "completed";
  return "canceled";
}

function fieldValue(formData: FormData, key: string, type: string) {
  const raw = formData.get(`field:${key}`);
  if (type === "checkbox") return raw === "on" || raw === "true";
  if (raw instanceof File) return raw.size > 0 ? { name: raw.name, size: raw.size, type: raw.type } : null;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (type === "number") return value ? Number(value) : null;
  return value || null;
}

export async function submitFieldFormAction(formData: FormData) {
  const parsed = formSubmissionSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    visitId: formData.get("visitId")
  });
  if (!parsed.success) return;

  const access = await requireEmployeeVisitAccess(parsed.data.visitId);
  const tenantId = access.tenantId;
  const templateResult = await queryPostgres<{
    template_id: string;
    version: number;
    schema_json: { fields?: Array<Record<string, unknown>> };
    completion_policy: string;
  }>(
    `
    select t.id as template_id, t.version, t.schema_json, t.completion_policy
    from public.field_form_assignments a
    join public.field_form_templates t
      on t.id = a.template_id and t.tenant_id = a.tenant_id
    where a.tenant_id = $1 and a.id = $2 and a.visit_id = $3
      and a.status <> 'waived'
    limit 1
    `,
    [tenantId, parsed.data.assignmentId, parsed.data.visitId]
  );
  const template = templateResult?.rows[0];
  if (!template) return;

  const fields = Array.isArray(template.schema_json?.fields) ? template.schema_json.fields : [];
  const responses: Record<string, unknown> = {};
  const validationErrors: Array<{ fieldKey: string; message: string }> = [];

  for (const field of fields) {
    const key = typeof field.key === "string" ? field.key : "";
    if (!key) continue;
    const type = typeof field.type === "string" ? field.type : "text";
    const value = fieldValue(formData, key, type);
    responses[key] = value;
    const required = field.required === true;
    if (required && (value === null || value === "" || value === false)) {
      validationErrors.push({ fieldKey: key, message: `${String(field.label || key)} is required.` });
    }
    if (type === "number" && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
      validationErrors.push({ fieldKey: key, message: `${String(field.label || key)} must be a number.` });
    }
    if (type === "url" && typeof value === "string") {
      try {
        new URL(value);
      } catch {
        validationErrors.push({ fieldKey: key, message: `${String(field.label || key)} must be a valid link.` });
      }
    }
  }

  const submissionStatus =
    validationErrors.length > 0
      ? "draft"
      : template.completion_policy === "approval_required"
        ? "needs_review"
        : "approved";

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.field_form_submissions (
      tenant_id, assignment_id, template_id, visit_id, worker_id, status,
      template_version, response_json, validation_errors_json,
      submitted_at, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,
      case when $6 <> 'draft' then now() else null end,
      '{"source":"employee_field_app"}'::jsonb
    )
    returning id
    `,
    [
      tenantId,
      parsed.data.assignmentId,
      template.template_id,
      parsed.data.visitId,
      access.workerId,
      submissionStatus,
      template.version,
      JSON.stringify(responses),
      JSON.stringify(validationErrors)
    ]
  );
  const submissionId = result?.rows[0]?.id;
  if (!submissionId) return;

  await queryPostgres(
    `
    update public.field_form_submissions
    set status = 'superseded', updated_at = now()
    where tenant_id = $1 and assignment_id = $2 and id <> $3
      and status in ('draft','submitted','needs_review','approved','rejected')
    `,
    [tenantId, parsed.data.assignmentId, submissionId]
  );
  await queryPostgres(
    `
    update public.field_form_assignments
    set status = $4,
        completed_at = case when $4 in ('submitted','approved') then now() else null end,
        updated_at = now()
    where tenant_id = $1 and id = $2 and visit_id = $3
    `,
    [
      tenantId,
      parsed.data.assignmentId,
      parsed.data.visitId,
      submissionStatus === "approved" ? "approved" : submissionStatus === "needs_review" ? "submitted" : "in_progress"
    ]
  );

  await queryPostgres(
    `
    insert into public.service_operating_events (
      tenant_id, customer_id, location_id, work_order_id, visit_id,
      event_type, source_type, source_id, title, detail, next_state_json, metadata_json
    )
    select v.tenant_id, v.customer_id, v.location_id, v.work_order_id, v.id,
           'field_form_submitted', 'worker', $3, 'Field form saved',
           case when $4 = 'draft' then 'The form has validation issues and remains in progress.'
                when $4 = 'needs_review' then 'The form was submitted for office review.'
                else 'The required field form passed validation.' end,
           $5::jsonb, $6::jsonb
    from public.service_visits v
    where v.tenant_id = $1 and v.id = $2
    `,
    [
      tenantId,
      parsed.data.visitId,
      submissionId,
      submissionStatus,
      JSON.stringify({ submissionStatus, validationErrors }),
      JSON.stringify({ assignmentId: parsed.data.assignmentId, templateId: template.template_id })
    ]
  );
  await evaluateVisitCompletion({ tenantId, visitId: parsed.data.visitId });
  revalidatePath(`/employee/visits/${parsed.data.visitId}`);
  revalidatePath("/employee");
  revalidatePath("/app/schedule");
}

export async function saveVisitSignatureAction(formData: FormData) {
  const parsed = signatureSchema.safeParse({
    visitId: formData.get("visitId"),
    signatureType: formData.get("signatureType"),
    signerName: formData.get("signerName"),
    signerRole: formData.get("signerRole"),
    statementText: formData.get("statementText"),
    signatureDataUrl: formData.get("signatureDataUrl")
  });
  if (!parsed.success) return;

  const access = await requireEmployeeVisitAccess(parsed.data.visitId);
  const tenantId = access.tenantId;
  const requestHeaders = await headers();
  await queryPostgres(
    `
    insert into public.service_visit_signatures (
      tenant_id, visit_id, signature_type, signer_name, signer_role,
      signature_data_url, statement_text, ip_address, user_agent, metadata_json
    )
    select $1,$2,$3,$4,$5,$6,$7,$8::inet,$9,'{"source":"employee_field_app"}'::jsonb
    where exists (
      select 1 from public.service_visits where tenant_id = $1 and id = $2
    )
    `,
    [
      tenantId,
      parsed.data.visitId,
      parsed.data.signatureType,
      parsed.data.signerName,
      parsed.data.signerRole || null,
      parsed.data.signatureDataUrl || null,
      parsed.data.statementText,
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      requestHeaders.get("user-agent")
    ]
  );
  await evaluateVisitCompletion({ tenantId, visitId: parsed.data.visitId });
  revalidatePath(`/employee/visits/${parsed.data.visitId}`);
  revalidatePath("/app/schedule");
}

export async function saveVisitFieldNoteAction(formData: FormData) {
  const parsed = noteSchema.safeParse({
    visitId: formData.get("visitId"),
    note: formData.get("note")
  });
  if (!parsed.success) return;

  const access = await requireEmployeeVisitAccess(parsed.data.visitId);
  const tenantId = access.tenantId;
  await queryPostgres(
    `
    insert into public.service_operating_events (
      tenant_id, customer_id, location_id, work_order_id, visit_id,
      event_type, source_type, source_id, title, detail, metadata_json
    )
    select v.tenant_id, v.customer_id, v.location_id, v.work_order_id, v.id,
           'field_note', 'worker', v.id::text, 'Field note', $3,
           '{"source":"employee_field_app"}'::jsonb
    from public.service_visits v
    where v.tenant_id = $1 and v.id = $2
    `,
    [tenantId, parsed.data.visitId, parsed.data.note]
  );
  await queryPostgres(
    `
    update public.service_visits
    set completion_summary = case
          when completion_summary is null or completion_summary = '' then $3
          else completion_summary || E'\n\n' || $3
        end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.visitId, parsed.data.note]
  );
  revalidatePath(`/employee/visits/${parsed.data.visitId}`);
  revalidatePath("/app/schedule");
}

export async function updateEmployeeVisitStatusAction(formData: FormData) {
  const parsed = statusSchema.safeParse({
    visitId: formData.get("visitId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const access = await requireEmployeeVisitAccess(parsed.data.visitId);
  const tenantId = access.tenantId;
  const conflicts = await evaluateVisitSchedule({ tenantId, visitId: parsed.data.visitId });
  const dispatching = ["dispatched", "en_route", "arrived", "in_progress"].includes(parsed.data.status);
  if (dispatching && conflicts.some((conflict) => conflict.severity === "blocking")) return;
  if (parsed.data.status === "completed") {
    const completion = await evaluateVisitCompletion({ tenantId, visitId: parsed.data.visitId });
    if (!completion.ready) return;
  }

  const result = await queryPostgres<{
    previous_status: string;
    service_job_id: string | null;
    work_order_id: string;
  }>(
    `
    with previous as (
      select id, status, service_job_id, work_order_id
      from public.service_visits
      where tenant_id = $1 and id = $2
    ),
    updated as (
      update public.service_visits v
      set status = $3,
          dispatched_at = case when $3 = 'dispatched' then coalesce(v.dispatched_at, now()) else v.dispatched_at end,
          actual_departed_at = case when $3 = 'en_route' then coalesce(v.actual_departed_at, now()) else v.actual_departed_at end,
          actual_arrived_at = case when $3 = 'arrived' then coalesce(v.actual_arrived_at, now()) else v.actual_arrived_at end,
          actual_started_at = case when $3 = 'in_progress' then coalesce(v.actual_started_at, now()) else v.actual_started_at end,
          actual_completed_at = case when $3 = 'completed' then coalesce(v.actual_completed_at, now()) else v.actual_completed_at end,
          updated_at = now()
      from previous p
      where v.tenant_id = $1 and v.id = p.id
      returning p.status as previous_status, v.service_job_id, v.work_order_id
    )
    select * from updated
    `,
    [tenantId, parsed.data.visitId, parsed.data.status]
  );
  const row = result?.rows[0];
  if (!row) return;

  if (row.service_job_id) {
    await queryPostgres(
      `update public.service_jobs set status = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [tenantId, row.service_job_id, legacyJobStatus(parsed.data.status)]
    );
  }
  await queryPostgres(
    `
    update public.service_work_orders
    set status = $3,
        completed_at = case when $3 = 'completed' then coalesce(completed_at, now()) else completed_at end,
        canceled_at = case when $3 = 'canceled' then coalesce(canceled_at, now()) else canceled_at end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      row.work_order_id,
      parsed.data.status === "completed"
        ? "completed"
        : parsed.data.status === "canceled" || parsed.data.status === "no_show"
          ? "canceled"
          : ["arrived", "in_progress", "paused"].includes(parsed.data.status)
            ? "in_progress"
            : "scheduled"
    ]
  );
  await queryPostgres(
    `
    insert into public.service_operating_events (
      tenant_id, brand_id, customer_id, location_id, work_order_id, visit_id,
      event_type, source_type, source_id, title, detail,
      previous_state_json, next_state_json, metadata_json
    )
    select v.tenant_id, v.brand_id, v.customer_id, v.location_id,
           v.work_order_id, v.id, 'visit_status_changed', 'worker', $3,
           $4, 'Field status changed in the employee app.',
           $5::jsonb, $6::jsonb, $7::jsonb
    from public.service_visits v
    where v.tenant_id = $1 and v.id = $2
    `,
    [
      tenantId,
      parsed.data.visitId,
      access.workerId,
      `Visit marked ${parsed.data.status.replaceAll("_", " ")}`,
      JSON.stringify({ status: row.previous_status }),
      JSON.stringify({ status: parsed.data.status }),
      JSON.stringify({ source: "employee_field_app", workerId: access.workerId })
    ]
  );

  revalidatePath(`/employee/visits/${parsed.data.visitId}`);
  revalidatePath("/employee");
  revalidatePath("/app/schedule");
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/service");
  if (row.service_job_id) revalidatePath(`/app/service/jobs/${row.service_job_id}`);
}
