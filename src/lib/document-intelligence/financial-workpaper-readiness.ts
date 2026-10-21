import { queryPostgres } from "@/lib/db/postgres";
import {
  getStatementYearCoverage,
  type StatementYearCoverage,
} from "./statement-year-coverage";

export type FinancialWorkpaperReadinessStatus =
  | "not_started"
  | "needs_sources"
  | "needs_review"
  | "ready_for_preparer";

export type FinancialWorkpaperBlockCode =
  | "no_source_documents"
  | "incomplete_import_batch"
  | "annual_coverage_unverified"
  | "missing_statement_periods"
  | "failed_document"
  | "unusable_extraction"
  | "incomplete_page_coverage"
  | "statement_totals_do_not_reconcile"
  | "unresolved_duplicate"
  | "unsafe_transfer_treatment"
  | "unsupported_property_assignment"
  | "independent_review_unavailable"
  | "independent_review_disagreed"
  | "human_review_pending"
  | "unclassified_expense"
  | "unassigned_expense"
  | "unclassified_deposit";

export type FinancialWorkpaperBlock = {
  code: FinancialWorkpaperBlockCode;
  count: number;
  message: string;
  nextAction: string;
  phase: "sources" | "review";
};

export type FinancialWorkpaperReadinessInput = {
  year: number;
  sourceDocumentCount: number;
  statementDocumentCount: number;
  transactionCount: number;
  coverage: StatementYearCoverage | null;
  incompleteBatchCount: number;
  failedDocumentCount: number;
  unusableExtractionCount: number;
  incompletePageCoverageCount: number;
  unreconciledStatementCount: number;
  unresolvedDuplicateCount: number;
  unsafeTransferCount: number;
  unsupportedAllocationCount: number;
  reviewerUnavailableCount: number;
  reviewerDisagreementCount: number;
  humanReviewPendingCount: number;
  unclassifiedExpenseCount: number;
  unassignedExpenseCount: number;
  unclassifiedDepositCount: number;
};

export type FinancialWorkpaperReadiness = {
  year: number;
  status: FinancialWorkpaperReadinessStatus;
  printableDraft: boolean;
  canClaimComplete: boolean;
  canClaimReadyForPreparer: boolean;
  label: string;
  summary: string;
  nextAction: string | null;
  blocks: FinancialWorkpaperBlock[];
  counts: Omit<FinancialWorkpaperReadinessInput, "year" | "coverage">;
  coverage: StatementYearCoverage | null;
};

