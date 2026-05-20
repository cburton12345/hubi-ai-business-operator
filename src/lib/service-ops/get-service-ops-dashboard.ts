import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceOpsDashboard = {
  metrics: {
    customers: number;
    openEstimates: number;
    scheduledJobs: number;
    unscheduledJobs: number;
    unpaidInvoices: number;
    pipelineValue: string;
  };
  customers: {
    id: string;
    name: string;
    contact: string;
    location: string;
    status: string;
  }[];
  estimates: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    followUpDraft: string;
  }[];
  jobs: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    schedule: string;
    assignedTo: string;
    nextAction: string;
  }[];
  invoices: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    dueDate: string;
  }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unscheduled";
}

export async function getServiceOpsDashboard(): Promise<ServiceOpsDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [counts, customers, estimates, jobs, invoices] = await Promise.all([
    queryPostgres<{
      customers: string;
      open_estimates: string;
      scheduled_jobs: string;
      unscheduled_jobs: string;
      unpaid_invoices: string;
      pipeline_value: string | null;
    }>(
      `
      select
        (select count(*) from public.customers where tenant_id = $1 and status = 'active') as customers,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually')) as open_estimates,
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'scheduled') as scheduled_jobs,
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'unscheduled') as unscheduled_jobs,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('draft', 'sent_manually', 'partially_paid', 'overdue')) as unpaid_invoices,
        (select coalesce(sum(total_cents), 0) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually', 'approved')) as pipeline_value
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      state: string | null;
      status: string;
    }>(
      "select id, name, email, phone, city, state, status from public.customers where tenant_id = $1 order by created_at desc limit 12",
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      status: string;
      total_cents: number;
      manual_follow_up_draft: string | null;
    }>(
      `
      select e.id, e.title, c.name as customer_name, e.status, e.total_cents, e.manual_follow_up_draft
      from public.service_estimates e
      join public.customers c on c.id = e.customer_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      status: string;
      scheduled_start: Date | null;
      assigned_to: string | null;
      ai_next_action: string | null;
    }>(
      `
      select j.id, j.title, c.name as customer_name, j.status, j.scheduled_start, u.name as assigned_to, j.ai_next_action
      from public.service_jobs j
      join public.customers c on c.id = j.customer_id
      left join public.users u on u.id = j.assigned_user_id
      where j.tenant_id = $1
      order by coalesce(j.scheduled_start, j.created_at) desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      customer_name: string;
      status: string;
      total_cents: number;
      due_date: Date | null;
    }>(
      `
      select i.id, i.title, c.name as customer_name, i.status, i.total_cents, i.due_date
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      where i.tenant_id = $1
      order by coalesce(i.due_date, i.created_at) desc
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const row = counts?.rows[0];
  return {
    metrics: {
      customers: Number(row?.customers ?? 0),
      openEstimates: Number(row?.open_estimates ?? 0),
      scheduledJobs: Number(row?.scheduled_jobs ?? 0),
      unscheduledJobs: Number(row?.unscheduled_jobs ?? 0),
      unpaidInvoices: Number(row?.unpaid_invoices ?? 0),
      pipelineValue: formatMoney(Number(row?.pipeline_value ?? 0))
    },
    customers: (customers?.rows ?? []).map((customer) => ({
      id: customer.id,
      name: customer.name,
      contact: customer.email || customer.phone || "No contact",
      location: [customer.city, customer.state].filter(Boolean).join(", ") || "No location",
      status: customer.status
    })),
    estimates: (estimates?.rows ?? []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      customerName: estimate.customer_name,
      status: estimate.status,
      total: formatMoney(estimate.total_cents),
      followUpDraft: estimate.manual_follow_up_draft ?? ""
    })),
    jobs: (jobs?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      customerName: job.customer_name,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      assignedTo: job.assigned_to ?? "Unassigned",
      nextAction: job.ai_next_action ?? ""
    })),
    invoices: (invoices?.rows ?? []).map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      customerName: invoice.customer_name,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date"
    }))
  };
}
