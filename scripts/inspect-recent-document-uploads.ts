import pg from "pg";

async function main() {
  const tenantId = process.argv[2]?.trim();
  if (!tenantId) throw new Error("Provide a tenant id.");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const columns = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='document_intelligence_documents'
       order by ordinal_position`,
    );
    const recentDocuments = await client.query(
      `select id::text, original_file_name, original_mime_type, original_byte_count,
          status, document_type, purpose, source_channel, processing_error,
          created_at::text, updated_at::text,
          jsonb_array_length(coalesce(review_reasons_json,'[]'::jsonb)) as review_reason_count
       from public.document_intelligence_documents
       where tenant_id=$1 and created_at >= now() - interval '24 hours'
       order by created_at desc
       limit 100`,
      [tenantId],
    );
    const relatedTables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name like 'document_intelligence%'
       order by table_name`,
    );
    const relatedColumns = await client.query<{ table_name: string; column_name: string }>(
      `select table_name,column_name from information_schema.columns
       where table_schema='public' and table_name in (
         'document_intelligence_events','document_intelligence_import_batches','document_intelligence_import_batch_items'
       ) order by table_name,ordinal_position`,
    );
    const recentBatches = await client.query(
      `select b.id::text,b.label,b.source_channel,b.status,b.expected_file_count,
          b.imported_file_count,b.reused_file_count,b.failed_file_count,
          b.created_at::text,b.updated_at::text,b.completed_at::text,
          p.name as project_name
       from public.document_intelligence_import_batches b
       left join public.document_intelligence_projects p on p.tenant_id=b.tenant_id and p.id=b.project_id
       where b.tenant_id=$1 and b.created_at >= now() - interval '24 hours'
       order by b.created_at desc limit 50`,
      [tenantId],
    );
    const recentItems = await client.query(
      `select i.batch_id::text,i.file_index,i.file_name,i.mime_type,i.byte_count,
          i.document_id::text,i.outcome,i.error_message,i.created_at::text,i.updated_at::text
       from public.document_intelligence_import_batch_items i
       where i.tenant_id=$1 and i.created_at >= now() - interval '24 hours'
       order by i.created_at desc limit 200`,
      [tenantId],
    );
    const recentEvents = await client.query(
      `select e.document_id::text,e.event_type,e.actor_type,e.created_at::text
       from public.document_intelligence_events e
       where e.tenant_id=$1 and e.created_at >= now() - interval '2 hours'
       order by e.created_at desc limit 100`,
      [tenantId],
    );
    console.log(JSON.stringify({
      documentColumns: columns.rows.map((row) => row.column_name),
      relatedTables: relatedTables.rows.map((row) => row.table_name),
      relatedColumns: relatedColumns.rows,
      recentDocuments: recentDocuments.rows,
      recentBatches: recentBatches.rows,
      recentItems: recentItems.rows,
      recentEvents: recentEvents.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
