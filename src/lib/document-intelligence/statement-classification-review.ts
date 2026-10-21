import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { independentReviewerConfigured } from "@/lib/ai/model-routing";
import { queryPostgres } from "@/lib/db/postgres";

export const statementCategories = [
  "materials", "fuel", "meals", "lodging", "tools", "subcontractors", "utilities", "repairs",
  "office", "advertising", "fees", "software", "insurance", "taxes", "vehicle", "uncategorized",
  "payment_needs_classification", "deposit_needs_classification",
  "general_merchandise_needs_receipt", "personal_or_nonbusiness_needs_review",
  "equipment_needs_receipt", "government_or_legal_needs_review", "travel_needs_review",
  "education_or_training_needs_review", "professional_services_needs_review",
  "cooperative_account_needs_review", "software_or_advertising_needs_review",
] as const;
type StatementCategory = (typeof statementCategories)[number];
type ProposedClassification = { id: string; category: StatementCategory; confidence: number; rationale: string };

const categorySet = new Set<string>(statementCategories);
const statementReviewCandidatePredicate = `
  t.status = 'needs_review'
  and t.is_transfer = false
  and coalesce(t.metadata_json->>'providerStatus','completed') <> 'pending'
  and coalesce((t.metadata_json->>'classificationReviewAttempts')::int, 0) < 3
  and coalesce(t.metadata_json->>'classificationReviewStatus','') not in ('agreed','disagreed','reviewer_unavailable')
  and t.suggested_category in ('uncategorized','payment_needs_classification','deposit_needs_classification')
`;

function normalizedProposals(value: unknown) {
  if (!value || typeof value !== "object") return new Map<string, ProposedClassification>();
  const rows = (value as { classifications?: unknown }).classifications;
  if (!Array.isArray(rows)) return new Map<string, ProposedClassification>();
  return new Map(rows.flatMap((row): Array<[string, ProposedClassification]> => {
    if (!row || typeof row !== "object") return [];
    const candidate = row as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const category = typeof candidate.category === "string" && categorySet.has(candidate.category) ? candidate.category as StatementCategory : null;
    const confidence = Number(candidate.confidence);
    if (!id || !category || !Number.isFinite(confidence)) return [];
    return [[id, {
      id,
      category,
      confidence: Math.max(0, Math.min(1, confidence)),
      rationale: typeof candidate.rationale === "string" ? candidate.rationale.slice(0, 500) : "",
    }]];
  }));
}

export function compareStatementClassifications(primaryRaw: unknown, reviewerRaw: unknown, ids: string[]) {
  const primary = normalizedProposals(primaryRaw);
  const reviewer = normalizedProposals(reviewerRaw);
  return ids.map((id) => {
    const first = primary.get(id);
    const second = reviewer.get(id);
    const agreed = Boolean(first && second && first.category === second.category && first.confidence >= 0.8 && second.confidence >= 0.8);
    return { id, primary: first ?? null, reviewer: second ?? null, agreed, category: agreed ? first!.category : null };
  });
}

type ReviewRow = { id: string; document_id: string };
type TransactionRow = {
  id: string; transaction_date: string | null; description: string; merchant_name: string | null;
  amount_cents: number; direction: "debit" | "credit"; suggested_category: string | null;
  metadata_json: Record<string, unknown>;
};

