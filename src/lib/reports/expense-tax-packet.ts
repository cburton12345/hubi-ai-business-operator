import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";

export type ExpenseTaxPacketRow = {
  id: string;
  expense_date: string;
  vendor: string | null;
  category: string;
  amount_cents: number;
  tax_cents: number;
  metadata_json: Record<string, unknown>;
  merchant_city: string | null;
  merchant_state: string | null;
  document_id: string | null;
  source_kind: "expense" | "statement_transaction";
  review_status: string;
  source_description: string | null;
  assign_to: string;
  job_title: string | null;
  worker_name: string | null;
  reimbursement_status: string;
  receipt_url: string | null;
};

/**
 * Returns one row per expense candidate. Reviewed statement debits already posted
 * to operations_expenses are represented only by the canonical expense row;
 * unposted statement debits remain visible as unresolved evidence instead of
 * disappearing from the tax packet.
 */
export async function listExpenseTaxPacketRows(tenantId: string, year: number, scope?: {
  projectId?: string | null;
  batchId?: string | null;
}) {
  const result = await queryPostgres<ExpenseTaxPacketRow>(`
    with scope_documents as (
      select distinct bi.document_id
      from public.document_intelligence_import_batch_items bi
      join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
      where bi.tenant_id=$1 and bi.document_id is not null
        and ($3::uuid is null or b.project_id=$3::uuid)
        and ($4::uuid is null or b.id=$4::uuid)
    ), canonical_expenses as (
      select
        'expense:' || e.id::text as id,
        coalesce(e.expense_date, e.created_at::date)::text as expense_date,
        e.vendor,
        coalesce(nullif(e.category, ''), 'Uncategorized') as category,
        e.amount_cents,
        e.tax_cents,
        e.metadata_json,
        nullif(d.normalized_json->>'merchantCity', '') as merchant_city,
        nullif(d.normalized_json->>'merchantState', '') as merchant_state,
        d.id::text as document_id,
        'expense'::text as source_kind,
        e.status as review_status,
        e.ai_summary as source_description,
        e.assign_to,
        j.title as job_title,
        w.name as worker_name,
        e.reimbursement_status,
        e.receipt_url
      from public.operations_expenses e
      left join public.service_jobs j on j.id = e.service_job_id and j.tenant_id = e.tenant_id
      left join public.operations_workers w on w.id = e.worker_id and w.tenant_id = e.tenant_id
      left join public.document_intelligence_documents d
        on d.tenant_id = e.tenant_id
       and d.id = nullif(e.metadata_json->>'documentIntelligenceId', '')::uuid
      where e.tenant_id = $1
        and e.status <> 'rejected'
        and coalesce(e.expense_date, e.created_at::date) >= make_date($2::int, 1, 1)
        and coalesce(e.expense_date, e.created_at::date) < make_date(($2::int + 1), 1, 1)
        and (($3::uuid is null and $4::uuid is null) or d.id in (select document_id from scope_documents))
    ), unposted_statement_debits as (
      select
        'statement:' || t.id::text as id,
        coalesce(t.transaction_date, t.created_at::date)::text as expense_date,
        coalesce(t.merchant_name, t.description) as vendor,
        coalesce(nullif(t.suggested_category, ''), 'Uncategorized') as category,
        t.amount_cents,
        0 as tax_cents,
        t.metadata_json || jsonb_build_object(
          'documentIntelligenceId', t.document_id,
          'statementTransactionId', t.id,
          'allocations', case
            when t.allocation_target_type is null then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object(
              'targetType', t.allocation_target_type,
              'targetRef', t.allocation_target_ref,
              'targetLabel', t.allocation_target_label,
              'metadata', t.metadata_json
            ))
          end
        ) as metadata_json,
        nullif(coalesce(t.metadata_json->>'merchantCity', d.normalized_json->>'merchantCity'), '') as merchant_city,
        nullif(coalesce(t.metadata_json->>'merchantState', d.normalized_json->>'merchantState'), '') as merchant_state,
        t.document_id::text as document_id,
        'statement_transaction'::text as source_kind,
        t.status as review_status,
        t.description as source_description,
        coalesce(t.allocation_target_type, 'unassigned') as assign_to,
        null::text as job_title,
        null::text as worker_name,
        'not_applicable'::text as reimbursement_status,
        ('supabase://' || d.original_bucket || '/' || d.original_storage_path)::text as receipt_url
      from public.document_intelligence_transactions t
      join public.document_intelligence_documents d
        on d.tenant_id = t.tenant_id and d.id = t.document_id
      where t.tenant_id = $1
        and t.direction = 'debit'
        and t.is_transfer = false
        and t.posted_expense_ref is null
        and t.status in ('needs_review', 'approved')
        and coalesce(t.transaction_date, t.created_at::date) >= make_date($2::int, 1, 1)
        and coalesce(t.transaction_date, t.created_at::date) < make_date(($2::int + 1), 1, 1)
        and (($3::uuid is null and $4::uuid is null) or t.document_id in (select document_id from scope_documents))
    )
    select * from canonical_expenses
    union all
    select * from unposted_statement_debits
    order by expense_date, vendor, id
  `, [tenantId, year, scope?.projectId ?? null, scope?.batchId ?? null]);

  return result?.rows ?? [];
}
