import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { extractExpenseDocument } from "../src/lib/document-intelligence/extract";
import { classifyStatementTransaction } from "../src/lib/document-intelligence/statement-classification";
import { listFerocityAllocationTargets } from "../src/lib/document-intelligence/ferocity-adapter";
import type { NormalizedExpenseDocument, StatementTransaction } from "../src/lib/document-intelligence/types";

const workspaceId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const cashAppBatchIds = [
  "bc6b6a69-e5cf-482f-b990-454e5779eb65",
  "f5b38707-064b-4a36-ae02-6ea65e443dad",
];
const creditCardBatchIds = [
  "dcbb2c82-6ccd-4aad-8f5b-d636149b1647",
  "5cee4c81-41c9-4b01-8c29-cd5c60aa35ab",
  "8b8636f5-9670-4b1d-aece-a9ad113e6803",
];
const creditCardDocumentId = "b66779f9-8c08-4593-b2fc-b2fbec61871d";
const creditCardSha256 = "3e8bf6f98853c9ef1c2f35210b2f78a735da2fbbcb1f2ba0a48b68b29e739ab6";
const cashProjectName = "H4R 2025 — Andrew Burton Cash App";
const creditProjectName = "H4R 2025 — Credit Card";
const apply = process.argv.includes("--apply");

type StoredDocument = {
  id: string;
  original_bucket: string;
  original_storage_path: string;
  original_file_name: string;
  original_mime_type: string;
  original_byte_count: string;
  content_sha256: string;
  child_count: string;
  posted_child_count: string;
};

type PreparedDocument = {
  stored: StoredDocument;
  document: NormalizedExpenseDocument;
  rows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  accountType: "cash_app" | "credit_card";
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("Credit-card CSV contains an unterminated quoted field.");
  values.push(value);
  return values;
}

function isoDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

function amountCents(value: string) {
  if (!/^-?\d+(?:\.\d{2})$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? Math.round(parsed * 100) : null;
}

function stableTransactionKeys(rows: Omit<StatementTransaction, "sourceKey">[]) {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const base = crypto.createHash("sha256").update([
      row.transactionDate ?? "",
      row.postedDate ?? "",
      row.description.toLowerCase(),
      row.amountCents,
      row.direction,
      row.referenceNumber ?? "",
    ].join("|")).digest("hex");
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return {
      ...row,
      sourceKey: crypto.createHash("sha256").update(`${base}|occurrence:${occurrence}`).digest("hex"),
    };
  });
}

