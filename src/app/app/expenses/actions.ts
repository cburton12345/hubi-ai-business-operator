"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { listFerocityAllocationTargets, postFerocityExpense, postFerocityStatementTransactions } from "@/lib/document-intelligence/ferocity-adapter";
import { normalizeExpenseDocument } from "@/lib/document-intelligence/normalize";
import { hasUsableDocumentExtraction } from "@/lib/document-intelligence/independent-review";
import type { AllocationSuggestion } from "@/lib/document-intelligence/types";
import { processExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";
import { isUploadFile } from "@/lib/operations-workforce/receipt-upload";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function importExpenseDocumentAction(formData: FormData) {
  const actor = await requirePermission("lead:manage");
  const files = formData.getAll("documents").filter(isUploadFile);
  const legacyFile = formData.get("document");
  if (!files.length && isUploadFile(legacyFile)) files.push(legacyFile);
  if (!files.length) redirect("/app/expenses?error=Choose+at+least+one+document+to+import");
  let result: Awaited<ReturnType<typeof processExpenseDocumentBatch>>;
  try {
    result = await processExpenseDocumentBatch({
      workspaceId: actor.workspace.id,
      userId: actor.userId === "admin-token" ? null : actor.userId,
      files,
      sourceChannel: text(formData, "sourceChannel") === "camera" ? "camera" : "upload"
    });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Document processing failed");
    redirect(`/app/expenses?error=${message}`);
  }
  revalidatePath("/app/expenses");
  revalidatePath("/app/job-tracker");
  const query = new URLSearchParams({
    importedCount: String(result.completed.length),
    failedCount: String(result.failed.length),
    duplicateCount: String(result.completed.filter((item) => item.result.status === "duplicate").length)
  });
  if (result.failed.length) query.set("batchError", result.failed.slice(0, 3).map((item) => `${item.fileName}: ${item.error}`).join(" | "));
  redirect(`/app/expenses?${query.toString()}`);
}

const reviewSchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  documentType: z.enum(["receipt", "invoice", "bill", "purchase_order", "warranty", "credit_memo", "statement", "other"]),
  vendorName: z.string().max(200).optional(),
  documentDate: z.string().optional(),
  total: z.string().optional(),
  tax: z.string().optional(),
  category: z.string().max(160).optional(),
  allocationKey: z.string().max(300).optional()
});

