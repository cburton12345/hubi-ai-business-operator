import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const ownerEmail = "burtonchristopher125@gmail.com";
const reportVersion = "h4r_2025_tax_preparer_workpaper_v9";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const reportDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!reportDirectory) throw new Error("Provide the verified report directory.");
  const deliveredEmailMessageId = process.argv[3]?.trim();
  if (!deliveredEmailMessageId) throw new Error("Provide the verified delivery message ID.");
  const fileNames = [
    "H4R-2025-financial-breakdown.json",
    "H4R-2025-bank-transfer-property-allocation.json",
    "H4R-2025-expense-candidates.csv",
    "H4R-2025-property-totals.csv",
    "H4R-2025-bank-transfer-property-allocation.csv",
    "H4R-2025-deposit-candidates.csv",
    "H4R-2025-transfers-separated.csv",
    "H4R-2025-printable-property-cash-summary.pdf",
    "H4R-2025-printable-expense-breakdown.pdf",
    "H4R-2025-printable-deposit-and-transfer-breakdown.pdf",
    "H4R-2025-printable-bank-transfer-property-allocation.pdf",
  ];
  const files = [];
  for (const fileName of fileNames) {
    const bytes = await readFile(path.join(reportDirectory, fileName));
    files.push({ fileName, byteCount: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const report = JSON.parse(await readFile(path.join(reportDirectory, fileNames[0]), "utf8")) as {
    counts: Record<string, number>;
    totals: Record<string, number>;
    review: Record<string, number>;
    coverage: Record<string, unknown>;
  };
  const projectQuery = `project=${encodeURIComponent(projectId)}`;
  const manifest = {
    version: reportVersion,
    generatedAt: new Date().toISOString(),
    taxYear: 2025,
    sourceGuard: { sourceDocuments: 12, transactionRows: 1995, allMonthsPresent: true },
    counts: report.counts,
    totals: report.totals,
    review: report.review,
    workspaceLinks: {
      project: `/app/expenses?${projectQuery}`,
      printableExpenses: `/app/reports/expense-tax-print?year=2025&${projectQuery}`,
      printableDeposits: `/app/reports/income-tax-print?year=2025&${projectQuery}`,
      csv: `/api/reports/expense-tax-export?year=2025&${projectQuery}`,
    },
    deliveredEmailMessageId,
    localVerifiedArtifactManifest: files,
    limitations: [
      "Workspace print and CSV links render from the current reviewed database rows.",
      "Local PDF and CSV hashes identify the visually verified emailed packet; local filesystem paths are intentionally not exposed in the workspace UI.",
      "Every outgoing non-transfer row has one owner-authorized proximity property assignment; this remains editable bookkeeping evidence, not receipt/job proof.",
      "The separate bank-transfer schedule preserves exact current-tenant-name candidates and distributes unmatched person-to-person payments across expense-bearing properties by expense share; estimated portions are labeled and remain editable.",
      "The one-page tax-preparer summary shows only provisional identified tenant-name payments and assigned expense candidates. Unclassified incoming payments remain in supporting records and are excluded without being represented as non-taxable. Bank/card transfers are excluded from the primary page and retained only in a separate reconciliation appendix to prevent double counting.",
      "Bank transfers are reconciliation-only cash movements and are not counted as expenses or additional income.",
      "No tax treatment or H4R ledger settlement is automatically confirmed.",
    ],
  };
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`select 1 from public.users u join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id where lower(u.email)=lower($2) and tu.status='active'
      and tu.role in ('owner','admin') and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected owner/workspace binding was not found.");
    const updated = await client.query<{ metadata_json: Record<string, unknown> }>(`update public.document_intelligence_projects
      set metadata_json=metadata_json || jsonb_build_object('latestReviewedReport',$3::jsonb),updated_at=now()
      where tenant_id=$1 and id=$2 and tax_year=2025 and status='active' returning metadata_json`, [tenantId, projectId, JSON.stringify(manifest)]);
    if (updated.rowCount !== 1) throw new Error("Expected exactly one active H4R 2025 document project.");
    const stored = updated.rows[0].metadata_json?.latestReviewedReport as { version?: string; files?: unknown[] } | undefined;
    if (stored?.version !== reportVersion) throw new Error("Stored report manifest failed post-write verification.");
    console.log(JSON.stringify({ ok: true, tenantId, projectId, reportVersion, workspaceLinks: manifest.workspaceLinks, artifactCount: files.length }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