function parseCreditCardCsv(text: string): NormalizedExpenseDocument {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("Credit-card CSV is empty.");
  const header = parseCsvLine(lines[0]).map((value) => value.trim().toUpperCase());
  const expected = ["DATE", "DESCRIPTION", "AMOUNT", "CHECK #", "STATUS"];
  if (header.length !== expected.length || header.some((value, index) => value !== expected[index])) {
    throw new Error(`Unexpected credit-card CSV header: ${header.join("|")}`);
  }
  const rawRows: Omit<StatementTransaction, "sourceKey">[] = [];
  for (const [offset, line] of lines.slice(1).entries()) {
    const fields = parseCsvLine(line);
    if (fields.length !== expected.length) throw new Error(`Credit-card CSV row ${offset + 2} has ${fields.length} fields.`);
    const [rawDate, rawDescription, rawAmount, checkNumber, rawStatus] = fields;
    const transactionDate = isoDate(rawDate);
    const signedCents = amountCents(rawAmount);
    const description = rawDescription.trim();
    const providerStatus = rawStatus.trim().toLowerCase();
    if (!transactionDate || !description || signedCents === null) {
      throw new Error(`Credit-card CSV row ${offset + 2} has an invalid date, description, or amount.`);
    }
    if (transactionDate.slice(0, 4) !== "2025") throw new Error(`Credit-card CSV row ${offset + 2} is outside 2025.`);
    if (!new Set(["posted", "pending"]).has(providerStatus)) {
      throw new Error(`Credit-card CSV row ${offset + 2} has unsupported status ${rawStatus}.`);
    }
    const isAccountPayment = /\b(?:online ach payment|payment thank you|autopay payment|electronic payment|card payment)\b/i.test(description);
    const direction = signedCents < 0 ? "debit" : "credit";
    rawRows.push({
      transactionDate,
      postedDate: transactionDate,
      description,
      merchantName: isAccountPayment ? null : description,
      counterpartyName: null,
      counterpartyHandle: null,
      note: null,
      transactionType: isAccountPayment ? "credit_card_payment" : direction === "credit" ? "refund_or_adjustment" : "credit_card_purchase",
      providerStatus,
      referenceNumber: checkNumber.trim() || null,
      amountCents: Math.abs(signedCents),
      feeCents: 0,
      direction,
      balanceCents: null,
      suggestedCategory: isAccountPayment ? "transfer" : direction === "credit" ? "refund_or_adjustment" : null,
      isTransfer: isAccountPayment,
      transferReason: isAccountPayment ? "Credit-card account payment; excluded from expense totals by default." : null,
      confidence: 0.99,
    });
  }
  if (rawRows.length !== 652) throw new Error(`Expected 652 credit-card transactions, found ${rawRows.length}.`);
  const statementTransactions = stableTransactionKeys(rawRows);
  const dates = statementTransactions.map((row) => row.transactionDate).filter((value): value is string => Boolean(value)).sort();
  return {
    documentType: "statement",
    vendorName: "Credit card CSV export",
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantPostalCode: null,
    documentNumber: null,
    documentDate: dates.at(-1) ?? null,
    documentTime: null,
    subtotalCents: null,
    taxCents: null,
    discountCents: null,
    feeCents: null,
    tipCents: null,
    totalCents: null,
    currency: "USD",
    paymentMethod: "Credit card",
    suggestedCategory: null,
    lineItems: [],
    statementTransactions,
    extractedText: text,
    fieldConfidence: { documentType: 1, documentDate: 0.99, statementTransactions: 0.99 },
    overallConfidence: 0.99,
    reviewReasons: [
      `CSV covers ${dates[0]} through ${dates.at(-1)}; it is not represented as a complete January–December statement set.`,
      "Purchases, payments, refunds, business purpose, tax category, and property assignment require review.",
    ],
    extractionMethod: "fallback",
  };
}

function monthFromFileName(fileName: string) {
  const match = fileName.match(/^Cash_App_(January|February|March|April|May|June|July|August|September|October|November|December)_2025_/);
  return match?.[1] ?? null;
}

function transactionRows(document: NormalizedExpenseDocument, targets: Awaited<ReturnType<typeof listFerocityAllocationTargets>>) {
  return document.statementTransactions.map((transaction, position) => {
    const classification = classifyStatementTransaction(transaction, targets);
    const pending = transaction.providerStatus?.toLowerCase() === "pending";
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
      suggested_category: transaction.isTransfer ? "transfer" : transaction.suggestedCategory ?? classification.category,
      is_transfer: transaction.isTransfer,
      transfer_reason: transaction.transferReason,
      confidence: transaction.confidence,
      status: transaction.isTransfer ? "excluded" : pending ? "needs_review" : "needs_review",
      duplicate_of_ref: null,
      duplicate_confidence: null,
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
        reviewRequired: true,
        ...(classification.allocation?.metadata ?? {}),
      },
    };
  });
}

async function ensureProject(client: pg.Client, name: string, metadata: Record<string, unknown>) {
  const result = await client.query<{ id: string }>(`
    insert into public.document_intelligence_projects
      (tenant_id,name,project_type,tax_year,status,metadata_json)
    values ($1,$2,'tax_year',2025,'active',$3::jsonb)
    on conflict (tenant_id,name) do update set
      project_type='tax_year',tax_year=2025,status='active',
      metadata_json=public.document_intelligence_projects.metadata_json || excluded.metadata_json,
      updated_at=now()
    returning id
  `, [workspaceId, name, JSON.stringify(metadata)]);
  return result.rows[0].id;
}