function dollarsToCents(value?: string) {
  if (!value) return null;
  const amount = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export async function reviewExpenseDocumentAction(formData: FormData) {
  const actor = await requirePermission("approval:review_low");
  const parsed = reviewSchema.safeParse({
    documentId: text(formData, "documentId"), decision: text(formData, "decision"), documentType: text(formData, "documentType"),
    vendorName: text(formData, "vendorName") || undefined, documentDate: text(formData, "documentDate") || undefined,
    total: text(formData, "total") || undefined, tax: text(formData, "tax") || undefined,
    category: text(formData, "category") || undefined,
    allocationKey: text(formData, "allocationKey") || undefined
  });
  if (!parsed.success) return;
  const workspaceId = actor.workspace.id;
  if (parsed.data.decision === "reject") {
    await queryPostgres(`update public.document_intelligence_documents set status = 'rejected', updated_at = now()
      where tenant_id = $1 and id = $2 and status in ('needs_review','duplicate','failed')`, [workspaceId, parsed.data.documentId]);
    await queryPostgres(`insert into public.document_intelligence_events (tenant_id, document_id, event_type, actor_type, actor_ref)
      values ($1,$2,'document_rejected','user',$3)`, [workspaceId, parsed.data.documentId, actor.userId]);
    await queryPostgres(`update public.ai_independent_reviews set status = 'rejected', human_review_required = false,
      human_reviewed_by_user_id = $3, human_reviewed_at = now(), updated_at = now()
      where tenant_id = $1 and subject_type = 'expense_document' and subject_id = $2`,
      [workspaceId, parsed.data.documentId, actor.userId === "admin-token" ? null : actor.userId]);
    revalidatePath("/app/expenses");
    return;
  }
  const result = await queryPostgres<{ normalized_json: Record<string, unknown>; ferocity_expense_id: string | null }>(`
    select normalized_json, ferocity_expense_id from public.document_intelligence_documents
    where tenant_id = $1 and id = $2 and status in ('needs_review','duplicate','failed')`, [workspaceId, parsed.data.documentId]);
  const row = result?.rows[0];
  if (!row || row.ferocity_expense_id) return;
  const document = normalizeExpenseDocument({
    ...row.normalized_json,
    document_type: parsed.data.documentType,
    vendor_name: parsed.data.vendorName ?? row.normalized_json.vendor_name,
    document_date: parsed.data.documentDate ?? row.normalized_json.document_date,
    total_cents: dollarsToCents(parsed.data.total) ?? row.normalized_json.total_cents,
    tax_cents: dollarsToCents(parsed.data.tax) ?? row.normalized_json.tax_cents,
    suggested_category: parsed.data.category ?? row.normalized_json.suggested_category,
    overall_confidence: 1,
    review_reasons: []
  });
  if (document.documentType === "statement" && !hasUsableDocumentExtraction(document)) {
    redirect("/app/expenses?error=This+statement+is+missing+readable+pages+or+transactions.+Reprocess+it+before+approving+any+rows.");
  }
  if (parsed.data.allocationKey) {
    const targets = await listFerocityAllocationTargets(workspaceId);
    const selected = targets.find((target) => `${target.type}|${target.ref ?? ""}` === parsed.data.allocationKey);
    if (selected) {
      await queryPostgres(`update public.document_intelligence_allocations set status = 'rejected', updated_at = now()
        where tenant_id = $1 and document_id = $2`, [workspaceId, parsed.data.documentId]);
      await queryPostgres(`insert into public.document_intelligence_allocations (
        tenant_id, document_id, target_type, target_ref, target_label, amount_cents, allocation_percent,
        confidence, rationale, status, metadata_json
      ) values ($1,$2,$3,$4,$5,$6,100,1,'Confirmed by reviewer.','confirmed',$7::jsonb)`, [
        workspaceId, parsed.data.documentId, selected.type, selected.ref, selected.label, document.totalCents,
        JSON.stringify(selected.metadata ?? {})
      ]);
    }
  }
  const allocationsResult = await queryPostgres<{
    target_type: string; target_ref: string | null; target_label: string; amount_cents: number | null;
    allocation_percent: string | null; confidence: string; rationale: string | null;
  }>(`select target_type, target_ref, target_label, amount_cents, allocation_percent::text, confidence::text, rationale
    from public.document_intelligence_allocations where tenant_id = $1 and document_id = $2 and status <> 'rejected'
    order by confidence desc`, [workspaceId, parsed.data.documentId]);
  const allocations: AllocationSuggestion[] = (allocationsResult?.rows ?? []).map((item) => ({
    targetType: item.target_type, targetRef: item.target_ref, targetLabel: item.target_label,
    amountCents: item.amount_cents, allocationPercent: item.allocation_percent === null ? null : Number(item.allocation_percent),
    confidence: Number(item.confidence), rationale: item.rationale ?? "Confirmed by reviewer."
  }));

  if (document.documentType === "statement") {
    const selectedTransactionIds = formData.getAll("includeTransaction")
      .filter((value): value is string => typeof value === "string")
      .filter((value) => z.string().uuid().safeParse(value).success);
    const excludedTransactionIds = formData.getAll("excludeTransaction")
      .filter((value): value is string => typeof value === "string")
      .filter((value) => z.string().uuid().safeParse(value).success);
    const selectedSet = new Set(selectedTransactionIds);
    if (excludedTransactionIds.some((id) => selectedSet.has(id))) {
      redirect("/app/expenses?error=A+statement+row+cannot+be+confirmed+and+excluded+at+the+same+time.");
    }
    if (selectedTransactionIds.length) {
      const pending = await queryPostgres<{ count: string }>(`
        select count(*)::text as count
        from public.document_intelligence_transactions
        where tenant_id = $1 and document_id = $2 and id = any($3::uuid[])
          and metadata_json->>'providerStatus' = 'pending'`, [workspaceId, parsed.data.documentId, selectedTransactionIds]);
      if (Number(pending?.rows[0]?.count ?? 0) > 0) {
        redirect("/app/expenses?error=Pending+statement+charges+cannot+be+approved+until+they+settle+on+a+later+statement.");
      }
    }
    const transactionTargets = await listFerocityAllocationTargets(workspaceId);
    const allocationByTransactionId = Object.fromEntries(selectedTransactionIds.flatMap((transactionId) => {
      const allocationKey = text(formData, `transactionAllocation:${transactionId}`);
      const selected = transactionTargets.find((target) => `${target.type}|${target.ref ?? ""}` === allocationKey);
      return selected ? [[transactionId, {
        targetType: selected.type,
        targetRef: selected.ref,
        targetLabel: selected.label,
        amountCents: null,
        allocationPercent: 100,
        confidence: 1,
        rationale: "Confirmed by reviewer for this statement transaction.",
        metadata: { ...(selected.metadata ?? {}), assignmentEvidence: "owner_confirmed" }
      } satisfies AllocationSuggestion]] : [];
    }));
    const categoryUpdates = selectedTransactionIds.map((transactionId) => ({
      id: transactionId,
      category: text(formData, `transactionCategory:${transactionId}`) || null
    }));
    if (categoryUpdates.length) {
      await queryPostgres(`update public.document_intelligence_transactions t
        set suggested_category = coalesce(x.category, t.suggested_category), updated_at = now()
        from jsonb_to_recordset($3::jsonb) as x(id uuid, category text)
        where t.tenant_id = $1 and t.document_id = $2 and t.id = x.id`, [workspaceId, parsed.data.documentId, JSON.stringify(categoryUpdates)]);
    }
    const expenseIds = await postFerocityStatementTransactions({
      workspaceId,
      documentId: parsed.data.documentId,
      transactionIds: [...new Set(selectedTransactionIds)],
      allocations,
      allocationByTransactionId
    });
    if (expenseIds === null) return;
    if (excludedTransactionIds.length) {
      await queryPostgres(`update public.document_intelligence_transactions
        set status='excluded', updated_at=now()
        where tenant_id=$1 and document_id=$2 and id=any($3::uuid[])
          and posted_expense_ref is null`, [workspaceId, parsed.data.documentId, [...new Set(excludedTransactionIds)]]);
    }
    const remaining = await queryPostgres<{ count: string }>(`
      select count(*)::text as count
      from public.document_intelligence_transactions
      where tenant_id=$1 and document_id=$2 and status in ('needs_review','duplicate')`,
      [workspaceId, parsed.data.documentId]);
    const remainingReviewCount = Number(remaining?.rows[0]?.count ?? 0);
    await queryPostgres(`update public.document_intelligence_documents set status = 'approved', vendor_name = $1,
      document_type = 'statement', document_date = $2, normalized_json = $3::jsonb,
      field_confidence_json = $4::jsonb, overall_confidence = 1, review_reasons_json = '[]'::jsonb,
      approved_by_user_id = $5, approved_at = now(), updated_at = now()
      where tenant_id = $6 and id = $7`, [
        document.vendorName, document.documentDate, JSON.stringify(document), JSON.stringify(document.fieldConfidence),
        actor.userId === "admin-token" ? null : actor.userId, workspaceId, parsed.data.documentId
      ]);
    await queryPostgres(`insert into public.document_intelligence_events
      (tenant_id, document_id, event_type, actor_type, actor_ref, detail_json)
      values ($1,$2,'statement_transactions_approved','user',$3,$4::jsonb)`, [
        workspaceId, parsed.data.documentId, actor.userId,
        JSON.stringify({ selectedTransactionCount: selectedTransactionIds.length, excludedTransactionCount: excludedTransactionIds.length, expenseIds, remainingReviewCount })
      ]);
    if (remainingReviewCount > 0) {
      await queryPostgres(`update public.document_intelligence_documents
        set status='needs_review', approved_by_user_id=null, approved_at=null, updated_at=now()
        where tenant_id=$1 and id=$2`, [workspaceId, parsed.data.documentId]);
    } else {
      await queryPostgres(`update public.ai_independent_reviews set status = 'human_confirmed', human_review_required = false,
        human_reviewed_by_user_id = $3, human_reviewed_at = now(), updated_at = now()
        where tenant_id = $1 and subject_type = 'expense_document' and subject_id = $2`,
        [workspaceId, parsed.data.documentId, actor.userId === "admin-token" ? null : actor.userId]);
    }
    revalidatePath("/app/expenses");
    revalidatePath("/app/job-tracker");
    revalidatePath("/app/reports");
    return;
  }
  const shouldPostExpense = document.documentType !== "warranty" && document.totalCents !== null;
  const expenseId = shouldPostExpense
    ? await postFerocityExpense({ workspaceId, documentId: parsed.data.documentId, document, allocations, status: "approved" })
    : null;
  if (shouldPostExpense && !expenseId) return;
  await queryPostgres(`update public.document_intelligence_documents set status = 'approved', vendor_name = $1,
    document_type = $2, document_date = $3, total_cents = $4, tax_cents = $5, suggested_category = $6, normalized_json = $7::jsonb,
    field_confidence_json = $8::jsonb, overall_confidence = 1, review_reasons_json = '[]'::jsonb,
    approved_by_user_id = $9, approved_at = now(), ferocity_expense_id = $10, updated_at = now()
    where tenant_id = $11 and id = $12`, [
      document.vendorName, document.documentType, document.documentDate, document.totalCents, document.taxCents, document.suggestedCategory,
      JSON.stringify(document), JSON.stringify(document.fieldConfidence), actor.userId === "admin-token" ? null : actor.userId,
      expenseId, workspaceId, parsed.data.documentId
    ]);
  await queryPostgres(`update public.document_intelligence_allocations set status = 'confirmed', updated_at = now()
    where tenant_id = $1 and document_id = $2 and status = 'suggested'`, [workspaceId, parsed.data.documentId]);
  await queryPostgres(`insert into public.document_intelligence_events (tenant_id, document_id, event_type, actor_type, actor_ref, detail_json)
    values ($1,$2,'document_approved','user',$3,$4::jsonb)`, [workspaceId, parsed.data.documentId, actor.userId, JSON.stringify({ expenseId })]);
  await queryPostgres(`update public.ai_independent_reviews set status = 'human_confirmed', human_review_required = false,
    human_reviewed_by_user_id = $3, human_reviewed_at = now(), updated_at = now()
    where tenant_id = $1 and subject_type = 'expense_document' and subject_id = $2`,
    [workspaceId, parsed.data.documentId, actor.userId === "admin-token" ? null : actor.userId]);
  revalidatePath("/app/expenses");
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/reports");
}

export async function updateExpenseIntelligenceSettingsAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  const enabled = text(formData, "autoProcess") === "on";
  const threshold = Math.max(0.8, Math.min(0.99, Number(text(formData, "confidenceThreshold") || 0.92)));
  await queryPostgres(`insert into public.document_intelligence_settings (tenant_id, source_product, auto_process_enabled, auto_process_confidence)
    values ($1,'ferocity',$2,$3) on conflict (tenant_id, source_product) do update
    set auto_process_enabled = excluded.auto_process_enabled, auto_process_confidence = excluded.auto_process_confidence, updated_at = now()`,
    [actor.workspace.id, enabled, threshold]);
  revalidatePath("/app/expenses");
}
