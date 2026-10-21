import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const reportVersion = "h4r_2025_balanced_property_workpaper_v10";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const deliveredEmailMessageId = process.argv[3]?.trim();
  if (!directory || !deliveredEmailMessageId) throw new Error("Provide the verified report directory and delivered email message ID.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-balanced-property-expense-allocation.json"), "utf8")) as {
    version: string;
    sourceGuard: { expenseRows: number; propertyCount: number; excludedProperties: string[] };
    totals: Record<string, number>;
    propertyTotals: Array<{ propertyName: string }>;
    transactionControls: Array<{ sourceAmountCents: number; allocatedCents: number }>;
  };
  if (report.version !== "h4r_2025_balanced_shared_expense_v1" || report.sourceGuard.expenseRows !== 1762
    || report.totals.expenseCents !== 8405279 || report.sourceGuard.propertyCount !== 26
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)
    || report.propertyTotals.some((row) => row.propertyName.toLowerCase().includes("elk mound"))) {
    throw new Error("Verified report failed the manifest guard.");
  }
  const fileNames = [
    "H4R-2025-balanced-property-expense-allocation.json",
    "H4R-2025-balanced-property-expense-summary.pdf",
    "H4R-2025-balanced-property-expense-workpaper.xlsx",
    "H4R-2025-property-expense-summary.csv",
    "H4R-2025-property-expense-allocation-detail.csv",
    "H4R-2025-transaction-reconciliation.csv",
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
    sourceGuard: { expenseRows: 1762, expenseCents: 8405279, propertyCount: 26, excludedProperties: ["Elk mound"] },
    totals: report.totals,
    workspaceLinks: {
      project: `/app/expenses?${projectQuery}`,
      printableExpenses: `/app/reports/expense-tax-print?year=2025&${projectQuery}`,
      csv: `/api/reports/expense-tax-export?year=2025&${projectQuery}`,
    },
    deliveredEmailMessageId,
    localVerifiedArtifactManifest: files,
    limitations: [
      "This replaces and does not revive invalid v4-v9 forced property schedules.",
      "The workpaper shares located expenses within a supported region and unlocated expenses across the portfolio; it does not assert a transaction-specific property fact.",
      "Within each pool, the method is 50% equal property share and 50% provisional exact tenant-name payment share. Payment evidence is a weighting input, not confirmed rent.",
      "Transfers remain separate reconciliation-only cash movements and are not counted as expenses or additional income.",
      "The workpaper is for owner and tax-preparer review. It does not confirm business purpose, deductibility, capitalization, 2025 property activity, or final tax treatment.",
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
    const current = await client.query<{ latest: { version?: string; reportUsableForTax?: boolean } | null }>(`select metadata_json->'latestReviewedReport' latest
      from public.document_intelligence_projects where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' for update`, [tenantId, projectId]);
    if (current.rowCount !== 1 || current.rows[0].latest?.version !== "h4r_2025_tax_preparer_workpaper_v9"
      || current.rows[0].latest?.reportUsableForTax !== false) {
      throw new Error("Current invalidated v9 manifest guard failed; refusing to overwrite unexpected state.");
    }
    const updated = await client.query<{ metadata_json: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=metadata_json || jsonb_build_object('latestReviewedReport',$3::jsonb),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' returning metadata_json`, [tenantId, projectId, JSON.stringify(manifest)]);
    const stored = updated.rows[0]?.metadata_json?.latestReviewedReport as { version?: string; deliveredEmailMessageId?: string } | undefined;
    if (stored?.version !== reportVersion || stored.deliveredEmailMessageId !== deliveredEmailMessageId) {
      throw new Error("Stored report manifest failed post-write verification.");
    }
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
