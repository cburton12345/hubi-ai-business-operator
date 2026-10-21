import crypto from "node:crypto";
import { independentReviewerConfigured } from "@/lib/ai/model-routing";
import { queryPostgres } from "@/lib/db/postgres";
import {
  consumePreparedReceiptUpload,
  isUploadFile,
  receiptBucket,
  uploadReceiptPhoto,
  type PreparedReceiptUploadReference,
  type ReceiptUploadResult
} from "@/lib/operations-workforce/receipt-upload";
import { suggestAllocationsWithAi } from "./allocate-with-ai";
import { assessDuplicate } from "./deduplicate";
import { extractExpenseDocument } from "./extract";
import { compareDocumentExtractions, hasUsableDocumentExtraction, needsIndependentDocumentReview } from "./independent-review";
import { ferocityExpenseAdapter } from "./ferocity-adapter";
import { extractStructuredFileText } from "./structured-file";
import { classifyStatementTransaction } from "./statement-classification";
import { validateExpenseDocumentSelection } from "./upload-policy";
import type { AllocationSuggestion, DuplicateCandidate, ProductExpenseAdapter } from "./types";

type ImportSource = "camera" | "upload" | "drag_drop" | "email" | "api" | "mobile" | "other";

function storagePath(storageUri: string) {
  const prefix = `supabase://${receiptBucket}/`;
  return storageUri.startsWith(prefix) ? storageUri.slice(prefix.length) : storageUri;
}

