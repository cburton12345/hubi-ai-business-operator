import { requirePermission } from "@/lib/auth/require-permission";
import { listExpenseTaxPacketRows } from "@/lib/reports/expense-tax-packet";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { getFinancialWorkpaperReadiness } from "@/lib/document-intelligence/financial-workpaper-readiness";

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function dollars(cents: number | string | null | undefined) {
  const parsed = Number(cents ?? 0);
  return (Number.isFinite(parsed) ? parsed / 100 : 0).toFixed(2);
}

function yearFromUrl(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("year"));
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(requested) || requested < 2000 || requested > currentYear + 1) return currentYear;
  return requested;
}

function scopeFromUrl(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const validUuid = (value: string | null) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
  return { projectId: validUuid(searchParams.get("project")), batchId: validUuid(searchParams.get("batch")) };
}

export async function GET(request: Request) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const year = yearFromUrl(request);
  const scope = scopeFromUrl(request);

  const [expenses, readiness] = await Promise.all([
    listExpenseTaxPacketRows(tenantId, year, scope),
    getFinancialWorkpaperReadiness(tenantId, year, scope),
  ]);

  const header = [
    "expense_id",
    "source_type",
    "source_document_id",
    "expense_date",
    "vendor",
    "category",
    "assign_to",
    "job",
    "worker",
    "amount",
    "tax",
    "total",
    "reimbursement_status",
    "review_status",
    "receipt_saved",
    "notes",
    "workpaper_status",
    "workpaper_blockers",
    "workpaper_next_action",
    "statement_coverage_status",
    "missing_statement_months"
  ];

  const rows = expenses.map((expense) => [
    expense.id,
    expense.source_kind,
    expense.document_id ?? "",
    expense.expense_date,
    expense.vendor ?? "",
    expense.category,
    expense.assign_to,
    expense.job_title ?? "",
    expense.worker_name ?? "",
    dollars(expense.amount_cents),
    dollars(expense.tax_cents),
    dollars(expense.amount_cents + expense.tax_cents),
    expense.reimbursement_status,
    expense.review_status,
    expense.receipt_url ? "yes" : "no",
    expense.source_description ?? "",
    readiness.label,
    readiness.blocks.map((block) => `${block.code}: ${block.message}`).join(" | "),
    readiness.nextAction ?? "",
    readiness.coverage ? readiness.coverage.message : "No verified annual statement coverage",
    readiness.coverage?.missingMonths.join("; ") ?? ""
  ]);

  if (!rows.length) {
    rows.push(["", "readiness_summary", "", "", "", "", "", "", "", "", "", "", "", "", "", "", readiness.label, readiness.blocks.map((block) => `${block.code}: ${block.message}`).join(" | "), readiness.nextAction ?? "", readiness.coverage?.message ?? "No verified annual statement coverage", readiness.coverage?.missingMonths.join("; ") ?? ""]);
  }

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const fileName = `ferocity-expense-tax-export-${year}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}
