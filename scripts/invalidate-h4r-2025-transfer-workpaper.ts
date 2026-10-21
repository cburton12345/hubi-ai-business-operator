import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const invalidVersion = "h4r_2025_tax_workpaper_v5";
const invalidDeliveryId = "01a121ba-7c16-71c7-8120-d9f0f73f9bb0";

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
    if (latest?.version !== invalidVersion || latest?.deliveredEmailMessageId !== invalidDeliveryId) {
      throw new Error("Latest report no longer matches the exact transfer workpaper being invalidated.");
    }
    const invalidation = {
      status: "invalidated",
      invalidatedAt: new Date().toISOString(),
      transferAllocationUsableForTax: false,
      invalidationReason: "Current-tenant name matches do not establish 2025 tenancy, rent purpose, or property attribution. The bank-transfer allocation must not be used for tax reporting.",
      validScopeRemaining: "The separately reconciled expense schedule remains a bookkeeping review artifact; tax deductibility still requires source/purpose review.",
    };
    const updated = await client.query<{ latest: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=jsonb_set(metadata_json,'{latestReviewedReport}',
        (metadata_json->'latestReviewedReport') || $3::jsonb,true),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active'
      returning metadata_json->'latestReviewedReport' latest`, [tenantId, projectId, JSON.stringify(invalidation)]);
    if (updated.rowCount !== 1 || updated.rows[0].latest?.status !== "invalidated"
      || updated.rows[0].latest?.transferAllocationUsableForTax !== false) {
      throw new Error("Post-write invalidation certification failed.");
    }
    await client.query("commit");
    console.log(JSON.stringify({ ok: true, tenantId, projectId, invalidVersion, invalidDeliveryId, status: "invalidated" }, null, 2));
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
