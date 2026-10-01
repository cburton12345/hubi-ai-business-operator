import { queryPostgres } from "@/lib/db/postgres";
import { listFerocityAllocationTargets } from "./ferocity-adapter";

export async function getExpenseIntelligenceDashboard(workspaceId: string, search?: string) {
  const term = search?.trim() ?? "";
  const [counts, documents, settings, allocationTargets] = await Promise.all([
    queryPostgres<{ total: string; needs_review: string; duplicates: string; approved: string }>(`
      select count(*)::text as total,
        count(*) filter (where status = 'needs_review')::text as needs_review,
        count(*) filter (where status = 'duplicate')::text as duplicates,
        count(*) filter (where status in ('approved','auto_approved'))::text as approved
      from public.document_intelligence_documents where tenant_id = $1 and source_product = 'ferocity'`, [workspaceId]),
    queryPostgres<{
      id: string; status: string; document_type: string; original_file_name: string; source_channel: string;
      vendor_name: string | null; document_number: string | null; document_date: string | null;
      subtotal_cents: number | null; tax_cents: number | null; total_cents: number | null;
      payment_method: string | null; suggested_category: string | null; overall_confidence: string;
      review_reasons_json: string[]; duplicate_of_document_id: string | null; duplicate_confidence: string | null;
      ferocity_expense_id: string | null; created_at: string; allocations: unknown; line_items: unknown; statement_transactions: unknown;
    }>(`
      select d.id, d.status, d.document_type, d.original_file_name, d.source_channel,
        d.vendor_name, d.document_number, d.document_date::text, d.subtotal_cents, d.tax_cents,
        d.total_cents, d.payment_method, d.suggested_category, d.overall_confidence::text,
        d.review_reasons_json, d.duplicate_of_document_id, d.duplicate_confidence::text,
        d.ferocity_expense_id, d.created_at,
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
          'duplicateConfidence', t.duplicate_confidence, 'postedExpenseRef', t.posted_expense_ref
        ) order by t.position) from public.document_intelligence_transactions t where t.document_id = d.id), '[]'::jsonb) as statement_transactions
      from public.document_intelligence_documents d
      where d.tenant_id = $1 and d.source_product = 'ferocity'
        and ($2 = '' or d.search_vector @@ websearch_to_tsquery('english', $2)
          or d.vendor_name ilike '%' || $2 || '%' or d.document_number ilike '%' || $2 || '%'
          or exists (select 1 from public.document_intelligence_transactions t where t.document_id = d.id
            and (t.description ilike '%' || $2 || '%' or t.merchant_name ilike '%' || $2 || '%'
              or t.suggested_category ilike '%' || $2 || '%')))
      order by case d.status when 'needs_review' then 0 when 'duplicate' then 1 else 2 end, d.created_at desc
      limit 100`, [workspaceId, term]),
    queryPostgres<{ auto_process_enabled: boolean; auto_process_confidence: string; duplicate_warning_threshold: string }>(`
      select auto_process_enabled, auto_process_confidence::text, duplicate_warning_threshold::text
      from public.document_intelligence_settings where tenant_id = $1 and source_product = 'ferocity'`, [workspaceId]),
    listFerocityAllocationTargets(workspaceId)
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
      statementTransactions: Array.isArray(row.statement_transactions) ? row.statement_transactions : []
    })),
    settings: settings?.rows[0] ?? { auto_process_enabled: false, auto_process_confidence: "0.92", duplicate_warning_threshold: "0.84" },
    allocationTargets
  };
}
