import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const reportVersion = "h4r_2025_schedule_e_preparer_workpaper_v15";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const deliveredEmailMessageId = process.argv[3]?.trim();
  if (!directory || !deliveredEmailMessageId) throw new Error("Provide the verified report directory and delivered email message ID.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-Schedule-E-workpaper.json"), "utf8")) as {
    version: string;
    sourceGuard: Record<string, number>;
    totals: Record<string, number>;
    propertyTotals: Array<{ propertyName: string; totalExpenseCents: number }>;
    transactionControls: Array<{ sourceAmountCents: number; distributedCents: number }>;
    depositReview: unknown[];
  };
  const maxPropertyOutflow = Math.max(...report.propertyTotals.map((row) => row.totalExpenseCents));
  if (report.version !== reportVersion || report.sourceGuard.expenseRows !== 1762
    || report.sourceGuard.activeIncomeProperties !== 13 || report.sourceGuard.unmatchedDeposits !== 143
    || report.totals.totalIncomeCents !== 7168400 || report.totals.totalExpenseCents !== 8405279
    || report.totals.totalNetIncomeLossCents !== -1236879 || report.totals.workerPaymentCents !== 780513
    || report.depositReview.length !== 143 || maxPropertyOutflow / report.totals.totalExpenseCents > 0.15
    || report.propertyTotals.some((row) => /dells|elk mound/i.test(row.propertyName))
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.distributedCents)) {
    throw new Error("Manifest source guard failed.");
  }
  const fileNames = [
    "H4R-2025-Schedule-E-workpaper.json",
    "H4R-2025-Schedule-E-one-page-summary.pdf",
    "H4R-2025-Schedule-E-preparer-workbook.xlsx",
    "H4R-2025-Schedule-E-property-summary.csv",
    "H4R-2025-Schedule-E-category-detail.csv",
    "H4R-2025-worker-payments.csv",
    "H4R-2025-expense-transaction-detail.csv",
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
    propertyScheduleUsableForTax: false,
    bookkeepingWorkpaperUsableForPreparerReview: true,
    sourceGuard: report.sourceGuard,
    totals: report.totals,
    workspaceLinks: {
      project: `/app/expenses?${projectQuery}`,
      printableExpenses: `/app/reports/expense-tax-print?year=2025&${projectQuery}`,
      csv: `/api/reports/expense-tax-export?year=2025&${projectQuery}`,
    },
    deliveredEmailMessageId,
    supersedes: ["h4r_2025_preparer_review_workpaper_v12", "h4r_2025_final_property_workpaper_v11", "h4r_2025_balanced_property_workpaper_v10", "h4r_2025_tax_preparer_workpaper_v9"],
    localVerifiedArtifactManifest: files,
    limitations: [
      "The primary page follows the 2025 Schedule E Part I presentation: rents received, total expenses, and net income or loss by property, with losses in parentheses.",
      "Western Wisconsin purchasing hubs are shared across the full active property set instead of being forced onto only Spring Valley, Ridgeland, and Colfax. Exact geographic evidence for other regions remains scoped to the applicable properties.",
      "The owner confirmed 35 outgoing Cash App payments totaling $7,805.13 were worker payments. They appear under Other - labor and services and remain separately identifiable for payee reporting records.",
      "The workbook groups statement-derived expenses into Schedule E lines 5-19 and preserves complete transaction detail. The preparer remains responsible for depreciation, ownership, property type and days, information returns, return-level limitations, and final tax treatment.",
      "Transfers remain reconciliation-only and are not counted as income or expenses.",
      "This workpaper does not establish transaction-specific business purpose, property use, deductibility, capitalization, ownership, or final tax treatment.",
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
    if (current.rowCount !== 1 || current.rows[0].latest?.version !== "h4r_2025_preparer_review_workpaper_v12"
      || current.rows[0].latest?.bookkeepingWorkpaperUsableForPreparerReview !== true) {
      throw new Error("Current v12 manifest guard failed; refusing to overwrite unexpected state.");
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
