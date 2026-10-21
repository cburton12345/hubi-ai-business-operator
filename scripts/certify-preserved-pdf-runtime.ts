import { createClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
import { queryPostgres } from "../src/lib/db/postgres";
import { parseCashAppStatementPages } from "../src/lib/document-intelligence/cash-app-statement";

type SourceDocument = {
  id: string;
  original_bucket: string;
  original_storage_path: string;
  original_file_name: string;
  original_byte_count: number;
  tenant_name: string;
};

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the read-only preserved-PDF certification.`);
  return value;
}

async function main() {
const result = await queryPostgres<SourceDocument>(`
  select d.id, d.original_bucket, d.original_storage_path, d.original_file_name,
    d.original_byte_count, t.name as tenant_name
  from public.document_intelligence_documents d
  join public.tenants t on t.id = d.tenant_id
  where d.original_mime_type = 'application/pdf'
    and d.original_file_name ~* '2025'
  order by case when t.name ilike '%h4r%' then 0 else 1 end, d.created_at desc
  limit 24
`);
const sources = result?.rows ?? [];
if (!sources.length) throw new Error("No preserved 2025 PDF was found. The certification made no changes.");

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const documents = [];
for (const source of sources) {
  const download = await supabase.storage.from(source.original_bucket).download(source.original_storage_path);
  if (download.error || !download.data) {
    throw new Error(`${source.original_file_name} could not be downloaded: ${download.error?.message ?? "empty response"}`);
  }

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const expectedByteCount = Number(source.original_byte_count);
  if (expectedByteCount > 0 && bytes.byteLength !== expectedByteCount) {
    throw new Error(`${source.original_file_name} downloaded as ${bytes.byteLength} bytes but preserved metadata says ${expectedByteCount}.`);
  }
  const extracted = await extractText(Uint8Array.from(bytes), { mergePages: false });
  const parsedStatement = parseCashAppStatementPages(extracted.text);
  const pageCharacterCounts = extracted.text.map((text) => text.trim().length);
  const readablePages = pageCharacterCounts.filter((characters) => characters >= 60).length;
  if (extracted.totalPages < 1 || pageCharacterCounts.length !== extracted.totalPages || readablePages < 1) {
    throw new Error(`${source.original_file_name} coverage failed: ${extracted.totalPages} total page(s), ${pageCharacterCounts.length} returned page(s), ${readablePages} readable page(s).`);
  }
  if (!parsedStatement) throw new Error(`${source.original_file_name} was readable but did not match the deterministic Cash App statement contract.`);
  documents.push({
    workspace: source.tenant_name,
    fileName: source.original_file_name,
    byteCount: bytes.byteLength,
    totalPages: extracted.totalPages,
    returnedPages: pageCharacterCounts.length,
    readablePages,
    totalExtractedCharacters: pageCharacterCounts.reduce((sum, characters) => sum + characters, 0),
    pageCharacterCounts,
    transactionCount: parsedStatement.statementTransactions.length,
    debitCount: parsedStatement.statementTransactions.filter((row) => row.direction === "debit").length,
    creditCount: parsedStatement.statementTransactions.filter((row) => row.direction === "credit").length,
    transferCount: parsedStatement.statementTransactions.filter((row) => row.isTransfer).length,
    debitTotalCents: parsedStatement.statementSummary?.parsedDebitCents ?? 0,
    creditTotalCents: parsedStatement.statementSummary?.parsedCreditCents ?? 0,
    statementSummaryDifferences: parsedStatement.statementSummary?.differences ?? null,
    reconciled: parsedStatement.reviewReasons.length === 0,
  });
}

console.log(JSON.stringify({
  status: "passed",
  documentCount: documents.length,
  totalPages: documents.reduce((sum, document) => sum + document.totalPages, 0),
  readablePages: documents.reduce((sum, document) => sum + document.readablePages, 0),
  documents,
  mutationPerformed: false,
  aiCallPerformed: false,
}, null, 2));

await new Promise((resolve) => setTimeout(resolve, 250));
process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Preserved-PDF certification failed.");
  process.exit(1);
});