async function replaceFailedExtraction(client: pg.Client, prepared: PreparedDocument) {
  const { stored, document, rows, summary, accountType } = prepared;
  const locked = await client.query<{ child_count: string; posted_child_count: string; content_sha256: string }>(`
    select d.content_sha256,
      (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id) child_count,
      (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id and (t.status='approved' or t.posted_expense_ref is not null)) posted_child_count
    from public.document_intelligence_documents d
    where d.tenant_id=$1 and d.id=$2 for update
  `, [workspaceId, stored.id]);
  if (locked.rowCount !== 1) throw new Error(`${stored.original_file_name}: document disappeared during repair.`);
  if (locked.rows[0].content_sha256.toLowerCase() !== stored.content_sha256.toLowerCase()) throw new Error(`${stored.original_file_name}: checksum changed during repair.`);
  if (Number(locked.rows[0].child_count) || Number(locked.rows[0].posted_child_count)) throw new Error(`${stored.original_file_name}: child rows appeared during repair.`);

  await client.query(`
    update public.document_intelligence_documents set
      status='needs_review',document_type='statement',vendor_name=$3,document_number=$4,
      document_date=$5,document_time=$6,currency=$7,subtotal_cents=$8,tax_cents=$9,
      discount_cents=$10,fee_cents=$11,tip_cents=$12,total_cents=$13,payment_method=$14,
      suggested_category=$15,extracted_text=$16,normalized_json=$17::jsonb,
      field_confidence_json=$18::jsonb,overall_confidence=$19,review_reasons_json=$20::jsonb,
      processing_error=null,updated_at=now()
    where tenant_id=$1 and id=$2
  `, [workspaceId, stored.id, document.vendorName, document.documentNumber, document.documentDate,
    document.documentTime, document.currency, document.subtotalCents, document.taxCents,
    document.discountCents, document.feeCents, document.tipCents, document.totalCents,
    document.paymentMethod, document.suggestedCategory, document.extractedText,
    JSON.stringify({ ...document, independentReview: null, repairEvidence: summary }),
    JSON.stringify(document.fieldConfidence), document.overallConfidence,
    JSON.stringify([...document.reviewReasons, "Deterministic repair completed; no expense, income, tax treatment, or property assignment was approved."])]);

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
    values ($1,$2,'document_reprocessed','system','new_2025_financial_import_repair',$3::jsonb)
  `, [workspaceId, stored.id, JSON.stringify(summary)]);

  await client.query(`
    insert into public.ai_independent_reviews (
      tenant_id,subject_type,subject_id,risk_tier,status,primary_run_type,reviewer_run_type,
      deterministic_checks_json,disagreements_json,human_review_required,metadata_json
    ) values (
      $1,'expense_document',$2,'critical','reviewer_unavailable',
      'deterministic_statement_repair',null,$3::jsonb,'[]'::jsonb,true,$4::jsonb
    )
  `, [workspaceId, stored.id, JSON.stringify([
    "The original source checksum and byte count were verified.",
    `${rows.length} transaction rows were parsed deterministically.`,
    "Human classification, business-purpose, tax, and property review remains required.",
  ]), JSON.stringify({
    accountType,
    classificationReviewComplete: false,
    repairedAt: new Date().toISOString(),
    repairSource: "new_2025_financial_import_repair",
  })]);
}

async function main() {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const storage = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await client.connect();
  try {
    const batches = await client.query<{
      id: string; expected_file_count: number; imported_file_count: number; reused_file_count: number;
      failed_file_count: number; status: string; item_count: string;
    }>(`
      select b.id,b.expected_file_count,b.imported_file_count,b.reused_file_count,b.failed_file_count,b.status,
        count(i.id)::text item_count
      from public.document_intelligence_import_batches b
      left join public.document_intelligence_import_batch_items i on i.tenant_id=b.tenant_id and i.batch_id=b.id
      where b.tenant_id=$1 and b.id=any($2::uuid[])
      group by b.id
    `, [workspaceId, [...cashAppBatchIds, ...creditCardBatchIds]]);
    if (batches.rowCount !== 5) throw new Error(`Expected five guarded import batches, found ${batches.rowCount}.`);
    for (const batch of batches.rows) {
      if (batch.status !== "completed" || batch.failed_file_count !== 0 || Number(batch.item_count) !== batch.expected_file_count) {
        throw new Error(`Import batch ${batch.id} is not complete and internally consistent.`);
      }
      if (batch.imported_file_count + batch.reused_file_count !== batch.expected_file_count) {
        throw new Error(`Import batch ${batch.id} counters do not reconcile.`);
      }
    }

    const cashDocuments = await client.query<StoredDocument>(`
      select distinct d.id,d.original_bucket,d.original_storage_path,d.original_file_name,d.original_mime_type,
        d.original_byte_count::text,d.content_sha256,
        (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id) child_count,
        (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id and (t.status='approved' or t.posted_expense_ref is not null)) posted_child_count
      from public.document_intelligence_import_batch_items i
      join public.document_intelligence_documents d on d.tenant_id=i.tenant_id and d.id=i.document_id
      where i.tenant_id=$1 and i.batch_id=$2
      order by d.original_file_name
    `, [workspaceId, cashAppBatchIds[1]]);
    if (cashDocuments.rowCount !== 12) throw new Error(`Expected 12 distinct Cash App documents, found ${cashDocuments.rowCount}.`);
    const months = cashDocuments.rows.map((row) => monthFromFileName(row.original_file_name));
    if (months.some((month) => !month) || new Set(months).size !== 12) throw new Error("Cash App set does not contain exactly one file for each 2025 month.");

    const creditDocuments = await client.query<StoredDocument>(`
      select d.id,d.original_bucket,d.original_storage_path,d.original_file_name,d.original_mime_type,
        d.original_byte_count::text,d.content_sha256,
        (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id) child_count,
        (select count(*)::text from public.document_intelligence_transactions t where t.tenant_id=d.tenant_id and t.document_id=d.id and (t.status='approved' or t.posted_expense_ref is not null)) posted_child_count
      from public.document_intelligence_documents d where d.tenant_id=$1 and d.id=$2
    `, [workspaceId, creditCardDocumentId]);
    if (creditDocuments.rowCount !== 1 || creditDocuments.rows[0].content_sha256.toLowerCase() !== creditCardSha256) {
      throw new Error("Credit-card source identity failed its exact guard.");
    }

    const selected = [...cashDocuments.rows, ...creditDocuments.rows];
    for (const stored of selected) {
      if (Number(stored.child_count) || Number(stored.posted_child_count)) {
        throw new Error(`${stored.original_file_name} already has child or posted transaction rows.`);
      }
    }

    const targets = await listFerocityAllocationTargets(workspaceId);
    const prepared: PreparedDocument[] = [];
    for (const stored of selected) {
      const download = await storage.storage.from(stored.original_bucket).download(stored.original_storage_path);
      if (download.error || !download.data) throw new Error(`${stored.original_file_name}: private source download failed.`);
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      if (bytes.byteLength !== Number(stored.original_byte_count)) throw new Error(`${stored.original_file_name}: byte count mismatch.`);
      if (sha256(bytes).toLowerCase() !== stored.content_sha256.toLowerCase()) throw new Error(`${stored.original_file_name}: checksum mismatch.`);

      const accountType = stored.id === creditCardDocumentId ? "credit_card" : "cash_app";
      const document = accountType === "credit_card"
        ? parseCreditCardCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
        : await extractExpenseDocument({
          workspaceId,
          fileName: stored.original_file_name,
          mimeType: stored.original_mime_type,
          fileBytes: bytes,
        });
      if (document.documentType !== "statement" || !document.statementTransactions.length) {
        throw new Error(`${stored.original_file_name}: deterministic extraction did not produce statement transactions.`);
      }
      if (accountType === "cash_app") {
        if (document.extractionMethod !== "deterministic_cash_app") throw new Error(`${stored.original_file_name}: Cash App deterministic parser was not used.`);
        const expectedMonth = monthFromFileName(stored.original_file_name);
        const actualMonths = new Set(document.statementTransactions.map((row) => row.transactionDate?.slice(0, 7)));
        const expectedMonthNumber = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(expectedMonth ?? "") + 1;
        if (actualMonths.size !== 1 || !actualMonths.has(`2025-${String(expectedMonthNumber).padStart(2, "0")}`)) {
          throw new Error(`${stored.original_file_name}: transaction month does not match its filename.`);
        }
        const statementSummary = document.statementSummary;
        const externallyFundedRows = document.statementTransactions.filter((row) => row.direction === "debit"
          && /\bfrom\s+(?:(?:mastercard|visa)\s+debit|credit\s+card\s+credit)\b/i.test(row.description));
        const externallyFundedDebits = externallyFundedRows.reduce((sum, row) => sum + row.amountCents, 0);
        const externallyFundedFees = externallyFundedRows.reduce((sum, row) => sum + (row.feeCents ?? 0), 0);
        const adjustedMoneyOutDifference = statementSummary?.moneyOutCents === null || statementSummary?.moneyOutCents === undefined
          ? null
          : statementSummary.parsedDebitCents - externallyFundedDebits - statementSummary.moneyOutCents;
        const adjustedFeeDifference = statementSummary?.feeCents === null || statementSummary?.feeCents === undefined
          ? null
          : statementSummary.parsedFeeCents - externallyFundedFees - statementSummary.feeCents;
        if (!statementSummary
          || statementSummary.differences.moneyInCents !== 0
          || adjustedFeeDifference !== 0
          || adjustedMoneyOutDifference !== 0) {
          throw new Error(`${stored.original_file_name}: parsed totals do not reconcile to the statement summary.`);
        }
        if (document.sourceCoverage && (document.sourceCoverage.failedPages.length || document.sourceCoverage.omittedPages.length)) {
          throw new Error(`${stored.original_file_name}: page coverage is incomplete.`);
        }
      }
      const rows = transactionRows(document, targets);
      if (new Set(rows.map((row) => row.source_key)).size !== rows.length) throw new Error(`${stored.original_file_name}: source keys are not unique.`);
      const summary = {
        fileName: stored.original_file_name,
        accountType,
        contentSha256: stored.content_sha256,
        transactions: rows.length,
        debits: rows.filter((row) => row.direction === "debit").length,
        credits: rows.filter((row) => row.direction === "credit").length,
        transfers: rows.filter((row) => row.is_transfer).length,
        debitTotalCents: rows.filter((row) => row.direction === "debit").reduce((sum, row) => sum + Number(row.amount_cents), 0),
        creditTotalCents: rows.filter((row) => row.direction === "credit").reduce((sum, row) => sum + Number(row.amount_cents), 0),
        firstDate: rows.map((row) => String(row.transaction_date)).sort()[0],
        lastDate: rows.map((row) => String(row.transaction_date)).sort().at(-1),
      };
      prepared.push({ stored, document, rows, summary, accountType });
    }

    if (apply) {
      await client.query("begin");
      try {
        const cashProjectId = await ensureProject(client, cashProjectName, {
          accountOwner: "Andrew Burton",
          sourceType: "cash_app",
          statementYear: 2025,
          separateFromOtherAccounts: true,
        });
        const creditProjectId = await ensureProject(client, creditProjectName, {
          sourceType: "credit_card_csv",
          statementYear: 2025,
          separateFromCashApp: true,
          sourceCoverage: "2025-03-14 through 2025-12-31",
        });
        await client.query(`update public.document_intelligence_import_batches set project_id=$3,updated_at=now() where tenant_id=$1 and id=any($2::uuid[])`, [workspaceId, cashAppBatchIds, cashProjectId]);
        await client.query(`update public.document_intelligence_import_batches set project_id=$3,updated_at=now() where tenant_id=$1 and id=any($2::uuid[])`, [workspaceId, creditCardBatchIds, creditProjectId]);
        for (const item of prepared) await replaceFailedExtraction(client, item);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const cash = prepared.filter((item) => item.accountType === "cash_app");
    const credit = prepared.filter((item) => item.accountType === "credit_card");
    const summarize = (items: PreparedDocument[]) => ({
      documents: items.length,
      transactions: items.reduce((sum, item) => sum + item.rows.length, 0),
      debits: items.reduce((sum, item) => sum + Number(item.summary.debits), 0),
      credits: items.reduce((sum, item) => sum + Number(item.summary.credits), 0),
      transfers: items.reduce((sum, item) => sum + Number(item.summary.transfers), 0),
      debitTotalCents: items.reduce((sum, item) => sum + Number(item.summary.debitTotalCents), 0),
      creditTotalCents: items.reduce((sum, item) => sum + Number(item.summary.creditTotalCents), 0),
      firstDate: items.flatMap((item) => [String(item.summary.firstDate)]).sort()[0],
      lastDate: items.flatMap((item) => [String(item.summary.lastDate)]).sort().at(-1),
    });
    console.log(JSON.stringify({
      mode: apply ? "applied" : "dry_run",
      workspaceId,
      projects: [cashProjectName, creditProjectName],
      cashApp: summarize(cash),
      creditCard: summarize(credit),
      documents: prepared.map((item) => item.summary),
      originalsChanged: false,
      expensesPosted: false,
      taxTreatmentApproved: false,
      propertyAssignmentsApproved: false,
    }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "New 2025 financial import repair failed.");
  process.exit(1);
});
