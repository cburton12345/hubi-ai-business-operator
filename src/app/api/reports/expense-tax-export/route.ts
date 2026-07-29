import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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

export async function GET(request: Request) {
  await requirePermission("tenant:view");
  const tenantId = await getCurrentWorkspaceId();
  const year = yearFromUrl(request);

  const expenses = await queryPostgres<{
    id: string;
    expense_date: Date | null;
    vendor: string | null;
    category: string;
    assign_to: string;
    job_title: string | null;
    worker_name: string | null;
    amount_cents: number;
    tax_cents: number;
    total_cents: number;
    reimbursement_status: string;
    status: string;
    receipt_url: string | null;
    notes: string | null;
  }>(
    `
    select
      e.id,
      e.expense_date,
      e.vendor,
      e.category,
      e.assign_to,
      j.title as job_title,
      w.name as worker_name,
      e.amount_cents,
      e.tax_cents,
      e.amount_cents + e.tax_cents as total_cents,
      e.reimbursement_status,
      e.status,
      e.receipt_url,
      coalesce(e.reimbursement_notes, e.ai_summary) as notes
    from public.operations_expenses e
    left join public.service_jobs j on j.id = e.service_job_id
    left join public.operations_workers w on w.id = e.worker_id
    where e.tenant_id = $1
      and e.status <> 'rejected'
      and coalesce(e.expense_date, e.created_at::date) >= make_date($2::int, 1, 1)
      and coalesce(e.expense_date, e.created_at::date) < make_date(($2::int + 1), 1, 1)
    order by coalesce(e.expense_date, e.created_at::date), e.created_at, e.vendor
    `,
    [tenantId, year]
  );

  const header = [
    "expense_id",
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
    "notes"
  ];

  const rows = (expenses?.rows ?? []).map((expense) => [
    expense.id,
    expense.expense_date ? new Date(expense.expense_date).toISOString().slice(0, 10) : "",
    expense.vendor ?? "",
    expense.category,
    expense.assign_to,
    expense.job_title ?? "",
    expense.worker_name ?? "",
    dollars(expense.amount_cents),
    dollars(expense.tax_cents),
    dollars(expense.total_cents),
    expense.reimbursement_status,
    expense.status,
    expense.receipt_url ? "yes" : "no",
    expense.notes ?? ""
  ]);

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
