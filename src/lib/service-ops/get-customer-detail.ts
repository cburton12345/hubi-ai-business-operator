import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type CustomerDetail = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
  notes: string;
  aiSummary: string;
  sourceLeadId: string;
  estimates: { id: string; title: string; status: string; total: string }[];
  jobs: { id: string; title: string; status: string; schedule: string; nextAction: string }[];
  invoices: { id: string; title: string; status: string; total: string; dueDate: string }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unscheduled";
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const [customerResult, estimatesResult, jobsResult, invoicesResult] = await Promise.all([
    queryPostgres<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      state: string | null;
      status: string;
      notes: string | null;
      ai_summary: string | null;
      source_lead_id: string | null;
    }>(
      `
      select id, name, email, phone, city, state, status, notes, ai_summary, source_lead_id
      from public.customers
      where tenant_id = $1 and id = $2
      limit 1
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number }>(
      `
      select id, title, status, total_cents
      from public.service_estimates
      where tenant_id = $1 and customer_id = $2
      order by created_at desc
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; title: string; status: string; scheduled_start: Date | null; ai_next_action: string | null }>(
      `
      select id, title, status, scheduled_start, ai_next_action
      from public.service_jobs
      where tenant_id = $1 and customer_id = $2
      order by coalesce(scheduled_start, created_at) desc
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; due_date: Date | null }>(
      `
      select id, title, status, total_cents, due_date
      from public.service_invoices
      where tenant_id = $1 and customer_id = $2
      order by coalesce(due_date, created_at) desc
      `,
      [workspaceId, customerId]
    )
  ]);

  const customer = customerResult?.rows[0];
  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    location: [customer.city, customer.state].filter(Boolean).join(", ") || "No location",
    status: customer.status,
    notes: customer.notes ?? "",
    aiSummary: customer.ai_summary ?? "",
    sourceLeadId: customer.source_lead_id ?? "",
    estimates: (estimatesResult?.rows ?? []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      status: estimate.status,
      total: formatMoney(estimate.total_cents)
    })),
    jobs: (jobsResult?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      nextAction: job.ai_next_action ?? ""
    })),
    invoices: (invoicesResult?.rows ?? []).map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date"
    }))
  };
}
