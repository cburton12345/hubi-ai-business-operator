import { manualSmsHref } from "@/lib/communication/manual-sms";
import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type JobTrackerDashboard = {
  metrics: {
    openJobs: number;
    openBidCount: number;
    openBidValue: string;
    approvedBidValue: string;
    paidToPeople30d: string;
    unpaidPeoplePlanned: string;
    materialItemsNeeded: number;
    jobCosts30d: string;
    reimbursementPending: string;
    receiptsNeedReview: number;
    moneyCustomersOwe: string;
    overdueInvoices: number;
    profitTracked30d: string;
  };
  jobs: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    schedule: string;
    bidTotal: string;
    invoicedTotal: string;
    invoicePaid: string;
    expenseTotal: string;
    materialTotal: string;
    peoplePaid: string;
    reimbursableReceipts: string;
    invoiceBalance: string;
    grossLeft: string;
    margin: string;
    href: string;
  }[];
  bids: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    validUntil: string;
    createdAt: string;
    href: string;
  }[];
  workerPayments: {
    id: string;
    payeeName: string;
    workerName: string;
    jobTitle: string;
    paymentType: string;
    amount: string;
    paymentDate: string;
    method: string;
    status: string;
    notes: string;
  }[];
  materialItems: {
    id: string;
    materialName: string;
    jobTitle: string;
    quantity: string;
    estimatedCost: string;
    actualCost: string;
    status: string;
    notes: string;
  }[];
  receiptExpenses: {
    id: string;
    vendor: string;
    workerName: string;
    jobTitle: string;
    category: string;
    amount: string;
    status: string;
    reimbursementStatus: string;
    dueDate: string;
    notes: string;
    smsHref: string;
    canText: boolean;
  }[];
  formOptions: {
    jobs: { id: string; title: string }[];
    workers: { id: string; name: string }[];
    assignments: { id: string; title: string }[];
    customers: { id: string; name: string }[];
  };
};

function formatDate(value: Date | string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: Date | string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function quantity(value: string | number | null, unit: string | null) {
  if (value === null || value === undefined || value === "") return unit ?? "Not set";
  const parsed = Number(value);
  const clean = Number.isFinite(parsed) ? parsed.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value);
  return [clean, unit].filter(Boolean).join(" ");
}

