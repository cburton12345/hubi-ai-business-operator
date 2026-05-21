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
  estimates: { id: string; title: string; status: string; total: string; href: string }[];
  jobs: { id: string; title: string; status: string; schedule: string; nextAction: string; href: string }[];
  invoices: { id: string; title: string; status: string; total: string; dueDate: string; href: string }[];
  timeline: {
    id: string;
    type: string;
    title: string;
    body: string;
    occurredAt: string;
    href?: string;
    status?: string;
  }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unscheduled";
}

function formatTimelineDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const customerResult = await queryPostgres<{
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
    created_at: Date;
  }>(
    `
    select id, name, email, phone, city, state, status, notes, ai_summary, source_lead_id, created_at
    from public.customers
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [workspaceId, customerId]
  );

  const customer = customerResult?.rows[0];
  if (!customer) return null;

  const [sourceLeadResult, leadEventsResult, estimatesResult, jobsResult, invoicesResult] = await Promise.all([
    customer.source_lead_id
      ? queryPostgres<{
          id: string;
          status: string;
          source: string | null;
          source_detail: string | null;
          message: string | null;
          created_at: Date;
        }>(
          `
          select id, status, source, source_detail, message, created_at
          from public.leads
          where tenant_id = $1 and id = $2
          limit 1
          `,
          [workspaceId, customer.source_lead_id]
        )
      : Promise.resolve({ rows: [] }),
    customer.source_lead_id
      ? queryPostgres<{ id: string; type: string; body: string | null; created_at: Date }>(
          `
          select id, type, body, created_at
          from public.lead_events
          where tenant_id = $1 and lead_id = $2
          order by created_at desc
          limit 20
          `,
          [workspaceId, customer.source_lead_id]
        )
      : Promise.resolve({ rows: [] }),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; created_at: Date }>(
      `
      select id, title, status, total_cents, created_at
      from public.service_estimates
      where tenant_id = $1 and customer_id = $2
      order by created_at desc
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; title: string; status: string; scheduled_start: Date | null; ai_next_action: string | null; created_at: Date }>(
      `
      select id, title, status, scheduled_start, ai_next_action, created_at
      from public.service_jobs
      where tenant_id = $1 and customer_id = $2
      order by coalesce(scheduled_start, created_at) desc
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; due_date: Date | null; created_at: Date }>(
      `
      select id, title, status, total_cents, due_date, created_at
      from public.service_invoices
      where tenant_id = $1 and customer_id = $2
      order by coalesce(due_date, created_at) desc
      `,
      [workspaceId, customerId]
    )
  ]);

  const estimates = estimatesResult?.rows ?? [];
  const jobs = jobsResult?.rows ?? [];
  const invoices = invoicesResult?.rows ?? [];
  const sourceLead = sourceLeadResult?.rows[0];
  const leadEvents = leadEventsResult?.rows ?? [];
  const timeline = [
    {
      id: `customer-${customer.id}`,
      type: "customer",
      title: "Customer record created",
      body: customer.ai_summary || customer.notes || "Customer profile started in this workspace.",
      occurredAtDate: customer.created_at,
      href: `/app/service/customers/${customer.id}`,
      status: customer.status
    },
    ...(sourceLead
      ? [
          {
            id: `lead-${sourceLead.id}`,
            type: "lead",
            title: "Source lead captured",
            body: [sourceLead.source, sourceLead.source_detail, sourceLead.message].filter(Boolean).join(" / ") || "Lead captured before customer conversion.",
            occurredAtDate: sourceLead.created_at,
            href: `/app/leads/${sourceLead.id}`,
            status: sourceLead.status
          }
        ]
      : []),
    ...leadEvents.map((event) => ({
      id: `lead-event-${event.id}`,
      type: "lead event",
      title: event.type.replaceAll("_", " "),
      body: event.body || "Lead activity recorded.",
      occurredAtDate: event.created_at,
      href: customer.source_lead_id ? `/app/leads/${customer.source_lead_id}` : undefined,
      status: undefined
    })),
    ...estimates.map((estimate) => ({
      id: `estimate-${estimate.id}`,
      type: "estimate",
      title: estimate.title,
      body: `Estimate total ${formatMoney(estimate.total_cents)}.`,
      occurredAtDate: estimate.created_at,
      href: `/app/service/estimates/${estimate.id}`,
      status: estimate.status
    })),
    ...jobs.map((job) => ({
      id: `job-${job.id}`,
      type: "job",
      title: job.title,
      body: job.scheduled_start ? `Scheduled for ${formatDate(job.scheduled_start)}.` : job.ai_next_action || "Job created and waiting for scheduling.",
      occurredAtDate: job.scheduled_start ?? job.created_at,
      href: `/app/service/jobs/${job.id}`,
      status: job.status
    })),
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "invoice",
      title: invoice.title,
      body: `Invoice total ${formatMoney(invoice.total_cents)}${invoice.due_date ? `, due ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date)}` : ""}.`,
      occurredAtDate: invoice.due_date ?? invoice.created_at,
      href: `/app/service/invoices/${invoice.id}`,
      status: invoice.status
    }))
  ]
    .sort((a, b) => b.occurredAtDate.getTime() - a.occurredAtDate.getTime())
    .map(({ occurredAtDate, ...item }) => ({
      ...item,
      occurredAt: formatTimelineDate(occurredAtDate)
    }));

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
    estimates: estimates.map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      status: estimate.status,
      total: formatMoney(estimate.total_cents),
      href: `/app/service/estimates/${estimate.id}`
    })),
    jobs: jobs.map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      nextAction: job.ai_next_action ?? "",
      href: `/app/service/jobs/${job.id}`
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      dueDate: invoice.due_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(invoice.due_date) : "No due date",
      href: `/app/service/invoices/${invoice.id}`
    })),
    timeline
  };
}