const positive = (value: number) => Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function evaluateFinancialWorkpaperReadiness(
  raw: FinancialWorkpaperReadinessInput,
): FinancialWorkpaperReadiness {
  const input = {
    ...raw,
    sourceDocumentCount: positive(raw.sourceDocumentCount),
    statementDocumentCount: positive(raw.statementDocumentCount),
    transactionCount: positive(raw.transactionCount),
    incompleteBatchCount: positive(raw.incompleteBatchCount),
    failedDocumentCount: positive(raw.failedDocumentCount),
    unusableExtractionCount: positive(raw.unusableExtractionCount),
    incompletePageCoverageCount: positive(raw.incompletePageCoverageCount),
    unreconciledStatementCount: positive(raw.unreconciledStatementCount),
    unresolvedDuplicateCount: positive(raw.unresolvedDuplicateCount),
    unsafeTransferCount: positive(raw.unsafeTransferCount),
    unsupportedAllocationCount: positive(raw.unsupportedAllocationCount),
    reviewerUnavailableCount: positive(raw.reviewerUnavailableCount),
    reviewerDisagreementCount: positive(raw.reviewerDisagreementCount),
    humanReviewPendingCount: positive(raw.humanReviewPendingCount),
    unclassifiedExpenseCount: positive(raw.unclassifiedExpenseCount),
    unassignedExpenseCount: positive(raw.unassignedExpenseCount),
    unclassifiedDepositCount: positive(raw.unclassifiedDepositCount),
  };
  const blocks: FinancialWorkpaperBlock[] = [];
  const add = (
    code: FinancialWorkpaperBlockCode,
    count: number,
    phase: "sources" | "review",
    message: string,
    nextAction: string,
  ) => {
    if (count > 0) blocks.push({ code, count, phase, message, nextAction });
  };

  add(
    "no_source_documents",
    input.sourceDocumentCount === 0 ? 1 : 0,
    "sources",
    `No source documents are in the ${input.year} workpaper scope.`,
    `Add the original ${input.year} statements, receipts, or exports before relying on totals.`,
  );
  add(
    "incomplete_import_batch",
    input.incompleteBatchCount,
    "sources",
    `${plural(input.incompleteBatchCount, "upload batch", "upload batches")} did not finish with an outcome for every selected file.`,
    "Retry only the failed or unresolved files, then confirm every selected file is imported or checksum-reused.",
  );
  add(
    "annual_coverage_unverified",
    input.statementDocumentCount > 0 && !input.coverage ? 1 : 0,
    "sources",
    `Annual statement coverage has not been verified for ${input.year}.`,
    "Identify the account and statement periods represented by the preserved source files.",
  );
  add(
    "missing_statement_periods",
    input.coverage?.missingMonths.length ?? 0,
    "sources",
    input.coverage?.message ?? "One or more statement periods are missing.",
    `Add only the missing ${input.coverage?.missingMonths.join(", ") || "statement period"} source evidence.`,
  );
  add(
    "failed_document",
    input.failedDocumentCount,
    "sources",
    `${plural(input.failedDocumentCount, "source document")} failed processing.`,
    "Reprocess the preserved originals; do not replace or discard them.",
  );
  add(
    "unusable_extraction",
    input.unusableExtractionCount,
    "sources",
    `${plural(input.unusableExtractionCount, "document extraction")} produced no usable accounting detail.`,
    "Re-read the affected originals and verify that transaction-bearing documents produced transaction rows.",
  );
  add(
    "incomplete_page_coverage",
    input.incompletePageCoverageCount,
    "sources",
    `${plural(input.incompletePageCoverageCount, "document")} has failed, omitted, or unread pages.`,
    "Recover every page or explicitly replace the incomplete source before final review.",
  );
  add(
    "statement_totals_do_not_reconcile",
    input.unreconciledStatementCount,
    "sources",
    `${plural(input.unreconciledStatementCount, "statement")} does not reconcile extracted rows to its printed summary.`,
    "Correct the row extraction until money-in, money-out, and fees reconcile to the source statement.",
  );
  add(
    "unresolved_duplicate",
    input.unresolvedDuplicateCount,
    "review",
    `${plural(input.unresolvedDuplicateCount, "possible duplicate")} still needs a keep-or-exclude decision.`,
    "Confirm the possible duplicates without deleting the preserved originals.",
  );
  add(
    "unsafe_transfer_treatment",
    input.unsafeTransferCount,
    "review",
    `${plural(input.unsafeTransferCount, "transfer")} is included or posted as income or expense.`,
    "Keep transfers in reconciliation support only and remove them from income and expense totals.",
  );
  add(
    "unsupported_property_assignment",
    input.unsupportedAllocationCount,
    "review",
    `${plural(input.unsupportedAllocationCount, "property assignment")} relies on a formula, proximity, or another non-source method.`,
    "Replace each unsupported assignment with direct evidence, an explicit owner decision, or an unassigned/shared classification.",
  );
  add(
    "independent_review_unavailable",
    input.reviewerUnavailableCount,
    "review",
    `Independent review is unavailable for ${plural(input.reviewerUnavailableCount, "document")}.`,
    "Run a genuinely distinct review or record a human confirmation against the preserved source.",
  );
  add(
    "independent_review_disagreed",
    input.reviewerDisagreementCount,
    "review",
    `Independent review disagreed on ${plural(input.reviewerDisagreementCount, "document")}.`,
    "Resolve the listed differences against the original document.",
  );
  add(
    "human_review_pending",
    input.humanReviewPendingCount,
    "review",
    `${plural(input.humanReviewPendingCount, "high-impact document")} still requires a recorded human confirmation.`,
    "Confirm or reject the extraction while viewing the preserved original.",
  );
  add(
    "unclassified_expense",
    input.unclassifiedExpenseCount,
    "review",
    `${plural(input.unclassifiedExpenseCount, "expense")} still needs an accounting category.`,
    "Classify the unresolved expenses from their source evidence before posting or preparing final property totals.",
  );
  add(
    "unassigned_expense",
    input.unassignedExpenseCount,
    "review",
    `${plural(input.unassignedExpenseCount, "expense")} still needs a supported property, job, business-wide, or shared-cost decision.`,
    "Answer only the unresolved business-purpose and assignment questions; do not force a property from merchant location alone.",
  );
  add(
    "unclassified_deposit",
    input.unclassifiedDepositCount,
    "review",
    `${plural(input.unclassifiedDepositCount, "deposit")} still needs income type and property treatment.`,
    "Classify each unresolved deposit as rent, refundable deposit, reimbursement, refund, owner contribution, transfer, or other receipt.",
  );

  const hasSourceBlocks = blocks.some((block) => block.phase === "sources");
  const status: FinancialWorkpaperReadinessStatus = input.sourceDocumentCount === 0
    ? "not_started"
    : hasSourceBlocks
      ? "needs_sources"
      : blocks.length
        ? "needs_review"
        : "ready_for_preparer";
  const label = status === "ready_for_preparer"
    ? "Ready for preparer review"
    : status === "needs_review"
      ? "Draft — decisions remain"
      : status === "needs_sources"
        ? "Draft — source evidence incomplete"
        : "No workpaper started";
  const summary = status === "ready_for_preparer"
    ? `The ${input.year} workpaper passed source, reconciliation, duplicate, transfer, assignment, and review gates. A tax preparer must still determine final tax treatment.`
    : `${label}. ${plural(blocks.length, "blocking issue")} prevents a completion or preparer-ready claim.`;

  return {
    year: input.year,
    status,
    printableDraft: input.sourceDocumentCount > 0,
    canClaimComplete: false,
    canClaimReadyForPreparer: status === "ready_for_preparer",
    label,
    summary,
    nextAction: blocks[0]?.nextAction ?? null,
    blocks,
    counts: {
      sourceDocumentCount: input.sourceDocumentCount,
      statementDocumentCount: input.statementDocumentCount,
      transactionCount: input.transactionCount,
      incompleteBatchCount: input.incompleteBatchCount,
      failedDocumentCount: input.failedDocumentCount,
      unusableExtractionCount: input.unusableExtractionCount,
      incompletePageCoverageCount: input.incompletePageCoverageCount,
      unreconciledStatementCount: input.unreconciledStatementCount,
      unresolvedDuplicateCount: input.unresolvedDuplicateCount,
      unsafeTransferCount: input.unsafeTransferCount,
      unsupportedAllocationCount: input.unsupportedAllocationCount,
      reviewerUnavailableCount: input.reviewerUnavailableCount,
      reviewerDisagreementCount: input.reviewerDisagreementCount,
      humanReviewPendingCount: input.humanReviewPendingCount,
      unclassifiedExpenseCount: input.unclassifiedExpenseCount,
      unassignedExpenseCount: input.unassignedExpenseCount,
      unclassifiedDepositCount: input.unclassifiedDepositCount,
    },
    coverage: input.coverage,
  };
}

