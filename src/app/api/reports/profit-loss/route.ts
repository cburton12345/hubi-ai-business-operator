import { buildManagementPnl } from "@/lib/accounting/management-pnl";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type Basis = "cash" | "accrual";

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dollars(cents: number | string | null | undefined) {
  const amount = Number(cents ?? 0);
  return (Number.isFinite(amount) ? amount / 100 : 0).toFixed(2);
}

function requestOptions(request: Request) {
  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year"));
  const currentYear = new Date().getFullYear();
  const year =
    Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear + 1
      ? requestedYear
      : currentYear;
  const basis: Basis = url.searchParams.get("basis") === "accrual" ? "accrual" : "cash";
  return { basis, year };
}

export async function GET(request: Request) {
  await requirePermission("billing:manage");
  const tenantId = await getCurrentWorkspaceId();
  const { basis, year } = requestOptions(request);

  const [incomeResult, expenseResult, laborResult, reconciliationResult, categoriesResult] = await Promise.all([
    basis === "cash"
      ? queryPostgres<{
          revenue_cents: string;
          refund_cents: string;
          sales_tax_cents: string;
          payment_fee_cents: string;
        }>(
          `
          with entries as (
            select
              e.entry_type,
              e.amount_cents,
              case
                when i.total_cents > 0 then round(e.amount_cents::numeric * i.tax_cents::numeric / i.total_cents)::bigint
                else 0
              end as allocated_tax_cents
            from public.service_ledger_entries e
            left join public.service_invoices i
              on i.tenant_id = e.tenant_id and i.id = e.invoice_id
            where e.tenant_id = $1
              and e.entry_type in ('payment_received', 'refund')
              and e.occurred_at >= make_date($2::int, 1, 1)
              and e.occurred_at < make_date(($2::int + 1), 1, 1)
          ),
          fees as (
            select coalesce(sum(
              greatest(coalesce(fee_cents, 0), coalesce(processor_fee_cents, 0))
              + coalesce(platform_fee_cents, 0)
            ), 0) as payment_fee_cents
            from public.service_invoice_payments
            where tenant_id = $1
              and status in ('succeeded', 'manual', 'partially_refunded', 'refunded')
              and coalesce(paid_at, received_at, created_at) >= make_date($2::int, 1, 1)
              and coalesce(paid_at, received_at, created_at) < make_date(($2::int + 1), 1, 1)
          )
          select
            coalesce(sum(amount_cents - allocated_tax_cents) filter (where entry_type = 'payment_received'), 0)::text as revenue_cents,
            coalesce(sum(amount_cents - allocated_tax_cents) filter (where entry_type = 'refund'), 0)::text as refund_cents,
            (
              coalesce(sum(allocated_tax_cents) filter (where entry_type = 'payment_received'), 0)
              - coalesce(sum(allocated_tax_cents) filter (where entry_type = 'refund'), 0)
            )::text as sales_tax_cents,
            (select payment_fee_cents from fees)::text as payment_fee_cents
          from entries
          `,
          [tenantId, year]
        )
      : queryPostgres<{
          revenue_cents: string;
          refund_cents: string;
          sales_tax_cents: string;
          payment_fee_cents: string;
        }>(
          `
          with invoices as (
            select
              coalesce(sum(greatest(total_cents - tax_cents, 0)), 0) as revenue_cents,
              coalesce(sum(tax_cents), 0) as sales_tax_cents
            from public.service_invoices
            where tenant_id = $1
              and status not in ('draft', 'void')
              and created_at >= make_date($2::int, 1, 1)
              and created_at < make_date(($2::int + 1), 1, 1)
          ),
          refunds as (
            select
              coalesce(sum(e.amount_cents - case
                when i.total_cents > 0 then round(e.amount_cents::numeric * i.tax_cents::numeric / i.total_cents)::bigint
                else 0
              end), 0) as refund_cents,
              coalesce(sum(case
                when i.total_cents > 0 then round(e.amount_cents::numeric * i.tax_cents::numeric / i.total_cents)::bigint
                else 0
              end), 0) as refunded_tax_cents
            from public.service_ledger_entries e
            left join public.service_invoices i on i.tenant_id = e.tenant_id and i.id = e.invoice_id
            where e.tenant_id = $1
              and e.entry_type = 'refund'
              and e.occurred_at >= make_date($2::int, 1, 1)
              and e.occurred_at < make_date(($2::int + 1), 1, 1)
          ),
          fees as (
            select coalesce(sum(
              greatest(coalesce(fee_cents, 0), coalesce(processor_fee_cents, 0))
              + coalesce(platform_fee_cents, 0)
            ), 0) as payment_fee_cents
            from public.service_invoice_payments
            where tenant_id = $1
              and status in ('succeeded', 'manual', 'partially_refunded', 'refunded')
              and coalesce(paid_at, received_at, created_at) >= make_date($2::int, 1, 1)
              and coalesce(paid_at, received_at, created_at) < make_date(($2::int + 1), 1, 1)
          )
          select
            invoices.revenue_cents::text,
            refunds.refund_cents::text,
            (invoices.sales_tax_cents - refunds.refunded_tax_cents)::text as sales_tax_cents,
            fees.payment_fee_cents::text
          from invoices cross join refunds cross join fees
          `,
          [tenantId, year]
        ),
    queryPostgres<{
      direct_expense_cents: string;
      operating_expense_cents: string;
      unreviewed_expense_cents: string;
    }>(
      `
      select
        coalesce(sum(amount_cents + tax_cents) filter (
          where status in ('approved', 'exported') and assign_to in ('job', 'customer')
        ), 0)::text as direct_expense_cents,
        coalesce(sum(amount_cents + tax_cents) filter (
          where status in ('approved', 'exported') and assign_to in ('department', 'overhead')
        ), 0)::text as operating_expense_cents,
        coalesce(sum(amount_cents + tax_cents) filter (where status = 'needs_review'), 0)::text as unreviewed_expense_cents
      from public.operations_expenses
      where tenant_id = $1
        and coalesce(expense_date, created_at::date) >= make_date($2::int, 1, 1)
        and coalesce(expense_date, created_at::date) < make_date(($2::int + 1), 1, 1)
      `,
      [tenantId, year]
    ),
    queryPostgres<{ direct_labor_cents: string; operating_labor_cents: string }>(
      `
      select
        coalesce(sum(amount_cents) filter (where service_job_id is not null), 0)::text as direct_labor_cents,
        coalesce(sum(amount_cents) filter (where service_job_id is null), 0)::text as operating_labor_cents
      from public.operations_worker_payments
      where tenant_id = $1
        and status in ('recorded', 'reviewed')
        and payment_type in ('payroll', 'subcontractor', 'bonus', 'other')
        and payment_date >= make_date($2::int, 1, 1)
        and payment_date < make_date(($2::int + 1), 1, 1)
      `,
      [tenantId, year]
    ),
    queryPostgres<{
      vendor_bills_cents: string;
      material_logs_cents: string;
    }>(
      `
      select
        (
          select coalesce(sum(total_cents), 0)
          from public.vendor_bills
          where tenant_id = $1
            and status in ('approved', 'exported', 'paid')
            and coalesce(bill_date, created_at::date) >= make_date($2::int, 1, 1)
            and coalesce(bill_date, created_at::date) < make_date(($2::int + 1), 1, 1)
        )::text as vendor_bills_cents,
        (
          select coalesce(sum(case when log_type = 'returned' then -cost_cents else cost_cents end), 0)
          from public.operations_material_logs
          where tenant_id = $1
            and status = 'approved'
            and log_type in ('purchased', 'returned')
            and created_at >= make_date($2::int, 1, 1)
            and created_at < make_date(($2::int + 1), 1, 1)
        )::text as material_logs_cents
      `,
      [tenantId, year]
    ),
    queryPostgres<{ category: string; total_cents: string; record_count: string }>(
      `
      select coalesce(nullif(category, ''), 'uncategorized') as category,
        coalesce(sum(amount_cents + tax_cents), 0)::text as total_cents,
        count(*)::text as record_count
      from public.operations_expenses
      where tenant_id = $1
        and status in ('approved', 'exported')
        and coalesce(expense_date, created_at::date) >= make_date($2::int, 1, 1)
        and coalesce(expense_date, created_at::date) < make_date(($2::int + 1), 1, 1)
      group by coalesce(nullif(category, ''), 'uncategorized')
      order by coalesce(sum(amount_cents + tax_cents), 0) desc
      `,
      [tenantId, year]
    )
  ]);

  const income = incomeResult?.rows[0];
  const expenses = expenseResult?.rows[0];
  const labor = laborResult?.rows[0];
  const reconciliation = reconciliationResult?.rows[0];
  const report = buildManagementPnl({
    recognizedRevenueCents: Number(income?.revenue_cents ?? 0),
    refundsCents: Number(income?.refund_cents ?? 0),
    directExpenseCents: Number(expenses?.direct_expense_cents ?? 0),
    directLaborCents: Number(labor?.direct_labor_cents ?? 0),
    operatingExpenseCents: Number(expenses?.operating_expense_cents ?? 0),
    operatingLaborCents: Number(labor?.operating_labor_cents ?? 0),
    paymentFeeCents: Number(income?.payment_fee_cents ?? 0),
    salesTaxCents: Number(income?.sales_tax_cents ?? 0),
    vendorBillsToReconcileCents: Number(reconciliation?.vendor_bills_cents ?? 0),
    materialLogsToReconcileCents: Number(reconciliation?.material_logs_cents ?? 0),
    unreviewedExpenseCents: Number(expenses?.unreviewed_expense_cents ?? 0)
  });

  const rows: Array<Array<string | number>> = [
    ["Ferocity management profit and loss", `${year} ${basis} basis`, "", ""],
    ["Important", "Management report; not a filed tax return or accountant-certified statement.", "", ""],
    [
      "Method",
      basis === "cash"
        ? "Revenue follows recorded payment/refund ledger dates."
        : "Revenue follows non-draft, non-void invoice dates; refunds follow refund dates.",
      "",
      ""
    ],
    ["Method", "Only approved/exported expenses and recorded/reviewed worker payments affect profit.", "", ""],
    ["Method", "Vendor bills and material logs are reconciliation-only to prevent duplicate costs.", "", ""],
    [],
    ["P&L section", "Account", "Amount", "Treatment"],
    ["Revenue", "Recognized revenue excluding allocated sales tax", dollars(report.recognizedRevenueCents), "Included"],
    ["Revenue", "Refunds excluding allocated sales tax", dollars(-report.refundsCents), "Included"],
    ["Revenue", "Net revenue", dollars(report.netRevenueCents), "Subtotal"],
    ["Cost of revenue", "Approved job/customer expenses", dollars(-report.directExpenseCents), "Included"],
    ["Cost of revenue", "Recorded job labor/subcontractors", dollars(-report.directLaborCents), "Included"],
    ["Cost of revenue", "Total cost of revenue", dollars(-report.costOfRevenueCents), "Subtotal"],
    ["Profit", "Gross profit", dollars(report.grossProfitCents), "Subtotal"],
    ["Operating expense", "Approved department/overhead expenses", dollars(-report.operatingExpenseCents), "Included"],
    ["Operating expense", "Recorded non-job labor", dollars(-report.operatingLaborCents), "Included"],
    ["Operating expense", "Payment/platform fees", dollars(-report.paymentFeeCents), "Included"],
    ["Operating expense", "Total operating expense", dollars(-report.totalOperatingExpenseCents), "Subtotal"],
    ["Profit", "Net operating income", dollars(report.netOperatingIncomeCents), "Management total"],
    [],
    ["Tax/reconciliation", "Sales tax tracked", dollars(report.salesTaxCents), "Excluded from revenue/profit"],
    ["Tax/reconciliation", "Unreviewed expenses", dollars(report.unreviewedExpenseCents), "Excluded until approved"],
    ["Tax/reconciliation", "Vendor bills to reconcile", dollars(report.vendorBillsToReconcileCents), "Excluded; may duplicate expenses"],
    ["Tax/reconciliation", "Purchased/returned material logs to reconcile", dollars(report.materialLogsToReconcileCents), "Excluded; may duplicate expenses"],
    [],
    ["Approved expense category", "Amount", "Record count", "Included above"]
  ];

  for (const category of categoriesResult?.rows ?? []) {
    rows.push([category.category, dollars(category.total_cents), Number(category.record_count), "Yes"]);
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Disposition": `attachment; filename="ferocity-management-pnl-${year}-${basis}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}
