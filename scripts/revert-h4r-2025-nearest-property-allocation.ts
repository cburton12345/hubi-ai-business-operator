import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const allocationVersion = "h4r_2025_nearest_property_v1";
const invalidReportVersion = "h4r_2025_tax_preparer_workpaper_v9";
const invalidDeliveryId = "01a121e8-5db2-7f0e-81b2-892d08955bb7";
const expected = { rows: 1762, cents: 8405279 };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const owner = await client.query(`select 1 from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id
      where lower(u.email)=lower($2) and tu.status='active' and tu.role in ('owner','admin')
        and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected H4R owner/workspace binding was not found.");

    const project = await client.query<{ latest: Record<string, unknown> | null }>(`select metadata_json->'latestReviewedReport' latest
      from public.document_intelligence_projects where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' for update`, [tenantId, projectId]);
    if (project.rowCount !== 1) throw new Error("Expected one active H4R 2025 document project.");
    const latest = project.rows[0].latest;
    if (latest?.version !== invalidReportVersion || latest?.deliveredEmailMessageId !== invalidDeliveryId) {
      throw new Error("Latest report no longer matches the exact property allocation being invalidated.");
    }

    const before = await client.query<{ rows: number; cents: string }>(`with docs as (
        select distinct bi.document_id from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ) select count(*)::int rows,coalesce(sum(t.amount_cents),0)::bigint::text cents
      from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
      where t.direction='debit' and not t.is_transfer
        and t.metadata_json->'h4r2025NearestPropertyAllocation'->>'version'=$3`, [tenantId, projectId, allocationVersion]);
    if (before.rows[0]?.rows !== expected.rows || Number(before.rows[0]?.cents) !== expected.cents) {
      throw new Error(`Allocation source guard failed: ${JSON.stringify(before.rows[0] ?? null)}.`);
    }

    const cleared = await client.query(`with docs as (
        select distinct bi.document_id from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ) update public.document_intelligence_transactions t
      set allocation_target_type=null,allocation_target_ref=null,allocation_target_label=null,
        allocation_confidence=null,allocation_rationale=null,
        metadata_json=t.metadata_json-'h4r2025NearestPropertyAllocation',updated_at=now()
      from docs d where t.document_id=d.document_id and t.tenant_id=$1
        and t.direction='debit' and not t.is_transfer
        and t.metadata_json->'h4r2025NearestPropertyAllocation'->>'version'=$3`, [tenantId, projectId, allocationVersion]);
    if (cleared.rowCount !== expected.rows) throw new Error(`Expected ${expected.rows} cleared allocations; received ${cleared.rowCount}.`);

    const invalidation = {
      status: "invalidated",
      invalidatedAt: new Date().toISOString(),
      reportUsableForTax: false,
      propertyAllocationUsableForTax: false,
      invalidationReason: "The forced proximity allocation used current H4R properties as 2025 tax truth and concentrated expenses into unconfirmed properties. It is not a defensible property expense schedule.",
      validScopeRemaining: "Original statement transactions, source files, classifications, and review evidence remain preserved. Property assignments were removed and require a verified 2025 property roster and supportable allocation method.",
    };
    const updated = await client.query<{ latest: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=jsonb_set(metadata_json,'{latestReviewedReport}',
        (metadata_json->'latestReviewedReport') || $3::jsonb,true),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active'
      returning metadata_json->'latestReviewedReport' latest`, [tenantId, projectId, JSON.stringify(invalidation)]);
    if (updated.rowCount !== 1 || updated.rows[0].latest?.status !== "invalidated"
      || updated.rows[0].latest?.propertyAllocationUsableForTax !== false) {
      throw new Error("Post-write report invalidation failed.");
    }

    const after = await client.query<{ remaining: number; targeted: number }>(`with docs as (
        select distinct bi.document_id from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ) select count(*) filter(where t.metadata_json->'h4r2025NearestPropertyAllocation'->>'version'=$3)::int remaining,
        count(*) filter(where t.allocation_target_ref is not null)::int targeted
      from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
      where t.direction='debit' and not t.is_transfer`, [tenantId, projectId, allocationVersion]);
    if (after.rows[0]?.remaining !== 0 || after.rows[0]?.targeted !== 0) {
      throw new Error(`Post-write allocation cleanup failed: ${JSON.stringify(after.rows[0] ?? null)}.`);
    }

    await client.query("commit");
    console.log(JSON.stringify({ ok: true, tenantId, projectId, clearedAllocations: cleared.rowCount,
      invalidReportVersion, invalidDeliveryId, status: "invalidated" }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
