import { queryPostgres } from "@/lib/db/postgres";

export type JobMarginInputs = {
  invoicedCents: number;
  collectedCents: number;
  refundedCents: number;
  writtenOffCents: number;
  laborCents: number;
  materialCents: number;
  directExpenseCents: number;
  approvedOverheadCents: number;
};

export type JobMargin = JobMarginInputs & {
  netCollectedCents: number;
  directCostCents: number;
  totalCostCents: number;
  invoiceMarginCents: number;
  cashMarginCents: number;
  invoiceMarginPercent: number | null;
  cashMarginPercent: number | null;
  complete: boolean;
  missingEvidence: string[];
};

function cents(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;
}

export function calculateJobMargin(input: JobMarginInputs, evidence: {
  hasInvoice: boolean;
  hasLaborEvidence: boolean;
  hasMaterialEvidence: boolean;
  hasExpenseEvidence: boolean;
  overheadPolicyApplied: boolean;
}): JobMargin {
  const normalized: JobMarginInputs = {
    invoicedCents: cents(input.invoicedCents),
    collectedCents: cents(input.collectedCents),
    refundedCents: cents(input.refundedCents),
    writtenOffCents: cents(input.writtenOffCents),
    laborCents: cents(input.laborCents),
    materialCents: cents(input.materialCents),
    directExpenseCents: cents(input.directExpenseCents),
    approvedOverheadCents: cents(input.approvedOverheadCents)
  };
  const netCollectedCents = Math.max(normalized.collectedCents - normalized.refundedCents, 0);
  const directCostCents = normalized.laborCents + normalized.materialCents + normalized.directExpenseCents;
  const totalCostCents = directCostCents + normalized.approvedOverheadCents;
  const missingEvidence = [
    !evidence.hasInvoice ? "invoice" : null,
    !evidence.hasLaborEvidence ? "labor" : null,
    !evidence.hasMaterialEvidence ? "materials" : null,
    !evidence.hasExpenseEvidence ? "direct expenses" : null,
    !evidence.overheadPolicyApplied ? "overhead policy" : null
  ].filter((value): value is string => Boolean(value));

  return {
    ...normalized,
    netCollectedCents,
    directCostCents,
    totalCostCents,
    invoiceMarginCents: normalized.invoicedCents - normalized.writtenOffCents - totalCostCents,
    cashMarginCents: netCollectedCents - totalCostCents,
    invoiceMarginPercent: percent(normalized.invoicedCents - normalized.writtenOffCents - totalCostCents, normalized.invoicedCents),
    cashMarginPercent: percent(netCollectedCents - totalCostCents, netCollectedCents),
    complete: missingEvidence.length === 0,
    missingEvidence
  };
}

type JobMarginRow = {
  invoiced_cents: string;
  collected_cents: string;
  refunded_cents: string;
  written_off_cents: string;
  labor_cents: string;
  material_cents: string;
  direct_expense_cents: string;
  approved_overhead_cents: string;
  invoice_count: string;
  labor_evidence_count: string;
  material_evidence_count: string;
  expense_evidence_count: string;
  overhead_policy_count: string;
};

export async function getJobMargin(tenantId: string, jobId: string): Promise<JobMargin> {
  const result = await queryPostgres<JobMarginRow>(
    `
    select
      coalesce((select sum(i.total_cents) from public.service_invoices i
        where i.tenant_id=$1 and i.job_id=$2 and i.status<>'void'),0)::text invoiced_cents,
      coalesce((select sum(p.amount_cents) from public.service_invoice_payments p
        join public.service_invoices i on i.tenant_id=p.tenant_id and i.id=p.invoice_id
        where p.tenant_id=$1 and i.job_id=$2 and p.status='succeeded'),0)::text collected_cents,
      coalesce((select sum(coalesce(p.refunded_amount_cents,0)) from public.service_invoice_payments p
        join public.service_invoices i on i.tenant_id=p.tenant_id and i.id=p.invoice_id
        where p.tenant_id=$1 and i.job_id=$2 and p.status='succeeded'),0)::text refunded_cents,
      coalesce((select sum(i.write_off_cents) from public.service_invoices i
        where i.tenant_id=$1 and i.job_id=$2 and i.status<>'void'),0)::text written_off_cents,
      coalesce((select sum(w.amount_cents) from public.operations_worker_payments w
        where w.tenant_id=$1 and w.service_job_id=$2 and w.status in ('recorded','reviewed')),0)::text labor_cents,
      coalesce((select sum(case when m.actual_cost_cents>0 then m.actual_cost_cents else m.estimated_cost_cents end)
        from public.job_material_list_items m
        where m.tenant_id=$1 and m.service_job_id=$2 and m.status<>'cancelled'),0)::text material_cents,
      coalesce((select sum(e.amount_cents+e.tax_cents) from public.operations_expenses e
        where e.tenant_id=$1 and e.service_job_id=$2 and e.status in ('approved','exported') and e.assign_to='job'),0)::text direct_expense_cents,
      coalesce((select sum(e.amount_cents+e.tax_cents) from public.operations_expenses e
        where e.tenant_id=$1 and e.service_job_id=$2 and e.status in ('approved','exported') and e.assign_to='overhead'
          and coalesce((e.metadata_json->>'approvedForJobMargin')::boolean,false)),0)::text approved_overhead_cents,
      (select count(*) from public.service_invoices i where i.tenant_id=$1 and i.job_id=$2 and i.status<>'void')::text invoice_count,
      (select count(*) from public.operations_worker_payments w where w.tenant_id=$1 and w.service_job_id=$2 and w.status in ('recorded','reviewed'))::text labor_evidence_count,
      (select count(*) from public.job_material_list_items m where m.tenant_id=$1 and m.service_job_id=$2 and m.status<>'cancelled')::text material_evidence_count,
      (select count(*) from public.operations_expenses e where e.tenant_id=$1 and e.service_job_id=$2 and e.status in ('approved','exported') and e.assign_to='job')::text expense_evidence_count,
      (select count(*) from public.operations_expenses e where e.tenant_id=$1 and e.service_job_id=$2 and e.assign_to='overhead'
        and coalesce((e.metadata_json->>'approvedForJobMargin')::boolean,false))::text overhead_policy_count
    `,
    [tenantId, jobId]
  );
  const row = result?.rows[0];
  return calculateJobMargin({
    invoicedCents: cents(row?.invoiced_cents),
    collectedCents: cents(row?.collected_cents),
    refundedCents: cents(row?.refunded_cents),
    writtenOffCents: cents(row?.written_off_cents),
    laborCents: cents(row?.labor_cents),
    materialCents: cents(row?.material_cents),
    directExpenseCents: cents(row?.direct_expense_cents),
    approvedOverheadCents: cents(row?.approved_overhead_cents)
  }, {
    hasInvoice: Number(row?.invoice_count ?? 0) > 0,
    hasLaborEvidence: Number(row?.labor_evidence_count ?? 0) > 0,
    hasMaterialEvidence: Number(row?.material_evidence_count ?? 0) > 0,
    hasExpenseEvidence: Number(row?.expense_evidence_count ?? 0) > 0,
    overheadPolicyApplied: Number(row?.overhead_policy_count ?? 0) > 0
  });
}
