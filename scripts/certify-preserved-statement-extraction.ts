import { createClient } from "@supabase/supabase-js";
import { queryPostgres } from "../src/lib/db/postgres";
import { extractExpenseDocument } from "../src/lib/document-intelligence/extract";
import { compareDocumentExtractions, hasUsableDocumentExtraction } from "../src/lib/document-intelligence/independent-review";

type SourceDocument = {
  tenant_id: string;
  original_bucket: string;
  original_storage_path: string;
  original_file_name: string;
  original_byte_count: number;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for statement extraction certification.`);
  return value;
}

function summary(document: Awaited<ReturnType<typeof extractExpenseDocument>>) {
  const transactions = document.statementTransactions;
  const dates = transactions.map((row) => row.transactionDate).filter((value): value is string => Boolean(value)).sort();
  return {
    documentType: document.documentType,
    usable: hasUsableDocumentExtraction(document),
    confidence: document.overallConfidence,
    transactionCount: transactions.length,
    debitCount: transactions.filter((row) => row.direction === "debit").length,
    creditCount: transactions.filter((row) => row.direction === "credit").length,
    transferCount: transactions.filter((row) => row.isTransfer).length,
    debitTotalCents: transactions.filter((row) => row.direction === "debit").reduce((sum, row) => sum + row.amountCents, 0),
    creditTotalCents: transactions.filter((row) => row.direction === "credit").reduce((sum, row) => sum + row.amountCents, 0),
    firstTransactionDate: dates[0] ?? null,
    lastTransactionDate: dates.at(-1) ?? null,
    reviewReasons: document.reviewReasons,
  };
}

async function main() {
  const result = await queryPostgres<SourceDocument>(`
    select d.tenant_id, d.original_bucket, d.original_storage_path, d.original_file_name, d.original_byte_count
    from public.document_intelligence_documents d
    join public.tenants t on t.id = d.tenant_id
    where d.original_mime_type = 'application/pdf'
      and d.original_file_name = 'December 2025.pdf'
      and t.name ilike '%h4r%'
    order by d.created_at desc
    limit 1
  `);
  const source = result?.rows[0];
  if (!source) throw new Error("The preserved December 2025 H4R PDF was not found.");

  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const download = await supabase.storage.from(source.original_bucket).download(source.original_storage_path);
  if (download.error || !download.data) throw new Error(`Statement download failed: ${download.error?.message ?? "empty response"}`);
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  if (bytes.byteLength !== Number(source.original_byte_count)) throw new Error("Statement byte count no longer matches preserved metadata.");

  const file = new File([bytes], source.original_file_name, { type: "application/pdf" });
  const primary = await extractExpenseDocument({
    workspaceId: source.tenant_id,
    fileName: source.original_file_name,
    mimeType: file.type,
    fileBytes: bytes,
  });
  const reviewer = await extractExpenseDocument({
    workspaceId: source.tenant_id,
    fileName: source.original_file_name,
    mimeType: file.type,
    fileBytes: bytes,
    reviewPass: true,
  });
  const review = compareDocumentExtractions(primary, reviewer);

  console.log(JSON.stringify({
    status: review.status === "passed" ? "passed" : "needs_review",
    fileName: source.original_file_name,
    primary: summary(primary),
    reviewer: summary(reviewer),
    independentReview: review,
    storedDocumentMutated: false,
    expensesPosted: false,
  }, null, 2));
  await new Promise((resolve) => setTimeout(resolve, 250));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Statement extraction certification failed.");
  process.exit(1);
});
