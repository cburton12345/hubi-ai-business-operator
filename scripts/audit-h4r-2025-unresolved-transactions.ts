import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const context = await client.query(`select external_workspace_id,source_generated_at,
          jsonb_object_keys(domain_state_json) as domain_key,domain_state_json
        from public.companion_product_context_snapshots
        where tenant_id=$1 and product_key='h4r' and status='captured'
        order by source_generated_at desc limit 20`, [tenantId]);
    const categories = await client.query(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=$1 and b.project_id=$2)
        select coalesce(nullif(t.suggested_category,''),'uncategorized') category,count(*)::int rows,sum(t.amount_cents)::bigint amount_cents
        from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
        where t.direction='debit' and not t.is_transfer group by 1 order by amount_cents desc`, [tenantId, projectId]);
    const unresolved = await client.query(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=$1 and b.project_id=$2)
        select regexp_replace(lower(t.description),'[0-9#*]+','','g') description_pattern,
          count(*)::int rows,sum(t.amount_cents)::bigint amount_cents,
          array_agg(distinct t.description order by t.description) filter (where t.description is not null) examples
        from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
        where t.direction='debit' and not t.is_transfer and coalesce(nullif(t.suggested_category,''),'uncategorized')='uncategorized'
        group by 1 order by rows desc,amount_cents desc limit 250`, [tenantId, projectId]);
    const locations = await client.query(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=$1 and b.project_id=$2)
        select upper((regexp_match(t.description,'\\s([A-Za-z .''-]+)\\s([A-Z]{2})$'))[1]) city,
          upper((regexp_match(t.description,'\\s([A-Za-z .''-]+)\\s([A-Z]{2})$'))[2]) state,
          count(*)::int rows,sum(t.amount_cents)::bigint amount_cents
        from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
        where t.direction='debit' and not t.is_transfer and t.description ~ '\\s[A-Z]{2}(?: Cash App Card(?: \\(pending\\))?)?$'
        group by 1,2 order by rows desc limit 100`, [tenantId, projectId]);
    const pending = await client.query(`with docs as (select distinct bi.document_id from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=$1 and b.project_id=$2), scoped as (
          select t.* from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
        )
        select count(*)::int pending_rows,coalesce(sum(amount_cents),0)::bigint pending_cents,
          count(*) filter (where exists (select 1 from scoped c where c.id<>p.id
            and c.document_id=p.document_id and c.transaction_date=p.transaction_date and c.direction=p.direction
            and c.amount_cents=p.amount_cents and coalesce(c.metadata_json->>'providerStatus','completed')<>'pending'
            and regexp_replace(lower(c.description),'\\s*\\(pending\\)\\s*$','','i')=regexp_replace(lower(p.description),'\\s*\\(pending\\)\\s*$','','i')))::int matched_completed_duplicates
        from scoped p where coalesce(p.metadata_json->>'providerStatus','completed')='pending'`, [tenantId, projectId]);
    const latestContext = context.rows[0] ?? null;
    console.log(JSON.stringify({
      companionContext: latestContext ? {
        externalWorkspaceId: latestContext.external_workspace_id,
        generatedAt: latestContext.source_generated_at,
        domainKeys: [...new Set(context.rows.map((row) => row.domain_key))],
        domainState: latestContext.domain_state_json,
      } : null,
      categories: categories.rows,
      pending: pending.rows[0],
      topUnresolvedPatterns: unresolved.rows,
      topPurchaseLocations: locations.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
