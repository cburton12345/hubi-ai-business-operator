import pg from "pg";

const apply = process.argv.includes("--apply");
const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectName = "H4R 2025 tax documents";
const firstBatchNames = [
  "January 2025.pdf", "February 2025.pdf", "March 2025.pdf", "April 2025.pdf",
  "June 2025.pdf", "July 2025.pdf", "August 2025.pdf", "September 2025.pdf",
  "October 2025.pdf", "November 2025.pdf", "December 2025.pdf",
];
const mayBatchNames = ["May 2025.pdf"];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`
      select t.id from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1 and tu.status='active' and tu.role in ('owner','admin')
      join public.tenants t on t.id=tu.tenant_id and t.slug='h4r' and t.status='active'
      where lower(u.email)='burtonchristopher125@gmail.com'`, [tenantId]);
    if (owner.rowCount !== 1) throw new Error("The expected H4R owner/workspace mapping is unavailable.");
    const expectedNames = [...firstBatchNames, ...mayBatchNames];
    const documents = await client.query<{ id: string; original_file_name: string; status: string }>(`
      select id,original_file_name,status from public.document_intelligence_documents
      where tenant_id=$1 and original_file_name=any($2::text[])
      order by original_file_name`, [tenantId, expectedNames]);
    if (documents.rowCount !== 12 || new Set(documents.rows.map((row) => row.original_file_name)).size !== 12) {
      throw new Error("Expected exactly twelve distinct preserved 2025 PDF records.");
    }
    if (documents.rows.some((row) => row.status === "failed" || row.status === "rejected")) {
      throw new Error("A preserved statement is failed or rejected; refusing project backfill.");
    }
    const plan = {
      projectName,
      taxYear: 2025,
      batches: [
        { key: "h4r-2025-original-11", label: "Original 2025 Cash App statements", files: firstBatchNames },
        { key: "h4r-2025-may-follow-up", label: "May 2025 follow-up statement", files: mayBatchNames },
      ],
      documentsChanged: false,
      expensesPosted: false,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: "dry_run", ...plan }, null, 2));
      return;
    }
    await client.query("begin");
    try {
      const project = await client.query<{ id: string }>(`
        insert into public.document_intelligence_projects (tenant_id,name,project_type,tax_year,metadata_json)
        values ($1,$2,'tax_year',2025,$3::jsonb)
        on conflict (tenant_id,name) do update set tax_year=2025,updated_at=now()
        returning id`, [tenantId, projectName, JSON.stringify({ source: "h4r_2025_statement_backfill" })]);
      const projectId = project.rows[0].id;
      for (const batchPlan of plan.batches) {
        const existing = await client.query<{ id: string }>(`
          select id from public.document_intelligence_import_batches
          where tenant_id=$1 and metadata_json->>'backfillKey'=$2`, [tenantId, batchPlan.key]);
        const batchId = existing.rows[0]?.id ?? (await client.query<{ id: string }>(`
          insert into public.document_intelligence_import_batches (
            tenant_id,project_id,label,source_channel,status,expected_file_count,
            imported_file_count,reused_file_count,failed_file_count,completed_at,metadata_json
          ) values ($1,$2,$3,'upload','completed',$4,$4,0,0,now(),$5::jsonb)
          returning id`, [
            tenantId, projectId, batchPlan.label, batchPlan.files.length,
            JSON.stringify({ backfillKey: batchPlan.key, source: "preserved_statement_repair" }),
          ])).rows[0].id;
        await client.query(`
          update public.document_intelligence_import_batches set
            project_id=$3,label=$4,status='completed',expected_file_count=$5,
            imported_file_count=$5,reused_file_count=0,failed_file_count=0,
            completed_at=coalesce(completed_at,now()),updated_at=now()
          where tenant_id=$1 and id=$2`, [tenantId, batchId, projectId, batchPlan.label, batchPlan.files.length]);
        for (const [fileIndex, fileName] of batchPlan.files.entries()) {
          const document = documents.rows.find((row) => row.original_file_name === fileName);
          if (!document) throw new Error(`Missing document during apply: ${fileName}`);
          await client.query(`
            insert into public.document_intelligence_import_batch_items (
              tenant_id,batch_id,file_index,file_name,document_id,outcome,metadata_json
            ) values ($1,$2,$3,$4,$5,'imported',$6::jsonb)
            on conflict (batch_id,file_index) do update set
              file_name=excluded.file_name,document_id=excluded.document_id,outcome='imported',
              error_message=null,metadata_json=excluded.metadata_json,updated_at=now()`, [
                tenantId, batchId, fileIndex, fileName, document.id,
                JSON.stringify({ source: "preserved_statement_repair" }),
              ]);
        }
      }
      await client.query("commit");
      console.log(JSON.stringify({ mode: "applied", ...plan, projectId }, null, 2));
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "H4R document project backfill failed.");
  process.exit(1);
});
