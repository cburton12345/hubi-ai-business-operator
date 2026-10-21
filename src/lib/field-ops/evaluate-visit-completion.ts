import type pg from "pg";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";

export type CompletionBlocker = {
  type: "required_form" | "rejected_form" | "required_signature" | "required_photo" | "open_time_entry" | "unreviewed_material";
  title: string;
  detail: string;
  targetId?: string;
};

type CompletionQuery = <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<pg.QueryResult<T> | null>;

async function evaluateVisitCompletionWithQuery(query: CompletionQuery, params: {
  tenantId: string;
  visitId: string;
  persist?: boolean;
}) {
  const formResult = await query<{
    id: string;
    name: string;
    status: string;
    required_for_completion: boolean;
  }>(
    `
    select a.id, t.name, a.status, a.required_for_completion
    from public.field_form_assignments a
    join public.field_form_templates t
      on t.id = a.template_id and t.tenant_id = a.tenant_id
    where a.tenant_id = $1 and a.visit_id = $2
      and a.required_for_completion
      and a.status not in ('approved','waived')
    order by a.assigned_at
    `,
    [params.tenantId, params.visitId]
  );

  const blockers: CompletionBlocker[] = (formResult?.rows ?? []).map((row) => ({
    type: row.status === "rejected" ? "rejected_form" : "required_form",
    title: row.status === "rejected" ? `${row.name} was rejected` : `${row.name} is incomplete`,
    detail:
      row.status === "rejected"
        ? "Correct and resubmit this field form before completing the visit."
        : "Submit the required field form before completing the visit.",
    targetId: row.id
  }));

  const requirementsResult = await query<{ completion_requirements_json: unknown }>(
    `
    select wo.completion_requirements_json
    from public.service_visits v
    join public.service_work_orders wo
      on wo.id = v.work_order_id and wo.tenant_id = v.tenant_id
    where v.tenant_id = $1 and v.id = $2
    limit 1
    `,
    [params.tenantId, params.visitId]
  );
  const requirements = requirementsResult?.rows[0]?.completion_requirements_json;
  const requiresCustomerSignature =
    Array.isArray(requirements) &&
    requirements.some(
      (item) =>
        (typeof item === "string" && item === "customer_signature") ||
        (item && typeof item === "object" && (item as Record<string, unknown>).type === "customer_signature")
    );

  const requiresPhoto =
    Array.isArray(requirements) &&
    requirements.some(
      (item) =>
        (typeof item === "string" && ["photo", "completion_photo", "before_after_photos"].includes(item)) ||
        (item && typeof item === "object" && ["photo", "completion_photo", "before_after_photos"].includes(String((item as Record<string, unknown>).type ?? "")))
    );

  if (requiresCustomerSignature) {
    const signatureResult = await query<{ count: string }>(
      `
      select count(*)::text
      from public.service_visit_signatures
      where tenant_id = $1 and visit_id = $2
        and signature_type in ('customer_authorization','work_completion')
      `,
      [params.tenantId, params.visitId]
    );
    if (Number(signatureResult?.rows[0]?.count ?? 0) === 0) {
      blockers.push({
        type: "required_signature",
        title: "Customer signature is required",
        detail: "Capture the required authorization or completion signature before completing the visit."
      });
    }
  }

  if (requiresPhoto) {
    const photoResult = await query<{ count: string }>(
      `select count(*)::text
       from public.field_form_attachments attachment
       join public.field_form_submissions submission
         on submission.tenant_id=attachment.tenant_id and submission.id=attachment.submission_id
       where attachment.tenant_id=$1 and submission.visit_id=$2
         and attachment.attachment_type='photo'
         and submission.status in ('submitted','needs_review','approved')`,
      [params.tenantId, params.visitId]
    );
    if (Number(photoResult?.rows[0]?.count ?? 0) === 0) {
      blockers.push({ type: "required_photo", title: "Completion photo is required", detail: "Attach the required field photo before completing this visit." });
    }
  }

  const openTimeResult = await query<{ count: string }>(
    `select count(*)::text
     from public.operations_time_entries entry
     join public.service_visit_assignments assignment
       on assignment.tenant_id=entry.tenant_id and assignment.operations_assignment_id=entry.assignment_id
     where assignment.tenant_id=$1 and assignment.visit_id=$2 and entry.status='open'`,
    [params.tenantId, params.visitId]
  );
  if (Number(openTimeResult?.rows[0]?.count ?? 0) > 0) {
    blockers.push({ type: "open_time_entry", title: "A worker is still clocked in", detail: "Close or correct every open time entry before completing this visit." });
  }

  const materialResult = await query<{ count: string }>(
    `select count(*)::text
     from public.operations_material_logs log
     join public.service_visit_assignments assignment
       on assignment.tenant_id=log.tenant_id and assignment.operations_assignment_id=log.assignment_id
     where assignment.tenant_id=$1 and assignment.visit_id=$2 and log.status='needs_review'`,
    [params.tenantId, params.visitId]
  );
  if (Number(materialResult?.rows[0]?.count ?? 0) > 0) {
    blockers.push({ type: "unreviewed_material", title: "Material usage needs review", detail: "Approve or reject the visit's material records before completing the work." });
  }

  const status = blockers.length === 0 ? "ready" : "blocked";
  if (params.persist !== false) {
    await query(
      `
      update public.service_visits
      set completion_readiness_status = $3,
          completion_readiness_json = $4::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        params.tenantId,
        params.visitId,
        status,
        JSON.stringify({ checkedAt: new Date().toISOString(), blockers })
      ]
    );
  }

  return { ready: blockers.length === 0, status, blockers };
}

export async function evaluateVisitCompletion(params: {
  tenantId: string;
  visitId: string;
  persist?: boolean;
}) {
  return evaluateVisitCompletionWithQuery(queryPostgres, params);
}

export async function completeVisitAtomically(params: { tenantId: string; visitId: string }) {
  const transaction = await withPostgresTransactionResult(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`visit-completion:${params.tenantId}:${params.visitId}`]);
    const visitResult = await client.query<{
      id: string;
      status: string;
      service_job_id: string | null;
      work_order_id: string;
    }>(
      `select id,status,service_job_id,work_order_id
       from public.service_visits
       where tenant_id=$1 and id=$2
       limit 1 for update`,
      [params.tenantId, params.visitId]
    );
    const visit = visitResult.rows[0];
    if (!visit) return { status: "not_found" as const, serviceJobId: null, blockers: [] as CompletionBlocker[] };
    if (visit.status === "completed") {
      return { status: "already_completed" as const, serviceJobId: visit.service_job_id, blockers: [] as CompletionBlocker[] };
    }
    if (["canceled", "no_show"].includes(visit.status)) {
      return { status: "invalid_status" as const, serviceJobId: visit.service_job_id, blockers: [] as CompletionBlocker[] };
    }

    const completion = await evaluateVisitCompletionWithQuery(
      <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) => client.query<T>(text, values),
      { ...params, persist: true }
    );
    if (!completion.ready) {
      return { status: "blocked" as const, serviceJobId: visit.service_job_id, blockers: completion.blockers };
    }

    const updated = await client.query(
      `update public.service_visits
       set status='completed',actual_completed_at=coalesce(actual_completed_at,now()),updated_at=now()
       where tenant_id=$1 and id=$2 and status not in ('completed','canceled','no_show')`,
      [params.tenantId, params.visitId]
    );
    if (updated.rowCount !== 1) throw new Error("The visit changed while completion was being recorded.");

    if (visit.service_job_id) {
      await client.query(
        `update public.service_jobs set status='completed',updated_at=now()
         where tenant_id=$1 and id=$2 and status not in ('canceled','lost')`,
        [params.tenantId, visit.service_job_id]
      );
    }
    await client.query(
      `update public.service_work_orders
       set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
       where tenant_id=$1 and id=$2 and status <> 'canceled'`,
      [params.tenantId, visit.work_order_id]
    );
    await client.query(
      `insert into public.service_operating_events (
         tenant_id,brand_id,customer_id,location_id,work_order_id,visit_id,
         event_type,source_type,source_id,title,detail,previous_state_json,next_state_json,metadata_json
       )
       select v.tenant_id,v.brand_id,v.customer_id,v.location_id,v.work_order_id,v.id,
              'visit_status_changed','user',v.id::text,'Visit marked completed',
              'Completion requirements were rechecked and the visit, work order, and job were completed atomically.',
              jsonb_build_object('status',$3::text),'{"status":"completed"}'::jsonb,
              '{"completionGate":"passed","atomic":true}'::jsonb
       from public.service_visits v where v.tenant_id=$1 and v.id=$2`,
      [params.tenantId, params.visitId, visit.status]
    );
    return { status: "completed" as const, serviceJobId: visit.service_job_id, blockers: [] as CompletionBlocker[] };
  });
  if (!transaction.ok) throw new Error("Ferocity could not complete the visit safely.", { cause: transaction.error });
  return transaction.value;
}
