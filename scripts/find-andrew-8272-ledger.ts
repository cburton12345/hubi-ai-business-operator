import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is required.");

async function main() {
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(`
    select distinct p.id::text as project_id,p.name as project_name,p.tax_year,
      d.id::text as document_id,d.original_file_name,t.transaction_date::text,
      t.description,t.direction,t.amount_cents,t.is_transfer
    from public.document_intelligence_transactions t
    join public.document_intelligence_documents d on d.id=t.document_id and d.tenant_id=t.tenant_id
    join public.document_intelligence_import_batch_items bi on bi.document_id=d.id and bi.tenant_id=d.tenant_id
    join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
    join public.document_intelligence_projects p on p.id=b.project_id and p.tenant_id=b.tenant_id
    where t.tenant_id=$1 and (
      t.description ilike '%8272%' or coalesce(t.metadata_json::text,'') ilike '%8272%'
    )
    order by 2,6,7
  `, [tenantId]);
  console.log(JSON.stringify(result.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) })), null, 2));
} finally {
  await client.end();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