export async function getJobTrackerDashboard(): Promise<JobTrackerDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [
    metrics,
    jobs,
    receiptExpenses,
    bids,
    workerPayments,
    materialItems,
    jobOptions,
    workerOptions,
    assignmentOptions,
    customerOptions
  ] = await Promise.all([
    queryPostgres<{
      open_jobs: string;
      open_bid_count: string;
      open_bid_value: string | null;
      approved_bid_value: string | null;
      paid_to_people_30d: string | null;
      unpaid_people_planned: string | null;
      material_items_needed: string;
      job_costs_30d: string | null;
      reimbursement_pending_cents: string | null;
      receipts_need_review: string;
      money_customers_owe_cents: string | null;
      overdue_invoices: string;
      profit_tracked_30d_cents: string | null;
    }>(
      `
      select
        (select count(*) from public.service_jobs where tenant_id = $1 and status in ('unscheduled', 'scheduled', 'in_progress')) as open_jobs,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually')) as open_bid_count,
        (select coalesce(sum(total_cents), 0) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually')) as open_bid_value,
        (select coalesce(sum(total_cents), 0) from public.service_estimates where tenant_id = $1 and status = 'approved') as approved_bid_value,
        (
          select coalesce(sum(amount_cents), 0)
          from public.operations_worker_payments
          where tenant_id = $1 and status in ('recorded', 'reviewed') and payment_date >= current_date - interval '30 days'
        ) as paid_to_people_30d,
        (
          select coalesce(sum(amount_cents), 0)
          from public.operations_worker_payments
          where tenant_id = $1 and status = 'planned'
        ) as unpaid_people_planned,
        (
          select count(*)
          from public.job_material_list_items
          where tenant_id = $1 and status in ('needed', 'ordered')
        ) as material_items_needed,
        (
          coalesce((select sum(amount_cents + tax_cents) from public.operations_expenses where tenant_id = $1 and created_at >= now() - interval '30 days'), 0)
          + coalesce((select sum(cost_cents) from public.operations_material_logs where tenant_id = $1 and created_at >= now() - interval '30 days'), 0)
          + coalesce((select sum(amount_cents) from public.operations_worker_payments where tenant_id = $1 and status in ('recorded', 'reviewed') and payment_date >= current_date - interval '30 days'), 0)
        ) as job_costs_30d,
        (
          select coalesce(sum(amount_cents + tax_cents - paid_back_cents), 0)
          from public.operations_expenses
          where tenant_id = $1 and reimbursement_status in ('submitted', 'approved')
        ) as reimbursement_pending_cents,
        (
          select count(*)
          from public.operations_expenses
          where tenant_id = $1 and status = 'needs_review'
        ) as receipts_need_review,
        (
          select coalesce(sum(total_cents - amount_paid_cents), 0)
          from public.service_invoices
          where tenant_id = $1 and status in ('sent_manually', 'partially_paid', 'overdue')
        ) as money_customers_owe_cents,
        (
          select count(*)
          from public.service_invoices
          where tenant_id = $1 and status in ('sent_manually', 'partially_paid', 'overdue')
            and due_date is not null
            and due_date < current_date
            and total_cents > amount_paid_cents
        ) as overdue_invoices,
        (
          coalesce((select sum(amount_paid_cents) from public.service_invoices where tenant_id = $1 and updated_at >= now() - interval '30 days'), 0)
          - (
            coalesce((select sum(amount_cents + tax_cents) from public.operations_expenses where tenant_id = $1 and created_at >= now() - interval '30 days' and status <> 'rejected'), 0)
            + coalesce((select sum(cost_cents) from public.operations_material_logs where tenant_id = $1 and created_at >= now() - interval '30 days' and status <> 'rejected'), 0)
            + coalesce((select sum(amount_cents) from public.operations_worker_payments where tenant_id = $1 and status in ('recorded', 'reviewed') and payment_date >= current_date - interval '30 days'), 0)
          )
        ) as profit_tracked_30d_cents
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      status: string;
      scheduled_start: Date | null;
      bid_total_cents: string | null;
      invoiced_total_cents: string | null;
      invoice_paid_cents: string | null;
      expense_total_cents: string | null;
      material_total_cents: string | null;
      people_paid_cents: string | null;
      reimbursable_receipts_cents: string | null;
    }>(
      `
      select
        j.id,
        j.title,
        c.name as customer_name,
        j.status,
        j.scheduled_start,
        coalesce(e.total_cents, 0) as bid_total_cents,
        coalesce(inv.invoice_total, 0) as invoiced_total_cents,
        coalesce(inv.invoice_paid, 0) as invoice_paid_cents,
        coalesce(exp.expense_total, 0) as expense_total_cents,
        coalesce(mat.material_total, 0) as material_total_cents,
        coalesce(pay.people_paid, 0) as people_paid_cents,
        coalesce(reim.reimbursable_receipts, 0) as reimbursable_receipts_cents
      from public.service_jobs j
      join public.customers c on c.id = j.customer_id
      left join public.service_estimates e on e.id = j.estimate_id
      left join (
        select job_id, sum(total_cents) as invoice_total, sum(amount_paid_cents) as invoice_paid
        from public.service_invoices
        where tenant_id = $1
        group by job_id
      ) inv on inv.job_id = j.id
      left join (
        select service_job_id, sum(amount_cents + tax_cents) as expense_total
        from public.operations_expenses
        where tenant_id = $1
        group by service_job_id
      ) exp on exp.service_job_id = j.id
      left join (
        select service_job_id, sum(case when coalesce(actual_cost_cents, 0) > 0 then actual_cost_cents else estimated_cost_cents end) as material_total
        from public.job_material_list_items
        where tenant_id = $1 and status <> 'cancelled'
        group by service_job_id
      ) mat on mat.service_job_id = j.id
      left join (
        select service_job_id, sum(amount_cents) as people_paid
        from public.operations_worker_payments
        where tenant_id = $1 and status in ('recorded', 'reviewed')
        group by service_job_id
      ) pay on pay.service_job_id = j.id
      left join (
        select service_job_id, sum(amount_cents + tax_cents - paid_back_cents) as reimbursable_receipts
        from public.operations_expenses
        where tenant_id = $1 and reimbursement_status in ('submitted','approved')
        group by service_job_id
      ) reim on reim.service_job_id = j.id
      where j.tenant_id = $1
      order by coalesce(j.scheduled_start, j.created_at) desc
      limit 14
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      vendor: string | null;
      worker_name: string | null;
      worker_phone: string | null;
      job_title: string | null;
      category: string;
      amount_cents: number;
      tax_cents: number;
      status: string;
      reimbursement_status: string;
      reimbursement_due_date: Date | null;
      reimbursement_notes: string | null;
      ai_summary: string | null;
    }>(
      `
      select e.id, e.vendor, w.name as worker_name, w.phone as worker_phone, j.title as job_title, e.category,
        e.amount_cents, e.tax_cents, e.status, e.reimbursement_status, e.reimbursement_due_date,
        e.reimbursement_notes, e.ai_summary
      from public.operations_expenses e
      left join public.operations_workers w on w.id = e.worker_id
      left join public.service_jobs j on j.id = e.service_job_id
      where e.tenant_id = $1
      order by
        case e.reimbursement_status when 'submitted' then 1 when 'approved' then 2 when 'paid' then 4 else 3 end,
        e.created_at desc
      limit 14
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      status: string;
      total_cents: number;
      valid_until: Date | null;
      created_at: Date;
    }>(
      `
      select e.id, e.title, c.name as customer_name, e.status, e.total_cents, e.valid_until, e.created_at
      from public.service_estimates e
      join public.customers c on c.id = e.customer_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      payee_name: string;
      worker_name: string | null;
      job_title: string | null;
      payment_type: string;
      amount_cents: number;
      payment_date: Date;
      method: string;
      status: string;
      notes: string | null;
    }>(
      `
      select p.id, p.payee_name, w.name as worker_name, j.title as job_title, p.payment_type,
        p.amount_cents, p.payment_date, p.method, p.status, p.notes
      from public.operations_worker_payments p
      left join public.operations_workers w on w.id = p.worker_id
      left join public.service_jobs j on j.id = p.service_job_id
      where p.tenant_id = $1
      order by p.payment_date desc, p.created_at desc
      limit 14
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      material_name: string;
      job_title: string | null;
      quantity: string | null;
      unit: string | null;
      estimated_cost_cents: number;
      actual_cost_cents: number;
      status: string;
      notes: string | null;
    }>(
      `
      select m.id, m.material_name, j.title as job_title, m.quantity::text, m.unit,
        m.estimated_cost_cents, m.actual_cost_cents, m.status, m.notes
      from public.job_material_list_items m
      left join public.service_jobs j on j.id = m.service_job_id
      where m.tenant_id = $1
      order by
        case m.status when 'needed' then 1 when 'ordered' then 2 when 'purchased' then 3 when 'used' then 4 else 5 end,
        m.created_at desc
      limit 16
      `,
      [tenantId]
    ),
    queryPostgres<{ id: string; title: string }>(
      "select id, title from public.service_jobs where tenant_id = $1 order by created_at desc limit 80",
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string }>(
      "select id, name from public.operations_workers where tenant_id = $1 and availability_status <> 'inactive' order by name asc limit 80",
      [tenantId]
    ),
    queryPostgres<{ id: string; title: string }>(
      "select id, title from public.operations_assignments where tenant_id = $1 and status <> 'archived' order by created_at desc limit 80",
      [tenantId]
    ),
    queryPostgres<{ id: string; name: string }>(
      "select id, name from public.customers where tenant_id = $1 and status <> 'do_not_contact' order by created_at desc limit 100",
      [tenantId]
    )
  ]);

  const row = metrics?.rows[0];

  return {
    metrics: {
      openJobs: Number(row?.open_jobs ?? 0),
      openBidCount: Number(row?.open_bid_count ?? 0),
      openBidValue: formatMoney(Number(row?.open_bid_value ?? 0)),
      approvedBidValue: formatMoney(Number(row?.approved_bid_value ?? 0)),
      paidToPeople30d: formatMoney(Number(row?.paid_to_people_30d ?? 0)),
      unpaidPeoplePlanned: formatMoney(Number(row?.unpaid_people_planned ?? 0)),
      materialItemsNeeded: Number(row?.material_items_needed ?? 0),
      jobCosts30d: formatMoney(Number(row?.job_costs_30d ?? 0)),
      reimbursementPending: formatMoney(Number(row?.reimbursement_pending_cents ?? 0)),
      receiptsNeedReview: Number(row?.receipts_need_review ?? 0),
      moneyCustomersOwe: formatMoney(Number(row?.money_customers_owe_cents ?? 0)),
      overdueInvoices: Number(row?.overdue_invoices ?? 0),
      profitTracked30d: formatMoney(Number(row?.profit_tracked_30d_cents ?? 0))
    },
    jobs: (jobs?.rows ?? []).map((job) => {
      const bid = Number(job.bid_total_cents ?? 0);
      const invoiced = Number(job.invoiced_total_cents ?? 0);
      const expenses = Number(job.expense_total_cents ?? 0);
      const materials = Number(job.material_total_cents ?? 0);
      const people = Number(job.people_paid_cents ?? 0);
      const reimbursements = Number(job.reimbursable_receipts_cents ?? 0);
      const paidIn = Number(job.invoice_paid_cents ?? 0);
      const grossBase = invoiced || bid;
      const costTotal = expenses + materials + people + reimbursements;
      const left = grossBase - costTotal;
      const margin = grossBase > 0 ? `${Math.round((left / grossBase) * 100)}%` : "No price";
      return {
        id: job.id,
        title: job.title,
        customerName: job.customer_name,
        status: job.status,
        schedule: formatDateTime(job.scheduled_start),
        bidTotal: formatMoney(bid),
        invoicedTotal: formatMoney(invoiced),
        invoicePaid: formatMoney(paidIn),
        expenseTotal: formatMoney(expenses),
        materialTotal: formatMoney(materials),
        peoplePaid: formatMoney(people),
        reimbursableReceipts: formatMoney(reimbursements),
        invoiceBalance: formatMoney(Math.max(0, invoiced - paidIn)),
        grossLeft: formatMoney(left),
        margin,
        href: `/app/service/jobs/${job.id}`
      };
    }),
    bids: (bids?.rows ?? []).map((bid) => ({
      id: bid.id,
      title: bid.title,
      customerName: bid.customer_name,
      status: bid.status,
      total: formatMoney(bid.total_cents),
      validUntil: formatDate(bid.valid_until),
      createdAt: formatDate(bid.created_at),
      href: `/app/service/estimates/${bid.id}`
    })),
    workerPayments: (workerPayments?.rows ?? []).map((payment) => ({
      id: payment.id,
      payeeName: payment.payee_name,
      workerName: payment.worker_name ?? "Manual payee",
      jobTitle: payment.job_title ?? "No job linked",
      paymentType: payment.payment_type,
      amount: formatMoney(payment.amount_cents),
      paymentDate: formatDate(payment.payment_date),
      method: payment.method,
      status: payment.status,
      notes: payment.notes ?? ""
    })),
    materialItems: (materialItems?.rows ?? []).map((material) => ({
      id: material.id,
      materialName: material.material_name,
      jobTitle: material.job_title ?? "No job linked",
      quantity: quantity(material.quantity, material.unit),
      estimatedCost: formatMoney(material.estimated_cost_cents),
      actualCost: formatMoney(material.actual_cost_cents),
      status: material.status,
      notes: material.notes ?? ""
    })),
    receiptExpenses: (receiptExpenses?.rows ?? []).map((expense) => {
      const amount = formatMoney(Number(expense.amount_cents ?? 0) + Number(expense.tax_cents ?? 0));
      const dueDate = formatDate(expense.reimbursement_due_date);
      const workerName = expense.worker_name ?? "there";
      return {
        id: expense.id,
        vendor: expense.vendor ?? "Unknown vendor",
        workerName: expense.worker_name ?? "No worker linked",
        jobTitle: expense.job_title ?? "No job linked",
        category: expense.category,
        amount,
        status: expense.status,
        reimbursementStatus: expense.reimbursement_status,
        dueDate,
        notes: expense.reimbursement_notes ?? expense.ai_summary ?? "",
        smsHref: manualSmsHref(
          expense.worker_phone,
          `Hi ${workerName}, I saw your receipt for ${amount}${expense.vendor ? ` from ${expense.vendor}` : ""}. It is marked ${expense.reimbursement_status.replaceAll("_", " ")}${dueDate !== "Not set" ? `, target payback date ${dueDate}` : ""}.`
        ),
        canText: Boolean(expense.worker_phone)
      };
    }),
    formOptions: {
      jobs: jobOptions?.rows ?? [],
      workers: workerOptions?.rows ?? [],
      assignments: assignmentOptions?.rows ?? [],
      customers: customerOptions?.rows ?? []
    }
  };
}
