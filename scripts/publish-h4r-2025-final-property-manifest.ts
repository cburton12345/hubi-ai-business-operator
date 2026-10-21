import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const reportVersion = "h4r_2025_final_property_workpaper_v11";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const deliveredEmailMessageId = process.argv[3]?.trim();
  if (!directory || !deliveredEmailMessageId) throw new Error("Provide the verified report directory and delivered email message ID.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-final-property-workpaper.json"), "utf8")) as {
    version: string;
    sourceGuard: Record<string, number>;
    totals: Record<string, number>;
    propertyTotals: Array<{ propertyName: string; allocatedIncomeCents: number }>;
    transactionControls: Array<{ sourceAmountCents: number; allocatedCents: number }>;
  };
  if (report.version !== reportVersion || report.sourceGuard.expenseRows !== 1762
    || report.sourceGuard.activeIncomeProperties !== 13 || report.totals.allocatedIncomeCents !== 7168400
    || report.totals.allocatedExpenseCents !== 8405279
    || Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents)) > 1200000
    || report.propertyTotals.some((row) => /dells|elk mound/i.test(row.propertyName))
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)) throw new Error("Manifest source guard failed.");
  const fileNames = [
    "H4R-2025-final-property-workpaper.json",
    "H4R-2025-final-one-page-property-summary.pdf",
    "H4R-2025-final-property-workpaper.xlsx",
    "H4R-2025-final-property-summary.csv",
    "H4R-2025-final-property-expense-detail.csv",
    "H4R-2025-final-transaction-reconciliation.csv",
  ];
  const files = [];
  for (const fileName of fileNames) {
    const bytes = await readFile(path.join(directory, fileName));
    files.push({ fileName, byteCount: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const projectQuery = `project=${encodeURIComponent(projectId)}`;
  const manifest = {
    version: reportVersion,
    generatedAt: new Date().toISOString(),
    taxYear: 2025,
    reportUsableForTax: false,
    propertyAllocationUsableForTax: false,
    bookkeepingWorkpaperUsableForPreparerReview: true,
    sourceGuard: report.sourceGuard,
    totals: report.totals,
    workspaceLinks: {
      project: `/app/expenses?${projectQuery}`,
      printableExpenses: `/app/reports/expense-tax-print?year=2025&${projectQuery}`,
      csv: `/api/reports/expense-tax-export?year=2025&${projectQuery}`,
    },
    deliveredEmailMessageId,
    supersedes: ["h4r_2025_balanced_property_workpaper_v10", "h4r_2025_tax_preparer_workpaper_v9"],
    localVerifiedArtifactManifest: files,
    limitations: [
      "Only the identified $71,684 Cash App income pool is allocated across the 13 owner-confirmed income properties; the separate unclassified incoming pool is not represented as confirmed rent.",
      "Income allocation is 75% balanced and 25% influenced by eligible provisional payer/property evidence, with Winkler limited and a $12,000 property cap.",
      "Expenses are equal-shared within active regions or across the active portfolio when location is unavailable; Martinsville and St Paul-area transactions remain location-only expense exceptions.",
      "Dells, non-managed properties, inactive St Louis properties, 921 Cameron, and Sedan receive no shared allocation.",
      "Transfers remain reconciliation-only and are not counted as income or expenses.",
      "This is a preparer-review bookkeeping estimate and does not establish transaction-specific property use, deductibility, capitalization, ownership, or final tax treatment.",
      "No H4R ledger, tenant, lease, payment, property, or signature record was changed.",
    ],
  };
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const owner = await client.query(`select 1 from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id where lower(u.email)=lower($2) and tu.status='active'
      and tu.role in ('owner','admin') and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected owner/workspace binding was not found.");
    const current = await client.query<{ latest: { version?: string; bookkeepingWorkpaperUsableForPreparerReview?: boolean } | null }>(`select metadata_json->'latestReviewedReport' latest
      from public.document_intelligence_projects where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' for update`, [tenantId, projectId]);
    if (current.rowCount !== 1 || current.rows[0].latest?.version !== "h4r_2025_balanced_property_workpaper_v10"
      || current.rows[0].latest?.bookkeepingWorkpaperUsableForPreparerReview !== true) {
      throw new Error("Current v10 manifest guard failed; refusing to overwrite unexpected state.");
    }
    const updated = await client.query<{ metadata_json: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=metadata_json || jsonb_build_object('latestReviewedReport',$3::jsonb),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' returning metadata_json`, [tenantId, projectId, JSON.stringify(manifest)]);
    const stored = updated.rows[0]?.metadata_json?.latestReviewedReport as { version?: string; deliveredEmailMessageId?: string } | undefined;
    if (stored?.version !== reportVersion || stored.deliveredEmailMessageId !== deliveredEmailMessageId) throw new Error("Stored manifest verification failed.");
    await client.query("commit");
    console.log(JSON.stringify({ ok: true, tenantId, projectId, reportVersion, artifactCount: files.length, deliveredEmailMessageId }, null, 2));
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