export async function processStatementClassificationReviewsForTenant(tenantId: string, limit = 25) {
  if (!independentReviewerConfigured({
    primaryRunType: "expense_statement_classification",
    reviewerRunType: "independent_review_expense_statement_classification",
    requestType: "json",
  })) {
    return { documentsChecked: 0, rowsReviewed: 0, agreements: 0, disagreements: 0, unavailable: true };
  }
  const review = await queryPostgres<ReviewRow>(`
    select r.id, d.id as document_id
    from public.ai_independent_reviews r
    join public.document_intelligence_documents d on d.tenant_id = r.tenant_id and d.id = r.subject_id
    where r.tenant_id = $1 and r.subject_type = 'expense_document'
      and r.status = 'reviewer_unavailable'
      and d.normalized_json->>'extractionMethod' = 'deterministic_cash_app'
    order by r.created_at
    limit 1`, [tenantId]);
  const subject = review?.rows[0];
  if (!subject) return { documentsChecked: 0, rowsReviewed: 0, agreements: 0, disagreements: 0, unavailable: false };

  const configuredCap = Number.parseInt(process.env.AI_STATEMENT_CLASSIFICATION_REVIEW_MAX_ROWS_PER_DOCUMENT ?? "10", 10);
  const perDocumentCap = Number.isFinite(configuredCap) ? Math.max(1, Math.min(configuredCap, 50)) : 10;
  const usage = await queryPostgres<{ reviewed_count: string }>(`
    select count(*) filter (where coalesce((t.metadata_json->>'classificationReviewAttempts')::int,0) > 0)::text as reviewed_count
    from public.document_intelligence_transactions t
    where t.tenant_id=$1 and t.document_id=$2`, [tenantId, subject.document_id]);
  const reviewedCount = Number(usage?.rows[0]?.reviewed_count ?? 0);
  const remainingBudget = Math.max(0, perDocumentCap - reviewedCount);
  if (remainingBudget === 0) {
    await stopStatementReviewAtCap(tenantId, subject.document_id, perDocumentCap);
    await finalizeStatementReview(tenantId, subject.id, subject.document_id);
    return { documentsChecked: 1, rowsReviewed: 0, agreements: 0, disagreements: 0, unavailable: false };
  }

  const transactions = await queryPostgres<TransactionRow>(`
    select id, transaction_date::text, description, merchant_name, amount_cents, direction,
      suggested_category, metadata_json
    from public.document_intelligence_transactions t
    where t.tenant_id = $1 and t.document_id = $2
      and ${statementReviewCandidatePredicate}
    order by t.position
    limit $3`, [tenantId, subject.document_id, Math.max(1, Math.min(limit, 25, remainingBudget))]);
  const rows = transactions?.rows ?? [];
  if (!rows.length) {
    await finalizeStatementReview(tenantId, subject.id, subject.document_id);
    return { documentsChecked: 1, rowsReviewed: 0, agreements: 0, disagreements: 0, unavailable: false };
  }

  const payload = rows.map((row) => ({
    id: row.id, date: row.transaction_date, description: row.description, merchant: row.merchant_name,
    amount_cents: row.amount_cents, direction: row.direction, current_category: row.suggested_category,
  }));
  const fallback = { classifications: [] as Record<string, unknown>[] };
  const request = {
    tenantId,
    featureKey: "expense_document_intelligence",
    aiCategory: "core" as const,
    temperature: 0.05,
    timeoutMs: 60_000,
    system: `Classify statement transactions using only these categories: ${statementCategories.join(", ")}. Return JSON only with classifications containing id, category, confidence 0-1, and a short rationale. Do not decide tax deductibility. Do not invent facts. Person-to-person payments and deposits stay needs-classification unless the description itself proves a category.`,
    user: JSON.stringify({ transactions: payload }),
    fallback,
  };
  const [primary, reviewer] = await Promise.all([
    generateJsonWithAiService({ ...request, runType: "expense_statement_classification" }),
    generateJsonWithAiService({ ...request, runType: "independent_review_expense_statement_classification" }),
  ]);
  const compared = compareStatementClassifications(primary, reviewer, rows.map((row) => row.id));
  await Promise.all(compared.map((item) => queryPostgres(`
    update public.document_intelligence_transactions
    set suggested_category = case when $3::boolean then $4 else suggested_category end,
      metadata_json = metadata_json || jsonb_build_object(
        'classificationReviewStatus', case when $3::boolean then 'agreed' else case when $5::boolean
          then case when coalesce((metadata_json->>'classificationReviewAttempts')::int,0) + 1 >= 3 then 'reviewer_unavailable' else 'retry' end
          else 'disagreed' end end,
        'classificationReviewAttempts', coalesce((metadata_json->>'classificationReviewAttempts')::int,0) + 1,
        'primaryClassification', $6::jsonb,
        'reviewerClassification', $7::jsonb
      ), updated_at = now()
    where tenant_id = $1 and id = $2`, [
      tenantId, item.id, item.agreed, item.category,
      !item.primary || !item.reviewer,
      JSON.stringify(item.primary), JSON.stringify(item.reviewer),
    ])));
  if (reviewedCount + compared.length >= perDocumentCap) {
    await stopStatementReviewAtCap(tenantId, subject.document_id, perDocumentCap);
  }
  await finalizeStatementReview(tenantId, subject.id, subject.document_id);
  return {
    documentsChecked: 1,
    rowsReviewed: compared.length,
    agreements: compared.filter((item) => item.agreed).length,
    disagreements: compared.filter((item) => !item.agreed).length,
    unavailable: false,
  };
}

async function stopStatementReviewAtCap(tenantId: string, documentId: string, cap: number) {
  await queryPostgres(`
    update public.document_intelligence_transactions t
    set metadata_json = metadata_json || jsonb_build_object(
      'classificationReviewStatus','reviewer_unavailable',
      'classificationReviewPaused',true,
      'classificationReviewPauseReason','per_document_cost_cap',
      'classificationReviewRowCap',$3::int
    ), updated_at=now()
    where t.tenant_id=$1 and t.document_id=$2 and ${statementReviewCandidatePredicate}`,
  [tenantId, documentId, cap]);
}

async function finalizeStatementReview(tenantId: string, reviewId: string, documentId: string) {
  const result = await queryPostgres<{ outstanding: string; disagreements: string; agreements: string; excluded_pending: string }>(`
    select
      count(*) filter (where ${statementReviewCandidatePredicate})::text as outstanding,
      count(*) filter (where t.metadata_json->>'classificationReviewStatus' in ('disagreed','reviewer_unavailable'))::text as disagreements,
      count(*) filter (where t.metadata_json->>'classificationReviewStatus' = 'agreed')::text as agreements,
      count(*) filter (where coalesce(t.metadata_json->>'providerStatus','completed') = 'pending')::text as excluded_pending
    from public.document_intelligence_transactions t
    where t.tenant_id = $1 and t.document_id = $2 and t.status = 'needs_review' and t.is_transfer = false`, [tenantId, documentId]);
  const counts = result?.rows[0];
  const outstanding = Number(counts?.outstanding ?? 0);
  if (outstanding > 0) return;
  const disagreements = Number(counts?.disagreements ?? 0);
  await queryPostgres(`update public.ai_independent_reviews
    set status = $3, human_review_required = true,
      metadata_json = metadata_json || jsonb_build_object(
        'classificationReviewComplete',true,
        'classificationAgreements',$4::int,
        'classificationDisagreements',$5::int,
        'classificationExcludedPending',$6::int
      ),
      updated_at = now()
    where tenant_id = $1 and id = $2`, [
      tenantId, reviewId, disagreements ? "disagreed" : "passed",
      Number(counts?.agreements ?? 0), disagreements, Number(counts?.excluded_pending ?? 0),
    ]);
}
