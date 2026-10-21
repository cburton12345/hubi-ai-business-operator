import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectName = "H4R 2025 tax documents";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const project = await client.query<{ id: string; tax_year: number }>(`
      select id,tax_year from public.document_intelligence_projects
      where tenant_id=$1 and name=$2 and status='active'`, [tenantId, projectName]);
    assert(project.rowCount === 1, "Expected one active H4R 2025 document project.");
    assert(Number(project.rows[0].tax_year) === 2025, "The project tax year is not 2025.");

    const projectId = project.rows[0].id;
    const batches = await client.query<{
      id: string; status: string; expected_file_count: number; imported_file_count: number;
      reused_file_count: number; failed_file_count: number; item_count: number; unresolved_count: number;
    }>(`
      select b.id,b.status,b.expected_file_count,b.imported_file_count,b.reused_file_count,b.failed_file_count,
        count(bi.id)::int as item_count,
        count(*) filter (where bi.id is null or bi.outcome='processing')::int as unresolved_count
      from public.document_intelligence_import_batches b
      left join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      where b.tenant_id=$1 and b.project_id=$2
      group by b.id order by b.created_at`, [tenantId, projectId]);
    assert(batches.rowCount === 2, "Expected exactly two historical upload batches.");
    assert(batches.rows.every((row) => row.status === "completed"), "Every project batch must be completed.");
    assert(batches.rows.every((row) => Number(row.unresolved_count) === 0), "A project batch has unresolved files.");
    assert(batches.rows.every((row) => Number(row.failed_file_count) === 0), "A project batch contains failed files.");
    assert(batches.rows.every((row) => Number(row.item_count) === Number(row.expected_file_count)), "A batch item count does not match its selected-file count.");

    const evidence = await client.query<{
      document_count: number; distinct_hashes: number; month_count: number; transaction_count: number;
      expense_count: number; deposit_count: number; transfer_count: number; failed_documents: number;
    }>(`
      with scoped_documents as (
        select distinct d.id,d.content_sha256,d.document_date,d.status
        from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ), scoped_transactions as (
        select t.* from public.document_intelligence_transactions t
        join scoped_documents d on d.id=t.document_id
      )
      select
        (select count(*)::int from scoped_documents) as document_count,
        (select count(distinct content_sha256)::int from scoped_documents) as distinct_hashes,
        (select count(distinct extract(month from document_date))::int from scoped_documents where extract(year from document_date)=2025) as month_count,
        (select count(*)::int from scoped_transactions) as transaction_count,
        (select count(*)::int from scoped_transactions where direction='debit' and is_transfer=false) as expense_count,
        (select count(*)::int from scoped_transactions where direction='credit' and is_transfer=false) as deposit_count,
        (select count(*)::int from scoped_transactions where is_transfer=true) as transfer_count,
        (select count(*)::int from scoped_documents where status in ('failed','rejected')) as failed_documents`,
    [tenantId, projectId]);
    const facts = evidence.rows[0];
    assert(Number(facts.document_count) === 12, "Expected exactly twelve preserved statement documents.");
    assert(Number(facts.distinct_hashes) === 12, "The project contains duplicate or missing source hashes.");
    assert(Number(facts.month_count) === 12, "The project does not cover all twelve months of 2025.");
    assert(Number(facts.failed_documents) === 0, "The project contains a failed or rejected document.");
    assert(Number(facts.transaction_count) > 0, "No statement transactions were preserved.");
    assert(Number(facts.expense_count) > 0, "No non-transfer expense candidates were preserved.");
    assert(Number(facts.deposit_count) > 0, "No non-transfer deposits were preserved.");

    console.log(JSON.stringify({
      ok: true,
      project: { id: projectId, name: projectName, taxYear: 2025 },
      batches: batches.rows.map((row) => ({
        id: row.id,
        status: row.status,
        selectedFiles: Number(row.expected_file_count),
        recordedItems: Number(row.item_count),
        unresolvedFiles: Number(row.unresolved_count),
        failedFiles: Number(row.failed_file_count),
      })),
      evidence: {
        preservedDocuments: Number(facts.document_count),
        distinctSourceHashes: Number(facts.distinct_hashes),
        representedMonths: Number(facts.month_count),
        statementTransactions: Number(facts.transaction_count),
        expenseCandidates: Number(facts.expense_count),
        deposits: Number(facts.deposit_count),
        transfersSeparated: Number(facts.transfer_count),
      },
      mutationsPerformed: false,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "H4R 2025 project certification failed.");
  process.exit(1);
});
