import { queryPostgres } from "@/lib/db/postgres";

export type CompletionBlocker = {
  type: "required_form" | "rejected_form" | "required_signature";
  title: string;
  detail: string;
  targetId?: string;
};

export async function evaluateVisitCompletion(params: {
  tenantId: string;
  visitId: string;
  persist?: boolean;
}) {
  const formResult = await queryPostgres<{
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

  const requirementsResult = await queryPostgres<{ completion_requirements_json: unknown }>(
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

  if (requiresCustomerSignature) {
    const signatureResult = await queryPostgres<{ count: string }>(
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

  const status = blockers.length === 0 ? "ready" : "blocked";
  if (params.persist !== false) {
    await queryPostgres(
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
