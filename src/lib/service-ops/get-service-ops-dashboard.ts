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
    overdueInvoices: number;
    openTasks: number;
    reviewRequestsDue: number;
    lowInventory: number;
    pipelineValue: string;
  };
  nextBestActions: {
    title: string;
    detail: string;
    href: string;
    urgency: "high" | "medium" | "low";
  }[];
  operationalTasks: {
    id: string;
    title: string;
    detail: string;
    nextStep: string;
    taskType: string;
    priority: string;
    status: string;
    dueAt: string | null;
    href: string;
  }[];
  customers: {
    id: string;
    name: string;
    contact: string;
    location: string;
    status: string;
    href: string;
  }[];
  estimates: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    followUpDraft: string;
    href: string;
  }[];
  jobs: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    schedule: string;
    assignedTo: string;
    nextAction: string;
    href: string;
  }[];
  invoices: {
    id: string;
    title: string;
    customerName: string;
    status: string;
    total: string;
    dueDate: string;
    href: string;
  }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unscheduled";
}

function taskHref(type: string | null, id: string | null) {
  if (!id) return "/app/service";
  if (type === "estimate") return `/app/service/estimates/${id}`;
  if (type === "job") return `/app/service/jobs/${id}`;
  if (type === "invoice") return `/app/service/invoices/${id}`;
  if (type === "customer") return `/app/service/customers/${id}`;
  if (type === "inventory_item") return "/app/service/inventory";
  return "/app/service";
}

export async function getServiceOpsDashboard(): Promise<ServiceOpsDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [counts, tasks, customers, estimates, jobs, invoices] = await Promise.all([
    queryPostgres<{
      customers: string;
      open_estimates: string;
      scheduled_jobs: string;
      unscheduled_jobs: string;
      unpaid_invoices: string;
      overdue_invoices: string;
      open_tasks: string;
      review_requests_due: string;
      low_inventory: string;
      pipeline_value: string | null;
    }>(
      `
      select
        (select count(*) from public.customers where tenant_id = $1 and status = 'active') as customers,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually')) as open_estimates,
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'scheduled') as scheduled_jobs,
        (select count(*) from public.service_jobs where tenant_id = $1 and status = 'unscheduled') as unscheduled_jobs,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('draft', 'sent_manually', 'partially_paid', 'overdue')) as unpaid_invoices,
        (
          select count(*) from public.service_invoices
          where tenant_id = $1 and status in ('sent_manually', 'partially_paid', 'overdue')
            and coalesce(due_date, created_at::date) <= current_date
            and amount_paid_cents < total_cents
        ) as overdue_invoices,
        (select count(*) from public.service_operational_tasks where tenant_id = $1 and status in ('open', 'scheduled')) as open_tasks,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status in ('draft', 'scheduled')) as review_requests_due,
        (
          select count(*) from public.service_inventory_items
          where tenant_id = $1 and status <> 'retired' and quantity <= reorder_threshold
        ) as low_inventory,
        (select coalesce(sum(total_cents), 0) from public.service_estimates where tenant_id = $1 and status in ('draft', 'sent_manually', 'approved')) as pipeline_value
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      detail: string;
      next_step: string;
      task_type: string;
      priority: string;
      status: string;
      due_at: string | null;
      primary_entity_type: string | null;
      primary_entity_id: string | null;
    }>(
      `
      select id, title, detail, next_step, task_type, priority, status, due_at::text,
        primary_entity_type, primary_entity_id::text
      from public.service_operational_tasks
      where tenant_id = $1 and status in ('open', 'scheduled')
      order by
        case priority when 'high' then 1 when 'medium' then 2 else 3 end,
        due_at asc nulls last,
        created_at desc
      limit 12
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
  const openTasks = Number(row?.open_tasks ?? 0);
  const unscheduledJobs = Number(row?.unscheduled_jobs ?? 0);
  const overdueInvoices = Number(row?.overdue_invoices ?? 0);
  const lowInventory = Number(row?.low_inventory ?? 0);
  const reviewRequestsDue = Number(row?.review_requests_due ?? 0);
  const nextBestActions = [
    openTasks > 0
      ? {
          title: `${openTasks} service task${openTasks === 1 ? "" : "s"} need action`,
          detail: "Start with the highest-priority task list below.",
          href: "/app/service",
          urgency: "high" as const
        }
      : null,
    unscheduledJobs > 0
      ? {
          title: `${unscheduledJobs} job${unscheduledJobs === 1 ? "" : "s"} need scheduling`,
          detail: "Put jobs on the calendar before they become missed revenue or customer frustration.",
          href: "/app/service",
          urgency: "high" as const
        }
      : null,
    overdueInvoices > 0
      ? {
          title: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`,
          detail: "Review payment follow-ups and keep cash collection visible.",
          href: "/app/service",
          urgency: "high" as const
        }
      : null,
    reviewRequestsDue > 0
      ? {
          title: `${reviewRequestsDue} review request${reviewRequestsDue === 1 ? "" : "s"} ready`,
          detail: "Ask real customers for reviews after completed work.",
          href: "/app/growth",
          urgency: "medium" as const
        }
      : null,
    lowInventory > 0
      ? {
          title: `${lowInventory} inventory item${lowInventory === 1 ? "" : "s"} low`,
          detail: "Check parts, materials, or equipment before field work is delayed.",
          href: "/app/service/inventory",
          urgency: "medium" as const
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    metrics: {
      customers: Number(row?.customers ?? 0),
      openEstimates: Number(row?.open_estimates ?? 0),
      scheduledJobs: Number(row?.scheduled_jobs ?? 0),
      unscheduledJobs,
      unpaidInvoices: Number(row?.unpaid_invoices ?? 0),
      overdueInvoices,
      openTasks,
      reviewRequestsDue,
      lowInventory,
      pipelineValue: formatMoney(Number(row?.pipeline_value ?? 0))
    },
    nextBestActions,
    operationalTasks: (tasks?.rows ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      nextStep: task.next_step,
      taskType: task.task_type,
      priority: task.priority,
      status: task.status,
      dueAt: task.due_at,
      href: taskHref(task.primary_entity_type, task.primary_entity_id)
    })),
    customers: (customers?.rows ?? []).map((customer) => ({
      id: customer.id,
      name: customer.name,
      contact: customer.email || customer.phone || "No contact",
      location: [customer.city, customer.state].filter(Boolean).join(", ") || "No location",
      status: customer.status,
      href: `/app/service/customers/${customer.id}`
    })),
    estimates: (estimates?.rows ?? []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      customerName: estimate.customer_name,
      status: estimate.status,
      total: formatMoney(estimate.total_cents),
      followUpDraft: estimate.manual_follow_up_draft ?? "",
      href: `/app/service/estimates/${estimate.id}`
    })),
    jobs: (jobs?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      customerName: job.customer_name,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      assignedTo: job.assigned_to ?? "Unassigned",
      nextAction: job.ai_next_action ?? "",
      href: `/app/service/jobs/${job.id}`
    })),
    invoices: (invoices?.rows ?? []).map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      customerName: invoice.customer_name,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date",
      href: `/app/service/invoices/${invoice.id}`
    }))
  };
}