export async function processExpenseDocument(input: {
  workspaceId: string;
  userId?: string | null;
  file: File;
  sourceChannel?: ImportSource;
  sourceProduct?: string;
  sourceMessageRef?: string | null;
  suppliedText?: string | null;
  adapter?: ProductExpenseAdapter;
  preparedUpload?: { bytes: Uint8Array; upload: ReceiptUploadResult };
}) {
  if (!isUploadFile(input.file)) throw new Error("Choose a receipt, invoice, bill, purchase order, warranty, or expense document.");
  const bytes = input.preparedUpload
    ? Buffer.from(input.preparedUpload.bytes)
    : Buffer.from(await input.file.arrayBuffer());
  const structuredText = await extractStructuredFileText({ fileName: input.file.name, bytes: new Uint8Array(bytes) });
  const contentSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const product = input.sourceProduct ?? "ferocity";
  const existing = await queryPostgres<{ id: string; status: string; ferocity_expense_id: string | null }>(`
    select id, status, ferocity_expense_id
    from public.document_intelligence_documents
    where tenant_id = $1 and source_product = $2 and content_sha256 = $3 and status <> 'rejected'
    order by created_at desc limit 1`, [input.workspaceId, product, contentSha256]);
  if (existing?.rows[0]) {
    return {
      documentId: existing.rows[0].id,
      status: existing.rows[0].status,
      expenseId: existing.rows[0].ferocity_expense_id,
      reusedExisting: true
    };
  }
  const uploaded = input.preparedUpload?.upload ?? await uploadReceiptPhoto(input.workspaceId, input.file);
  if (!uploaded.storageUri) throw new Error(uploaded.uploadError ?? `Document upload failed (${uploaded.uploadStatus}).`);

  const document = await extractExpenseDocument({
    workspaceId: input.workspaceId,
    userId: input.userId,
    imageUrl: uploaded.signedUrl,
    mimeType: uploaded.mimeType,
    suppliedText: input.suppliedText?.trim() || structuredText,
    fileName: uploaded.fileName,
    fileBytes: new Uint8Array(bytes)
  });
  const independentReviewRequired = needsIndependentDocumentReview(document);
  const extractionUsable = hasUsableDocumentExtraction(document);
  const reviewerRequestType = uploaded.mimeType?.startsWith("image/") || uploaded.mimeType === "application/pdf"
    ? "vision_json" as const
    : "json" as const;
  const primaryRunType = reviewerRequestType === "vision_json" ? "expense_document_extraction" : "expense_document_text_extraction";
  // Deterministic Cash App extraction is source-table parsing, not a model run.
  // Do not rerun the same parser and mislabel identical output as independent AI review.
  const reviewerAvailable = document.extractionMethod !== "deterministic_cash_app"
    && independentReviewerConfigured({ primaryRunType, requestType: reviewerRequestType });
  const reviewerDocument = extractionUsable && independentReviewRequired && reviewerAvailable
    ? await extractExpenseDocument({
        workspaceId: input.workspaceId,
        userId: input.userId,
        imageUrl: uploaded.signedUrl,
        mimeType: uploaded.mimeType,
        suppliedText: input.suppliedText?.trim() || structuredText,
        fileName: uploaded.fileName,
        fileBytes: new Uint8Array(bytes),
        reviewPass: true,
      })
    : null;
  const independentReview = independentReviewRequired
    ? compareDocumentExtractions(document, reviewerDocument)
    : null;
  const independentReviewReasons = independentReview
    ? [
        ...independentReview.deterministicIssues,
        ...independentReview.disagreements,
        ...(independentReview.status === "reviewer_unavailable"
          ? [document.extractionMethod === "deterministic_cash_app"
              ? "Deterministic statement extraction completed; independent classification review is still required."
              : "Independent reviewer model is unavailable or not distinct from the primary model."]
          : []),
      ]
    : [];
  const adapter = input.adapter ?? ferocityExpenseAdapter;
  const [settingsResult, candidatesResult, targets] = await Promise.all([
    queryPostgres<{ auto_process_enabled: boolean; auto_process_confidence: string; duplicate_warning_threshold: string }>(`
      insert into public.document_intelligence_settings (tenant_id, source_product)
      values ($1,$2) on conflict (tenant_id, source_product) do update set updated_at = public.document_intelligence_settings.updated_at
      returning auto_process_enabled, auto_process_confidence::text, duplicate_warning_threshold::text`, [input.workspaceId, product]),
    queryPostgres<DuplicateCandidate & { content_sha256: string; vendor_name: string | null; document_number: string | null; document_date: string | null; total_cents: number | null }>(`
      select id, content_sha256, vendor_name, document_number, document_date::text, total_cents
      from public.document_intelligence_documents
      where tenant_id = $1 and source_product = $2 and status <> 'rejected'
        and (content_sha256 = $3 or created_at >= now() - interval '120 days')
      order by created_at desc limit 100`, [input.workspaceId, product, contentSha256]),
    adapter.listAllocationTargets({ workspaceId: input.workspaceId, document })
  ]);
  const candidates = (candidatesResult?.rows ?? []).map((row) => ({
    id: row.id,
    contentSha256: row.content_sha256,
    vendorName: row.vendor_name,
    documentNumber: row.document_number,
    documentDate: row.document_date,
    totalCents: row.total_cents
  }));
  const duplicate = assessDuplicate(document, contentSha256, candidates);
  const settings = settingsResult?.rows[0];
  const duplicateThreshold = Number(settings?.duplicate_warning_threshold ?? 0.84);
  const allocations = extractionUsable && document.documentType !== "statement"
    ? await suggestAllocationsWithAi({ workspaceId: input.workspaceId, userId: input.userId, document, targets })
    : [];
  const allocationConfidence = allocations.length ? Math.max(...allocations.map((item) => item.confidence)) : 0;
  const threshold = Number(settings?.auto_process_confidence ?? 0.92);
  const isDuplicate = duplicate.confidence >= duplicateThreshold;
  // Statements always receive a transaction-level review. A statement total must
  // never be posted as one expense, even when document extraction is confident.
  const canAutoApprove = document.documentType !== "statement"
    && Boolean(settings?.auto_process_enabled)
    && extractionUsable
    && !isDuplicate
    && document.overallConfidence >= threshold
    && allocationConfidence >= threshold
    && document.reviewReasons.length === 0
    && (!independentReviewRequired || independentReview?.status === "passed");
  const status = isDuplicate ? "duplicate" : canAutoApprove ? "auto_approved" : "needs_review";

  const inserted = await queryPostgres<{ id: string }>(`
    insert into public.document_intelligence_documents (
      tenant_id, source_product, source_workspace_ref, source_channel, source_message_ref, status,
      document_type, original_bucket, original_storage_path, original_file_name, original_mime_type,
      original_byte_count, content_sha256, vendor_name, document_number, document_date, document_time,
      currency, subtotal_cents, tax_cents, discount_cents, fee_cents, tip_cents, total_cents,
      payment_method, suggested_category, extracted_text, normalized_json, field_confidence_json,
      overall_confidence, review_reasons_json, duplicate_of_document_id, duplicate_confidence,
      approved_by_user_id, approved_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb,$29::jsonb,$30,$31::jsonb,$32,$33,$34,$35)
    returning id`, [
      input.workspaceId, product, input.workspaceId, input.sourceChannel ?? "upload", input.sourceMessageRef ?? null, status,
      document.documentType, receiptBucket, storagePath(uploaded.storageUri), uploaded.fileName ?? input.file.name,
      uploaded.mimeType ?? input.file.type ?? "application/octet-stream", input.file.size, contentSha256,
      document.vendorName, document.documentNumber, document.documentDate, document.documentTime, document.currency,
      document.subtotalCents, document.taxCents, document.discountCents, document.feeCents, document.tipCents,
      document.totalCents, document.paymentMethod, document.suggestedCategory, document.extractedText,
      JSON.stringify({ ...document, independentReview }), JSON.stringify(document.fieldConfidence), document.overallConfidence,
      JSON.stringify([...(isDuplicate ? [...document.reviewReasons, ...duplicate.reasons] : document.reviewReasons), ...independentReviewReasons]),
      isDuplicate ? duplicate.duplicateOfId : null, isDuplicate ? duplicate.confidence : null,
      canAutoApprove ? input.userId ?? null : null, canAutoApprove ? new Date() : null
    ]);
  const documentId = inserted?.rows[0]?.id;
  if (!documentId) throw new Error("The document was stored, but its intelligence record could not be created.");

  if (independentReview) {
    await queryPostgres(
      `insert into public.ai_independent_reviews (
         tenant_id,subject_type,subject_id,risk_tier,status,primary_run_type,reviewer_run_type,
         deterministic_checks_json,disagreements_json,human_review_required,metadata_json
       ) values ($1,'expense_document',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb)`,
      [
        input.workspaceId,
        documentId,
        independentReview.tier,
        independentReview.status,
        primaryRunType,
        reviewerAvailable ? `independent_review_${primaryRunType}` : null,
        JSON.stringify(independentReview.deterministicIssues),
        JSON.stringify(independentReview.disagreements),
        independentReview.humanReviewRequired,
        JSON.stringify({ reviewerAvailable, extractionMethod: document.extractionMethod ?? "ai", sourceProduct: product, originalFileName: uploaded.fileName ?? input.file.name }),
      ],
    );
  }

  if (document.documentType === "statement" && document.statementTransactions.length) {
    const sourceKeys = document.statementTransactions.map((transaction) => transaction.sourceKey);
    const dates = [...new Set(document.statementTransactions.map((transaction) => transaction.transactionDate).filter((value): value is string => Boolean(value)))];
    const amounts = [...new Set(document.statementTransactions.map((transaction) => transaction.amountCents))];
    const [priorTransactions, priorExpenses] = await Promise.all([
      queryPostgres<{ id: string; source_key: string }>(`
        select id, source_key from public.document_intelligence_transactions
        where tenant_id = $1 and source_key = any($2::text[])`, [input.workspaceId, sourceKeys]),
      dates.length ? queryPostgres<{ id: string; expense_date: string; total_cents: number; vendor: string | null }>(`
        select id, expense_date::text, amount_cents + tax_cents as total_cents, vendor
        from public.operations_expenses
        where tenant_id = $1 and status <> 'rejected'
          and expense_date = any($2::date[]) and (amount_cents + tax_cents) = any($3::int[])`, [input.workspaceId, dates, amounts]) : Promise.resolve({ rows: [] })
    ]);
    const existingBySource = new Map((priorTransactions?.rows ?? []).map((row) => [row.source_key, row.id]));
    const expenseRows = priorExpenses?.rows ?? [];
    const rows = document.statementTransactions.map((transaction, position) => {
      const classification = classifyStatementTransaction(transaction, targets);
      const exactTransactionId = existingBySource.get(transaction.sourceKey);
      const merchant = (transaction.merchantName ?? transaction.description).toLowerCase();
      const expenseMatch = transaction.direction === "debit" && transaction.transactionDate ? expenseRows.find((expense) => {
        if (expense.expense_date !== transaction.transactionDate || Number(expense.total_cents) !== transaction.amountCents) return false;
        const vendor = (expense.vendor ?? "").toLowerCase();
        // Date and amount alone are not enough: two legitimate purchases can
        // share both. Require merchant evidence before suppressing a row as a
        // likely duplicate; exact cross-import source keys remain definitive.
        return Boolean(vendor) && (merchant.includes(vendor) || vendor.includes(merchant));
      }) : null;
      const duplicateConfidence = exactTransactionId ? 1 : expenseMatch ? 0.86 : null;
      const status = transaction.isTransfer
        ? "excluded"
        : duplicateConfidence !== null
          ? "duplicate"
          : "needs_review";
      return {
        position,
        source_key: transaction.sourceKey,
        transaction_date: transaction.transactionDate,
        posted_date: transaction.postedDate,
        description: transaction.description,
        merchant_name: transaction.merchantName,
        reference_number: transaction.referenceNumber,
        amount_cents: transaction.amountCents,
        direction: transaction.direction,
        balance_cents: transaction.balanceCents,
        suggested_category: classification.category,
        is_transfer: transaction.isTransfer,
        transfer_reason: transaction.transferReason,
        confidence: transaction.confidence,
        status,
        duplicate_of_ref: exactTransactionId ? `document_transaction:${exactTransactionId}` : expenseMatch ? `operations_expense:${expenseMatch.id}` : null,
        duplicate_confidence: duplicateConfidence,
        allocation_target_type: classification.allocation?.targetType ?? null,
        allocation_target_ref: classification.allocation?.targetRef ?? null,
        allocation_target_label: classification.allocation?.targetLabel ?? null,
        allocation_confidence: classification.allocation?.confidence ?? null,
        allocation_rationale: classification.allocation?.rationale ?? null,
        metadata_json: {
          counterpartyName: transaction.counterpartyName,
          counterpartyHandle: transaction.counterpartyHandle,
          note: transaction.note,
          transactionType: transaction.transactionType,
          providerStatus: transaction.providerStatus,
          feeCents: transaction.feeCents ?? 0,
          ...(classification.allocation?.metadata ?? {}),
        }
      };
    });
    await queryPostgres(`
      insert into public.document_intelligence_transactions (
        tenant_id, document_id, position, source_key, transaction_date, posted_date, description,
        merchant_name, reference_number, amount_cents, direction, balance_cents, suggested_category,
        is_transfer, transfer_reason, confidence, status, duplicate_of_ref, duplicate_confidence,
        allocation_target_type, allocation_target_ref, allocation_target_label, allocation_confidence,
        allocation_rationale, metadata_json
      )
      select $1, $2, x.position, x.source_key, x.transaction_date, x.posted_date, x.description,
        x.merchant_name, x.reference_number, x.amount_cents, x.direction, x.balance_cents,
        x.suggested_category, x.is_transfer, x.transfer_reason, x.confidence, x.status,
        x.duplicate_of_ref, x.duplicate_confidence, x.allocation_target_type, x.allocation_target_ref,
        x.allocation_target_label, x.allocation_confidence, x.allocation_rationale, x.metadata_json
      from jsonb_to_recordset($3::jsonb) as x(
        position int, source_key text, transaction_date date, posted_date date, description text,
        merchant_name text, reference_number text, amount_cents int, direction text, balance_cents int,
        suggested_category text, is_transfer boolean, transfer_reason text, confidence numeric,
        status text, duplicate_of_ref text, duplicate_confidence numeric, allocation_target_type text,
        allocation_target_ref text, allocation_target_label text, allocation_confidence numeric,
        allocation_rationale text, metadata_json jsonb
      )
      on conflict (document_id, source_key) do nothing`, [input.workspaceId, documentId, JSON.stringify(rows)]);
  }

  await Promise.all([
    ...document.lineItems.map((item, position) => queryPostgres(`
      insert into public.document_intelligence_line_items (
        tenant_id, document_id, position, description, product_code, quantity, unit, unit_price_cents,
        discount_cents, tax_cents, total_cents, suggested_category, confidence
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
        input.workspaceId, documentId, position, item.description, item.productCode, item.quantity, item.unit,
        item.unitPriceCents, item.discountCents, item.taxCents, item.totalCents, item.suggestedCategory, item.confidence
      ])),
    ...allocations.map((item) => insertAllocation(input.workspaceId, documentId, item, canAutoApprove ? "confirmed" : "suggested")),
    queryPostgres(`insert into public.document_intelligence_events (tenant_id, document_id, event_type, actor_type, actor_ref, detail_json)
      values ($1,$2,'document_processed',$3,$4,$5::jsonb)`, [
        input.workspaceId, documentId, input.sourceChannel === "email" ? "email" : "user", input.userId ?? input.sourceMessageRef ?? null,
        JSON.stringify({ status, extractionConfidence: document.overallConfidence, allocationConfidence, duplicate })
      ])
  ]);

  let expenseId: string | null = null;
  if (canAutoApprove && adapter.postApprovedExpense) {
    expenseId = await adapter.postApprovedExpense({ workspaceId: input.workspaceId, documentId, document, allocations });
    await queryPostgres(`update public.document_intelligence_documents set ferocity_expense_id = $1, updated_at = now() where id = $2 and tenant_id = $3`, [expenseId, documentId, input.workspaceId]);
  }
  return { documentId, document, allocations, duplicate, status, expenseId, reusedExisting: false };
}

export type ExpenseDocumentBatchResult = {
  completed: { fileIndex: number; fileName: string; result: Awaited<ReturnType<typeof processExpenseDocument>> }[];
  failed: { fileIndex: number; fileName: string; error: string }[];
};

/**
 * Runs a bounded batch through the exact same single-document workflow. Processing is
 * intentionally sequential so a large phone upload cannot exhaust workspace AI or
 * database concurrency. A failed file never rolls back documents already preserved.
 */
export async function processExpenseDocumentBatch(input: {
  workspaceId: string;
  userId?: string | null;
  files: File[];
  sourceChannel?: ImportSource;
  sourceProduct?: string;
  sourceMessageRef?: string | null;
  suppliedText?: string | null;
  adapter?: ProductExpenseAdapter;
  maxFiles?: number;
}): Promise<ExpenseDocumentBatchResult> {
  const maxFiles = Math.max(1, Math.min(input.maxFiles ?? 25, 50));
  const selectionError = validateExpenseDocumentSelection(input.files);
  if (selectionError) throw new Error(selectionError);
  if (input.files.length > maxFiles) throw new Error(`Import up to ${maxFiles} documents at a time.`);
  const completed: ExpenseDocumentBatchResult["completed"] = [];
  const failed: ExpenseDocumentBatchResult["failed"] = [];
  for (const [fileIndex, file] of input.files.entries()) {
    try {
      const result = await processExpenseDocument({
        workspaceId: input.workspaceId,
        userId: input.userId,
        file,
        sourceChannel: input.sourceChannel,
        sourceProduct: input.sourceProduct,
        sourceMessageRef: input.sourceMessageRef,
        suppliedText: input.suppliedText,
        adapter: input.adapter
      });
      completed.push({ fileIndex, fileName: file.name || "unnamed document", result });
    } catch (error) {
      failed.push({ fileIndex, fileName: file.name || "unnamed document", error: error instanceof Error ? error.message : "Document processing failed" });
    }
  }
  return { completed, failed };
}

export async function processPreparedExpenseDocumentBatch(input: {
  workspaceId: string;
  userId?: string | null;
  uploads: PreparedReceiptUploadReference[];
  sourceChannel?: ImportSource;
  sourceProduct?: string;
  sourceMessageRef?: string | null;
  suppliedText?: string | null;
  adapter?: ProductExpenseAdapter;
}): Promise<ExpenseDocumentBatchResult> {
  if (!input.uploads.length) throw new Error("Choose at least one document to import.");
  if (input.uploads.length > 25) throw new Error("Import up to 25 documents at a time.");
  const totalBytes = input.uploads.reduce((sum, upload) => sum + upload.byteCount, 0);
  if (totalBytes > 375 * 1024 * 1024) throw new Error("The prepared batch exceeds the supported total size.");
  const completed: ExpenseDocumentBatchResult["completed"] = [];
  const failed: ExpenseDocumentBatchResult["failed"] = [];
  for (const [fileIndex, reference] of input.uploads.entries()) {
    try {
      const prepared = await consumePreparedReceiptUpload(input.workspaceId, reference);
      const result = await processExpenseDocument({
        workspaceId: input.workspaceId,
        userId: input.userId,
        file: prepared.file,
        sourceChannel: input.sourceChannel,
        sourceProduct: input.sourceProduct,
        sourceMessageRef: input.sourceMessageRef,
        suppliedText: input.suppliedText,
        adapter: input.adapter,
        preparedUpload: prepared
      });
      completed.push({ fileIndex, fileName: reference.fileName, result });
    } catch (error) {
      failed.push({ fileIndex, fileName: reference.fileName || "unnamed document", error: error instanceof Error ? error.message : "Document processing failed" });
    }
  }
  return { completed, failed };
}

async function insertAllocation(workspaceId: string, documentId: string, item: AllocationSuggestion, status: "suggested" | "confirmed") {
  return queryPostgres(`
    insert into public.document_intelligence_allocations (
      tenant_id, document_id, target_type, target_ref, target_label, amount_cents,
      allocation_percent, confidence, rationale, status, metadata_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`, [
      workspaceId, documentId, item.targetType, item.targetRef, item.targetLabel, item.amountCents,
      item.allocationPercent, item.confidence, item.rationale, status, JSON.stringify(item.metadata ?? {})
    ]);
}