type ReadinessFactsRow = {
  source_document_count: string;
  statement_document_count: string;
  transaction_count: string;
  incomplete_batch_count: string;
  failed_document_count: string;
  unusable_extraction_count: string;
  incomplete_page_coverage_count: string;
  unreconciled_statement_count: string;
  unresolved_duplicate_count: string;
  unsafe_transfer_count: string;
  unsupported_allocation_count: string;
  reviewer_unavailable_count: string;
  reviewer_disagreement_count: string;
  human_review_pending_count: string;
  unclassified_expense_count: string;
  unassigned_expense_count: string;
  unclassified_deposit_count: string;
};

export async function getFinancialWorkpaperReadiness(
  tenantId: string,
  year: number,
  scope?: { projectId?: string | null; batchId?: string | null },
): Promise<FinancialWorkpaperReadiness> {
  const projectId = scope?.projectId ?? null;
  const batchId = scope?.batchId ?? null;
  const [factsResult, coverage] = await Promise.all([
    queryPostgres<ReadinessFactsRow>(`
      with scoped_documents as (
        select distinct d.*
        from public.document_intelligence_documents d
        where d.tenant_id=$1
          and d.status<>'rejected'
          and (
            (d.document_date >= make_date($2::int,1,1) and d.document_date < make_date(($2::int+1),1,1))
            or exists (
              select 1 from public.document_intelligence_transactions ty
              where ty.tenant_id=d.tenant_id and ty.document_id=d.id
                and coalesce(ty.transaction_date,ty.created_at::date)>=make_date($2::int,1,1)
                and coalesce(ty.transaction_date,ty.created_at::date)<make_date(($2::int+1),1,1)
            )
          )
          and ($3::uuid is null or exists (
            select 1 from public.document_intelligence_import_batch_items bi
            join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
            where bi.tenant_id=d.tenant_id and bi.document_id=d.id and b.project_id=$3::uuid
          ))
          and ($4::uuid is null or exists (
            select 1 from public.document_intelligence_import_batch_items bi
            where bi.tenant_id=d.tenant_id and bi.document_id=d.id and bi.batch_id=$4::uuid
          ))
      ), scoped_transactions as (
        select t.*
        from public.document_intelligence_transactions t
        join scoped_documents d on d.id=t.document_id
        where coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
          and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1)
      ), latest_reviews as (
        select distinct on (r.subject_id) r.subject_id,r.status,r.human_review_required
        from public.ai_independent_reviews r
        join scoped_documents d on d.id=r.subject_id
        where r.tenant_id=$1 and r.subject_type='expense_document'
        order by r.subject_id,r.created_at desc
      ), scoped_batches as (
        select b.*,
          (select count(*) from public.document_intelligence_import_batch_items bi where bi.tenant_id=b.tenant_id and bi.batch_id=b.id) item_count
        from public.document_intelligence_import_batches b
        where b.tenant_id=$1
          and ($3::uuid is null or b.project_id=$3::uuid)
          and ($4::uuid is null or b.id=$4::uuid)
          and ($3::uuid is not null or $4::uuid is not null)
      )
      select
        (select count(*) from scoped_documents)::text source_document_count,
        (select count(*) from scoped_documents where document_type='statement')::text statement_document_count,
        (select count(*) from scoped_transactions)::text transaction_count,
        (select count(*) from scoped_batches where status<>'completed' or item_count<>expected_file_count or imported_file_count+reused_file_count+failed_file_count<>expected_file_count)::text incomplete_batch_count,
        (select count(*) from scoped_documents where status='failed')::text failed_document_count,
        (select count(*) from scoped_documents d where
          (d.document_type='statement' and not exists (select 1 from scoped_transactions t where t.document_id=d.id))
          or (d.document_type<>'statement' and coalesce(length(btrim(d.extracted_text)),0)<20 and d.total_cents is null and d.subtotal_cents is null)
        )::text unusable_extraction_count,
        (select count(*) from scoped_documents d where d.document_type='statement' and (
          coalesce((d.normalized_json#>>'{sourceCoverage,totalPages}')::int,0)<1
          or coalesce(jsonb_array_length(case when jsonb_typeof(d.normalized_json#>'{sourceCoverage,readablePages}')='array' then d.normalized_json#>'{sourceCoverage,readablePages}' else '[]'::jsonb end),0)<>coalesce((d.normalized_json#>>'{sourceCoverage,totalPages}')::int,0)
          or coalesce(jsonb_array_length(case when jsonb_typeof(d.normalized_json#>'{sourceCoverage,failedPages}')='array' then d.normalized_json#>'{sourceCoverage,failedPages}' else '[]'::jsonb end),0)>0
          or coalesce(jsonb_array_length(case when jsonb_typeof(d.normalized_json#>'{sourceCoverage,omittedPages}')='array' then d.normalized_json#>'{sourceCoverage,omittedPages}' else '[]'::jsonb end),0)>0
        ))::text incomplete_page_coverage_count,
        (select count(*) from scoped_documents d where d.document_type='statement' and (
          coalesce(abs((d.normalized_json#>>'{statementSummary,differences,moneyInCents}')::int),0)>0
          or coalesce(abs((d.normalized_json#>>'{statementSummary,differences,moneyOutCents}')::int),0)>0
          or coalesce(abs((d.normalized_json#>>'{statementSummary,differences,feeCents}')::int),0)>0
        ))::text unreconciled_statement_count,
        (select count(*) from scoped_transactions where status='duplicate')::text unresolved_duplicate_count,
        (select count(*) from scoped_transactions where is_transfer=true and (posted_expense_ref is not null or status not in ('excluded','rejected')))::text unsafe_transfer_count,
        (select count(*) from scoped_transactions where allocation_target_type in ('property','unit') and (
          lower(coalesce(metadata_json->>'assignmentEvidence','')) in ('formula','proximity','merchant_location_suggestion','income_weighted','equal_split','synthetic')
          or lower(coalesce(metadata_json->>'allocationMethod','')) in ('formula','proximity','nearest','income_weighted','equal_split','balanced')
        ))::text unsupported_allocation_count,
        (select count(*) from latest_reviews where status='reviewer_unavailable')::text reviewer_unavailable_count,
        (select count(*) from latest_reviews where status='disagreed')::text reviewer_disagreement_count,
        (select count(*) from latest_reviews where human_review_required=true and status not in ('human_confirmed','rejected'))::text human_review_pending_count,
        (select count(*) from scoped_transactions where direction='debit' and is_transfer=false and status in ('needs_review','approved') and (
          coalesce(suggested_category,'')='' or lower(suggested_category)='uncategorized' or lower(suggested_category) ~ '_(needs_review|needs_receipt|needs_classification)$'
        ))::text unclassified_expense_count,
        (select count(*) from scoped_transactions where direction='debit' and is_transfer=false and status in ('needs_review','approved') and coalesce(allocation_target_type,'') not in ('property','unit','job','business_wide','shared'))::text unassigned_expense_count,
        (select count(*) from scoped_transactions where direction='credit' and is_transfer=false and status in ('needs_review','approved') and (
          status='needs_review' or coalesce(suggested_category,'')='' or coalesce(allocation_target_type,'') not in ('property','unit','job','business_wide','shared')
        ))::text unclassified_deposit_count
    `, [tenantId, year, projectId, batchId]),
    getStatementYearCoverage(tenantId, year, scope),
  ]);
  const row = factsResult?.rows[0];
  const count = (value: string | undefined) => Number(value ?? 0);
  return evaluateFinancialWorkpaperReadiness({
    year,
    coverage,
    sourceDocumentCount: count(row?.source_document_count),
    statementDocumentCount: count(row?.statement_document_count),
    transactionCount: count(row?.transaction_count),
    incompleteBatchCount: count(row?.incomplete_batch_count),
    failedDocumentCount: count(row?.failed_document_count),
    unusableExtractionCount: count(row?.unusable_extraction_count),
    incompletePageCoverageCount: count(row?.incomplete_page_coverage_count),
    unreconciledStatementCount: count(row?.unreconciled_statement_count),
    unresolvedDuplicateCount: count(row?.unresolved_duplicate_count),
    unsafeTransferCount: count(row?.unsafe_transfer_count),
    unsupportedAllocationCount: count(row?.unsupported_allocation_count),
    reviewerUnavailableCount: count(row?.reviewer_unavailable_count),
    reviewerDisagreementCount: count(row?.reviewer_disagreement_count),
    humanReviewPendingCount: count(row?.human_review_pending_count),
    unclassifiedExpenseCount: count(row?.unclassified_expense_count),
    unassignedExpenseCount: count(row?.unassigned_expense_count),
    unclassifiedDepositCount: count(row?.unclassified_deposit_count),
  });
}
