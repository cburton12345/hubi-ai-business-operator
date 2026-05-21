import { queryPostgres } from "@/lib/db/postgres";
import { centsToDollars, formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceEstimateDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  total: string;
  customerSummary: string;
  internalNotes: string;
  followUpDraft: string;
  lineItems: { id: string; name: string; description: string; quantity: string; unitPrice: string; unitPriceValue: string; total: string }[];
};

export type ServiceJobDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  schedule: string;
  serviceArea: string;
  dispatcherNotes: string;
  completionNotes: string;
  nextAction: string;
};

export type ServiceInvoiceDetail = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: string;
  total: string;
  amountPaid: string;
  dueDate: string;
  internalNotes: string;
  paymentNotes: string;
  lineItems: { id: string; name: string; description: string; quantity: string; unitPrice: string; unitPriceValue: string; total: string }[];
};

function formatDateTime(start: Date | null, end: Date | null) {
  if (!start) return "Unscheduled";
  const first = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(start);
  const second = end ? new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(end) : "";
  return second ? `${first} - ${second}` : first;
}

export async function getServiceEstimateDetail(estimateId: string): Promise<ServiceEstimateDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [estimateResult, itemsResult] = await Promise.all([
    queryPostgres<{
      id: string;
      customer_id: string;
      customer_name: string;
      title: string;
      status: string;
      total_cents: number;
      customer_summary: string | null;
      internal_notes: string | null;
      manual_follow_up_draft: string | null;
    }>(
      `
      select e.id, e.customer_id, c.name as customer_name, e.title, e.status, e.total_cents, e.customer_summary, e.internal_notes, e.manual_follow_up_draft
      from public.service_estimates e
      join public.customers c on c.id = e.customer_id
      where e.tenant_id = $1 and e.id = $2
      limit 1
      `,
      [workspaceId, estimateId]
    ),
    queryPostgres<{ id: string; name: string; description: string | null; quantity: string; unit_price_cents: number; total_cents: number }>(
      `
      select id, name, description, quantity::text, unit_price_cents, total_cents
      from public.estimate_line_items
      where tenant_id = $1 and estimate_id = $2
      order by position, name
      `,
      [workspaceId, estimateId]
    )
  ]);
  const estimate = estimateResult?.rows[0];
  if (!estimate) return null;

  return {
    id: estimate.id,
    customerId: estimate.customer_id,
    customerName: estimate.customer_name,
    title: estimate.title,
    status: estimate.status,
    total: formatMoney(estimate.total_cents),
    customerSummary: estimate.customer_summary ?? "",
    internalNotes: estimate.internal_notes ?? "",
    followUpDraft: estimate.manual_follow_up_draft ?? "",
    lineItems: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: formatMoney(item.unit_price_cents),
      unitPriceValue: centsToDollars(item.unit_price_cents),
      total: formatMoney(item.total_cents)
    }))
  };
}

export async function getServiceJobDetail(jobId: string): Promise<ServiceJobDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    customer_id: string;
    customer_name: string;
    title: string;
    status: string;
    scheduled_start: Date | null;
    scheduled_end: Date | null;
    service_area: string | null;
    dispatcher_notes: string | null;
    completion_notes: string | null;
    ai_next_action: string | null;
  }>(
    `
    select j.id, j.customer_id, c.name as customer_name, j.title, j.status, j.scheduled_start, j.scheduled_end, j.service_area, j.dispatcher_notes, j.completion_notes, j.ai_next_action
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id
    where j.tenant_id = $1 and j.id = $2
    limit 1
    `,
    [workspaceId, jobId]
  );
  const job = result?.rows[0];
  if (!job) return null;

  return {
    id: job.id,
    customerId: job.customer_id,
    customerName: job.customer_name,
    title: job.title,
    status: job.status,
    schedule: formatDateTime(job.scheduled_start, job.scheduled_end),
    serviceArea: job.service_area ?? "",
    dispatcherNotes: job.dispatcher_notes ?? "",
    completionNotes: job.completion_notes ?? "",
    nextAction: job.ai_next_action ?? ""
  };
}

export async function getServiceInvoiceDetail(invoiceId: string): Promise<ServiceInvoiceDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [invoiceResult, itemsResult] = await Promise.all([
    queryPostgres<{
      id: string;
      customer_id: string;
      customer_name: string;
      title: string;
      status: string;
      total_cents: number;
      amount_paid_cents: number;
      due_date: Date | null;
      internal_notes: string | null;
      manual_payment_notes: string | null;
    }>(
      `
      select i.id, i.customer_id, c.name as customer_name, i.title, i.status, i.total_cents, i.amount_paid_cents, i.due_date, i.internal_notes, i.manual_payment_notes
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      where i.tenant_id = $1 and i.id = $2
      limit 1
      `,
      [workspaceId, invoiceId]
    ),
    queryPostgres<{ id: string; name: string; description: string | null; quantity: string; unit_price_cents: number; total_cents: number }>(
      `
      select id, name, description, quantity::text, unit_price_cents, total_cents
      from public.invoice_line_items
      where tenant_id = $1 and invoice_id = $2
      order by position, name
      `,
      [workspaceId, invoiceId]
    )
  ]);
  const invoice = invoiceResult?.rows[0];
  if (!invoice) return null;

  return {
    id: invoice.id,
    customerId: invoice.customer_id,
    customerName: invoice.customer_name,
    title: invoice.title,
    status: invoice.status,
    total: formatMoney(invoice.total_cents),
    amountPaid: formatMoney(invoice.amount_paid_cents),
    dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date",
    internalNotes: invoice.internal_notes ?? "",
    paymentNotes: invoice.manual_payment_notes ?? "",
    lineItems: (itemsResult?.rows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: item.quantity,
      unitPrice: formatMoney(item.unit_price_cents),
      unitPriceValue: centsToDollars(item.unit_price_cents),
      total: formatMoney(item.total_cents)
    }))
  };
}
