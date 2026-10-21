import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { listFerocityAllocationTargets } from "./ferocity-adapter";

export async function getExpenseIntelligenceDashboard(workspaceId: string, options?: {
  search?: string;
  projectId?: string | null;
  batchId?: string | null;
  documentId?: string | null;
}) {
  const term = options?.search?.trim() ?? "";
  const projectId = options?.projectId ?? null;
  const batchId = options?.batchId ?? null;
  const documentId = options?.documentId ?? null;
  const [counts, documents, settings, allocationTargets, projects, batches] = await Promise.all([
    queryPostgres<{ total: string; needs_review: string; duplicates: string; approved: string }>(`
      select count(*)::text as total,
        count(*) filter (where status = 'needs_review')::text as needs_review,
        count(*) filter (where status = 'duplicate')::text as duplicates,
        count(*) filter (where status in ('approved','auto_approved'))::text as approved
      from public.document_intelligence_documents d
      where d.tenant_id = $1 and d.source_product = 'ferocity'
        and ($2::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and b.project_id=$2::uuid
        ))
        and ($3::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and bi.batch_id=$3::uuid
        ))`, [workspaceId, projectId, batchId]),
    queryPostgres<{
      id: string; status: string; document_type: string; original_file_name: string; source_channel: string;
      vendor_name: string | null; document_number: string | null; document_date: string | null;
      subtotal_cents: number | null; tax_cents: number | null; total_cents: number | null;
      payment_method: string | null; suggested_category: string | null; overall_confidence: string;
      review_reasons_json: string[]; duplicate_of_document_id: string | null; duplicate_confidence: string | null;
      ferocity_expense_id: string | null; created_at: string; allocations: unknown; line_items: unknown; statement_transactions: unknown; independent_review: unknown;
    }>(`
      select d.id, d.status, d.document_type, d.original_file_name, d.source_channel,
        d.vendor_name, d.document_number, d.document_date::text, d.subtotal_cents, d.tax_cents,
        d.total_cents, d.payment_method, d.suggested_category, d.overall_confidence::text,
        d.review_reasons_json, d.duplicate_of_document_id, d.duplicate_confidence::text,
        d.ferocity_expense_id, d.created_at,
        (select jsonb_build_object(
          'status', r.status, 'riskTier', r.risk_tier, 'humanReviewRequired', r.human_review_required,
          'deterministicIssues', r.deterministic_checks_json, 'disagreements', r.disagreements_json
        ) from public.ai_independent_reviews r
          where r.tenant_id = d.tenant_id and r.subject_type = 'expense_document' and r.subject_id = d.id
          order by r.created_at desc limit 1) as independent_review,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id, 'targetType', a.target_type, 'targetRef', a.target_ref, 'targetLabel', a.target_label,
          'confidence', a.confidence, 'rationale', a.rationale, 'status', a.status
        ) order by a.confidence desc) from public.document_intelligence_allocations a where a.document_id = d.id), '[]'::jsonb) as allocations,
        coalesce((select jsonb_agg(jsonb_build_object(
          'description', i.description, 'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents,
          'totalCents', i.total_cents, 'category', i.suggested_category, 'confidence', i.confidence
        ) order by i.position) from public.document_intelligence_line_items i where i.document_id = d.id), '[]'::jsonb) as line_items,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', t.id, 'transactionDate', t.transaction_date, 'postedDate', t.posted_date,
          'description', t.description, 'merchantName', t.merchant_name, 'amountCents', t.amount_cents,
          'direction', t.direction, 'category', t.suggested_category, 'isTransfer', t.is_transfer,
          'transferReason', t.transfer_reason, 'confidence', t.confidence, 'status', t.status,
          'providerStatus', t.metadata_json->>'providerStatus',
          'allocationTargetType', t.allocation_target_type, 'allocationTargetRef', t.allocation_target_ref,
          'allocationTargetLabel', t.allocation_target_label, 'allocationConfidence', t.allocation_confidence,
          'allocationRationale', t.allocation_rationale,
          'counterpartyName', t.metadata_json->>'counterpartyName', 'counterpartyHandle', t.metadata_json->>'counterpartyHandle',
          'note', t.metadata_json->>'note', 'transactionType', t.metadata_json->>'transactionType',
          'duplicateConfidence', t.duplicate_confidence, 'postedExpenseRef', t.posted_expense_ref
        ) order by t.position) from public.document_intelligence_transactions t where t.document_id = d.id), '[]'::jsonb) as statement_transactions
      from public.document_intelligence_documents d
      where d.tenant_id = $1 and d.source_product = 'ferocity'
        and ($2 = '' or d.search_vector @@ websearch_to_tsquery('english', $2)
          or d.vendor_name ilike '%' || $2 || '%' or d.document_number ilike '%' || $2 || '%'
          or exists (select 1 from public.document_intelligence_transactions t where t.document_id = d.id
            and (t.description ilike '%' || $2 || '%' or t.merchant_name ilike '%' || $2 || '%'
              or t.suggested_category ilike '%' || $2 || '%')))
        and ($3::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and b.project_id=$3::uuid
        ))
        and ($4::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and bi.batch_id=$4::uuid
        ))
        and ($5::uuid is null or d.id=$5::uuid)
      order by case d.status when 'needs_review' then 0 when 'duplicate' then 1 else 2 end, d.created_at desc
      limit 100`, [workspaceId, term, projectId, batchId, documentId]),
    queryPostgres<{ auto_process_enabled: boolean; auto_process_confidence: string; duplicate_warning_threshold: string }>(`
      select auto_process_enabled, auto_process_confidence::text, duplicate_warning_threshold::text
      from public.document_intelligence_settings where tenant_id = $1 and source_product = 'ferocity'`, [workspaceId]),
    listFerocityAllocationTargets(workspaceId),
    queryPostgres<{ id: string; name: string; project_type: string; tax_year: number | null; status: string; batch_count: string; document_count: string }>(`
      select p.id,p.name,p.project_type,p.tax_year,p.status,
        count(distinct b.id)::text as batch_count,
        count(distinct i.document_id) filter (where i.document_id is not null)::text as document_count
      from public.document_intelligence_projects p
      left join public.document_intelligence_import_batches b on b.tenant_id=p.tenant_id and b.project_id=p.id
      left join public.document_intelligence_import_batch_items i on i.tenant_id=b.tenant_id and i.batch_id=b.id
      where p.tenant_id=$1 and p.status='active'
      group by p.id order by p.updated_at desc,p.name`, [workspaceId]),
    queryPostgres<{
      id: string; project_id: string | null; project_name: string | null; label: string; status: string;
      expected_file_count: string; imported_file_count: string; reused_file_count: string;
      failed_file_count: string; unresolved_file_count: string; created_at: string; items: unknown;
    }>(`
      select b.id,b.project_id,p.name as project_name,b.label,b.status,b.expected_file_count::text,
        b.imported_file_count::text,b.reused_file_count::text,b.failed_file_count::text,
        greatest(b.expected_file_count-b.imported_file_count-b.reused_file_count-b.failed_file_count,0)::text as unresolved_file_count,
        b.created_at::text,
        coalesce(jsonb_agg(jsonb_build_object(
          'fileIndex',i.file_index,'fileName',i.file_name,'outcome',i.outcome,
          'documentId',i.document_id,'error',i.error_message
        ) order by i.file_index) filter (where i.id is not null),'[]'::jsonb) as items
      from public.document_intelligence_import_batches b
      left join public.document_intelligence_projects p on p.tenant_id=b.tenant_id and p.id=b.project_id
      left join public.document_intelligence_import_batch_items i on i.tenant_id=b.tenant_id and i.batch_id=b.id
      where b.tenant_id=$1
      group by b.id,p.name order by b.created_at desc limit 20`, [workspaceId]),
  ]);
  const metric = counts?.rows[0];
  return {
    metrics: {
      total: Number(metric?.total ?? 0),
      needsReview: Number(metric?.needs_review ?? 0),
      duplicates: Number(metric?.duplicates ?? 0),
      approved: Number(metric?.approved ?? 0)
    },
    documents: (documents?.rows ?? []).map((row) => ({
      ...row,
      overallConfidence: Number(row.overall_confidence ?? 0),
      duplicateConfidence: row.duplicate_confidence === null ? null : Number(row.duplicate_confidence),
      allocations: Array.isArray(row.allocations) ? row.allocations : [],
      lineItems: Array.isArray(row.line_items) ? row.line_items : [],
      statementTransactions: Array.isArray(row.statement_transactions) ? row.statement_transactions : [],
      independentReview: row.independent_review && typeof row.independent_review === "object" ? row.independent_review : null
    })),
    settings: settings?.rows[0] ?? { auto_process_enabled: false, auto_process_confidence: "0.92", duplicate_warning_threshold: "0.84" },
    allocationTargets,
    projects: (projects?.rows ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      projectType: project.project_type,
      taxYear: project.tax_year,
      batchCount: Number(project.batch_count),
      documentCount: Number(project.document_count),
    })),
    batches: (batches?.rows ?? []).map((batch) => ({
      id: batch.id,
      projectId: batch.project_id,
      projectName: batch.project_name,
      label: batch.label,
      status: batch.status,
      expectedFileCount: Number(batch.expected_file_count),
      importedFileCount: Number(batch.imported_file_count),
      reusedFileCount: Number(batch.reused_file_count),
      failedFileCount: Number(batch.failed_file_count),
      unresolvedFileCount: Number(batch.unresolved_file_count),
      createdAt: batch.created_at,
      items: Array.isArray(batch.items) ? batch.items : [],
    })),
  };
}
