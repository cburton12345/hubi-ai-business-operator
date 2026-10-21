import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { extractExpenseDocument } from "../src/lib/document-intelligence/extract";
import { hasUsableDocumentExtraction } from "../src/lib/document-intelligence/independent-review";
import { classifyStatementTransaction } from "../src/lib/document-intelligence/statement-classification";
import { listFerocityAllocationTargets } from "../src/lib/document-intelligence/ferocity-adapter";

type StoredDocument = {
  id: string;
  tenant_id: string;
  original_bucket: string;
  original_storage_path: string;
  original_file_name: string;
  original_mime_type: string;
  original_byte_count: string | number;
  content_sha256: string;
  child_count: string | number;
  posted_child_count: string | number;
};

const apply = process.argv.includes("--apply");
const accountEmail = "burtonchristopher125@gmail.com";
const expectedWorkspaceSlug = "h4r";
const expectedYear = 2025;
const expectedStatementNames = new Set([
  "January 2025.pdf", "February 2025.pdf", "March 2025.pdf", "April 2025.pdf",
  "May 2025.pdf", "June 2025.pdf", "July 2025.pdf", "August 2025.pdf", "September 2025.pdf",
  "October 2025.pdf", "November 2025.pdf", "December 2025.pdf",
]);
const fileFlagIndex = process.argv.indexOf("--file");
const targetFile = fileFlagIndex >= 0 ? process.argv[fileFlagIndex + 1]?.trim() : null;
if (fileFlagIndex >= 0 && (!targetFile || !expectedStatementNames.has(targetFile))) {
  throw new Error(`--file must name one expected 2025 statement: ${[...expectedStatementNames].join(", ")}`);
}
const selectedStatementNames = targetFile ? new Set([targetFile]) : expectedStatementNames;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hash(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const workspaceResult = await client.query<{ id: string; slug: string }>(`
      select t.id, t.slug
      from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.status='active' and tu.role in ('owner','admin')
      join public.tenants t on t.id=tu.tenant_id and t.status='active'
      where lower(u.email)=lower($1) and t.slug=$2
      order by tu.updated_at desc
    `, [accountEmail, expectedWorkspaceSlug]);
    if (workspaceResult.rowCount !== 1) throw new Error("Expected exactly one active H4R owner workspace mapping.");
    const workspaceId = workspaceResult.rows[0].id;

    const documentsResult = await client.query<StoredDocument>(`
      select d.id,d.tenant_id,d.original_bucket,d.original_storage_path,d.original_file_name,
        d.original_mime_type,d.original_byte_count,d.content_sha256,
        count(t.id)::text as child_count,
        count(t.id) filter (where t.posted_expense_ref is not null or t.status='approved')::text as posted_child_count
      from public.document_intelligence_documents d
      left join public.document_intelligence_transactions t on t.document_id=d.id and t.tenant_id=d.tenant_id
      where d.tenant_id=$1 and d.source_product='ferocity'
        and d.original_mime_type='application/pdf'
        and d.original_file_name = any($2::text[])
      group by d.id
      order by d.original_file_name
    `, [workspaceId, [...selectedStatementNames]]);
    const documents = documentsResult.rows;
    const names = new Set(documents.map((item) => item.original_file_name));
    const missing = [...selectedStatementNames].filter((name) => !names.has(name));
    const unexpectedDuplicates = documents.length - names.size;
    if (missing.length || unexpectedDuplicates) {
      throw new Error(`Preserved statement set is not exact (missing=${missing.join(",") || "none"}; duplicateRecords=${unexpectedDuplicates}).`);
    }
    for (const document of documents) {
      if (Number(document.posted_child_count) > 0) {
        throw new Error(`${document.original_file_name} already has approved or posted transaction rows; refusing replacement.`);
      }
      if (Number(document.child_count) > 0) {
        throw new Error(`${document.original_file_name} already has transaction rows; review them before using this repair.`);
      }
    }

    const storage = createClient(
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const targets = await listFerocityAllocationTargets(workspaceId);
    const summaries: Array<Record<string, unknown>> = [];

    for (const stored of documents) {
      const download = await storage.storage.from(stored.original_bucket).download(stored.original_storage_path);
      if (download.error || !download.data) throw new Error(`${stored.original_file_name}: preserved file download failed.`);
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      if (bytes.byteLength !== Number(stored.original_byte_count)) throw new Error(`${stored.original_file_name}: byte count mismatch.`);
      if (hash(bytes).toLowerCase() !== stored.content_sha256.toLowerCase()) throw new Error(`${stored.original_file_name}: checksum mismatch.`);

      const extracted = await extractExpenseDocument({
        workspaceId,
        fileName: stored.original_file_name,
        mimeType: stored.original_mime_type,
        fileBytes: bytes,
      });
      if (extracted.documentType !== "statement" || !hasUsableDocumentExtraction(extracted)) {
        throw new Error(`${stored.original_file_name}: extraction is not a complete usable statement.`);
      }
      if (!extracted.statementTransactions.length) throw new Error(`${stored.original_file_name}: no transactions extracted.`);
      const years = new Set(extracted.statementTransactions.map((row) => row.transactionDate?.slice(0, 4)).filter(Boolean));
      if (years.size !== 1 || !years.has(String(expectedYear))) {
        throw new Error(`${stored.original_file_name}: extracted transaction year is not exclusively ${expectedYear}.`);
      }
      const sourceKeys = extracted.statementTransactions.map((row) => row.sourceKey);
      if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error(`${stored.original_file_name}: duplicate source keys inside one statement.`);

      const prior = await client.query<{ id: string; source_key: string }>(`
        select id,source_key from public.document_intelligence_transactions
        where tenant_id=$1 and document_id<>$2 and source_key=any($3::text[])
      `, [workspaceId, stored.id, sourceKeys]);
      const priorBySource = new Map(prior.rows.map((row) => [row.source_key, row.id]));
      const rows = extracted.statementTransactions.map((transaction, position) => {
        const classification = classifyStatementTransaction(transaction, targets);
        const duplicateId = priorBySource.get(transaction.sourceKey);
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
          status: transaction.isTransfer ? "excluded" : duplicateId ? "duplicate" : "needs_review",
          duplicate_of_ref: duplicateId ? `document_transaction:${duplicateId}` : null,
          duplicate_confidence: duplicateId ? 1 : null,
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
          },
        };
      });
      const summary = {
        fileName: stored.original_file_name,
        transactions: rows.length,
        debits: rows.filter((row) => row.direction === "debit").length,
        credits: rows.filter((row) => row.direction === "credit").length,
        transfers: rows.filter((row) => row.is_transfer).length,
        duplicates: rows.filter((row) => row.status === "duplicate").length,
        debitTotalCents: rows.filter((row) => row.direction === "debit").reduce((sum, row) => sum + row.amount_cents, 0),
        creditTotalCents: rows.filter((row) => row.direction === "credit").reduce((sum, row) => sum + row.amount_cents, 0),
      };
      summaries.push(summary);
      if (!apply) continue;

      await client.query("begin");
      try {
        const locked = await client.query<{ child_count: string }>(`
          select (
            select count(*)::text from public.document_intelligence_transactions t
            where t.document_id=d.id and t.tenant_id=d.tenant_id
          ) as child_count
          from public.document_intelligence_documents d
          where d.id=$1 and d.tenant_id=$2
          for update
        `, [stored.id, workspaceId]);
        if (locked.rowCount !== 1 || Number(locked.rows[0].child_count) !== 0) throw new Error("Statement changed during reprocessing.");
        await client.query(`
          update public.document_intelligence_documents set
            status='needs_review',document_type='statement',vendor_name=$3,document_number=$4,
            document_date=$5,document_time=$6,currency=$7,subtotal_cents=$8,tax_cents=$9,
            discount_cents=$10,fee_cents=$11,tip_cents=$12,total_cents=$13,payment_method=$14,
            suggested_category=$15,extracted_text=$16,normalized_json=$17::jsonb,
            field_confidence_json=$18::jsonb,overall_confidence=$19,review_reasons_json=$20::jsonb,
            processing_error=null,updated_at=now()
          where id=$1 and tenant_id=$2
        `, [stored.id, workspaceId, extracted.vendorName, extracted.documentNumber, extracted.documentDate,
          extracted.documentTime, extracted.currency, extracted.subtotalCents, extracted.taxCents,
          extracted.discountCents, extracted.feeCents, extracted.tipCents, extracted.totalCents,
          extracted.paymentMethod, extracted.suggestedCategory, extracted.extractedText,
          JSON.stringify({ ...extracted, independentReview: null }), JSON.stringify(extracted.fieldConfidence),
          extracted.overallConfidence, JSON.stringify([...extracted.reviewReasons,
            "Preserved statement was reprocessed after the PDF runtime repair; transaction classifications require review."])]);
        await client.query(`
          insert into public.document_intelligence_transactions (
            tenant_id,document_id,position,source_key,transaction_date,posted_date,description,
            merchant_name,reference_number,amount_cents,direction,balance_cents,suggested_category,
            is_transfer,transfer_reason,confidence,status,duplicate_of_ref,duplicate_confidence,
            allocation_target_type,allocation_target_ref,allocation_target_label,allocation_confidence,
            allocation_rationale,metadata_json
          ) select $1,$2,x.position,x.source_key,x.transaction_date,x.posted_date,x.description,
            x.merchant_name,x.reference_number,x.amount_cents,x.direction,x.balance_cents,x.suggested_category,
            x.is_transfer,x.transfer_reason,x.confidence,x.status,x.duplicate_of_ref,x.duplicate_confidence,
            x.allocation_target_type,x.allocation_target_ref,x.allocation_target_label,x.allocation_confidence,
            x.allocation_rationale,x.metadata_json
          from jsonb_to_recordset($3::jsonb) as x(
            position int,source_key text,transaction_date date,posted_date date,description text,
            merchant_name text,reference_number text,amount_cents int,direction text,balance_cents int,
            suggested_category text,is_transfer boolean,transfer_reason text,confidence numeric,status text,
            duplicate_of_ref text,duplicate_confidence numeric,allocation_target_type text,
            allocation_target_ref text,allocation_target_label text,allocation_confidence numeric,
            allocation_rationale text,metadata_json jsonb)
        `, [workspaceId, stored.id, JSON.stringify(rows)]);
        await client.query(`
          insert into public.document_intelligence_events
            (tenant_id,document_id,event_type,actor_type,actor_ref,detail_json)
          values ($1,$2,'document_reprocessed','system','preserved_statement_repair',$3::jsonb)
        `, [workspaceId, stored.id, JSON.stringify(summary)]);
        const resetReview = await client.query(`
          update public.ai_independent_reviews set
            status='reviewer_unavailable',reviewer_run_type=null,
            deterministic_checks_json=jsonb_build_array(
              'Preserved statement was reprocessed after the PDF runtime repair; prior empty-output review evidence is invalid.'
            ),
            disagreements_json='[]'::jsonb,human_review_required=true,
            human_reviewed_by_user_id=null,human_reviewed_at=null,
            metadata_json=metadata_json || jsonb_build_object(
              'classificationReviewComplete',false,
              'reprocessedAt',now(),
              'reprocessSource','preserved_statement_repair'
            ),updated_at=now()
          where tenant_id=$1 and subject_type='expense_document' and subject_id=$2
        `, [workspaceId, stored.id]);
        if (!resetReview.rowCount) {
          await client.query(`
            insert into public.ai_independent_reviews (
              tenant_id,subject_type,subject_id,risk_tier,status,primary_run_type,reviewer_run_type,
              deterministic_checks_json,disagreements_json,human_review_required,metadata_json
            ) values (
              $1,'expense_document',$2,'critical','reviewer_unavailable',
              'expense_document_extraction',null,$3::jsonb,'[]'::jsonb,true,$4::jsonb
            )
          `, [workspaceId, stored.id, JSON.stringify([
            "Preserved statement was reprocessed after the PDF runtime repair; transaction-level independent classification review is required.",
          ]), JSON.stringify({ classificationReviewComplete: false, reprocessSource: "preserved_statement_repair" })]);
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    console.log(JSON.stringify({
      mode: apply ? "applied" : "dry_run",
      targetFile,
      workspaceId,
      statementCount: summaries.length,
      totals: {
        transactions: summaries.reduce((sum, row) => sum + Number(row.transactions), 0),
        debits: summaries.reduce((sum, row) => sum + Number(row.debits), 0),
        credits: summaries.reduce((sum, row) => sum + Number(row.credits), 0),
        transfers: summaries.reduce((sum, row) => sum + Number(row.transfers), 0),
        debitTotalCents: summaries.reduce((sum, row) => sum + Number(row.debitTotalCents), 0),
        creditTotalCents: summaries.reduce((sum, row) => sum + Number(row.creditTotalCents), 0),
      },
      documents: summaries,
      expensesPosted: false,
      originalsChanged: false,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Statement reprocessing failed.");
  process.exit(1);
});
