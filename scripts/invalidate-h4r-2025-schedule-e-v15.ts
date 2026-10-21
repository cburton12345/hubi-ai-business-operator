import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const version = "h4r_2025_schedule_e_preparer_workpaper_v15";
const deliveryId = "01a12386-9946-7d86-9eb1-286e559f3f38";

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
    const current = await client.query<{ latest: Record<string, unknown> | null }>(`select metadata_json->'latestReviewedReport' latest
      from public.document_intelligence_projects where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' for update`, [tenantId, projectId]);
    const latest = current.rows[0]?.latest;
    if (current.rowCount !== 1 || latest?.version !== version || latest?.deliveredEmailMessageId !== deliveryId) {
      throw new Error("Current v15 manifest guard failed; refusing to change unexpected state.");
    }
    const invalidated = {
      ...latest,
      ownerApproved: false,
      status: "invalidated_owner_review_draft",
      reportUsableForTax: false,
      propertyScheduleUsableForTax: false,
      bookkeepingWorkpaperUsableForPreparerReview: false,
      invalidatedAt: new Date().toISOString(),
      invalidationReason: "Owner review rejected the income-weighted shared-expense method because it made property expenses track rents too closely. Do not use or present this packet as final tax work.",
    };
    const updated = await client.query<{ metadata_json: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=metadata_json || jsonb_build_object('latestReviewedReport',$3::jsonb),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' returning metadata_json`, [tenantId, projectId, JSON.stringify(invalidated)]);
    const stored = updated.rows[0]?.metadata_json?.latestReviewedReport as { version?: string; status?: string; ownerApproved?: boolean } | undefined;
    if (stored?.version !== version || stored.status !== "invalidated_owner_review_draft" || stored.ownerApproved !== false) {
      throw new Error("Stored invalidation verification failed.");
    }
    await client.query("commit");
    console.log(JSON.stringify({ ok: true, tenantId, projectId, version, status: stored.status, ownerApproved: stored.ownerApproved }, null, 2));
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
