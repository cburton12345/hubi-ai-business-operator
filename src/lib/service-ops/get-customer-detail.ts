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
  portal: {
    enabled: boolean;
    url: string;
    lastViewedAt: string;
  } | null;
  estimates: { id: string; title: string; status: string; total: string; href: string }[];
  jobs: { id: string; title: string; status: string; schedule: string; nextAction: string; href: string }[];
  invoices: { id: string; title: string; status: string; total: string; dueDate: string; href: string }[];
  recurringPlans: { id: string; title: string; status: string; frequency: string; nextServiceDate: string; price: string; nextAction: string }[];
  membershipPrograms: { id: string; name: string; frequency: string; price: string; priceValue: string; visitsPerYear: number }[];
  locations: { id: string; name: string; address: string; type: string; access: string; primary: boolean }[];
  assets: { id: string; name: string; detail: string; condition: string; warranty: string }[];
  tags: { id: string; name: string; color: string }[];
  duplicateCandidates: { id: string; name: string; reason: string; status: string }[];
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

  const [portalResult, sourceLeadResult, leadEventsResult, estimatesResult, jobsResult, invoicesResult, recurringPlansResult, membershipProgramsResult, locationsResult, assetsResult, tagsResult, duplicatesResult] = await Promise.all([
    queryPostgres<{ public_token: string; enabled: boolean; last_viewed_at: Date | null }>(
      `
      select public_token, enabled, last_viewed_at
      from public.customer_portal_access
      where tenant_id = $1 and customer_id = $2
      limit 1
      `,
      [workspaceId, customerId]
    ),
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
    ),
    queryPostgres<{
      id: string;
      title: string;
      status: string;
      frequency: string;
      next_service_date: Date | null;
      price_cents: number;
      ai_next_action: string | null;
      created_at: Date;
    }>(
      `
      select id, title, status, frequency, next_service_date, price_cents, ai_next_action, created_at
      from public.recurring_service_plans
      where tenant_id = $1 and customer_id = $2
      order by coalesce(next_service_date, created_at) asc
      `,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; name: string; billing_frequency: string; price_cents: number; visits_per_year: number }>(
      `
      select id, name, billing_frequency, price_cents, visits_per_year
      from public.membership_programs
      where tenant_id = $1 and active = true
      order by name
      `,
      [workspaceId]
    ),
    queryPostgres<{ id: string; name: string; location_type: string; address_line1: string | null; city: string | null; state: string | null; access_instructions: string | null; is_primary: boolean }>(
      `select id, name, location_type, address_line1, city, state, access_instructions, is_primary
       from public.customer_locations where tenant_id = $1 and customer_id = $2 and active = true
       order by is_primary desc, name`,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; name: string; manufacturer: string | null; model: string | null; serial_number: string | null; condition: string; warranty_expires_at: Date | null }>(
      `select id, name, manufacturer, model, serial_number, condition, warranty_expires_at
       from public.customer_assets where tenant_id = $1 and customer_id = $2 and status = 'active'
       order by name`,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; name: string; color: string | null }>(
      `select t.id, t.name, t.color from public.customer_tags t
       join public.customer_tag_assignments a on a.tag_id = t.id and a.tenant_id = t.tenant_id
       where a.tenant_id = $1 and a.customer_id = $2 order by t.name`,
      [workspaceId, customerId]
    ),
    queryPostgres<{ id: string; name: string; email: string | null; phone: string | null; status: string }>(
      `
      select d.id, d.name, d.email, d.phone, d.status
      from public.customers d
      where d.tenant_id = $1 and d.id <> $2 and d.status <> 'do_not_contact'
        and (
          ($3::text is not null and lower(d.email) = lower($3)) or
          ($4::text is not null and regexp_replace(d.phone, '\\D', '', 'g') <> ''
            and regexp_replace(d.phone, '\\D', '', 'g') = regexp_replace($4, '\\D', '', 'g'))
        )
      order by d.created_at
      limit 10
      `,
      [workspaceId, customerId, customer.email, customer.phone]
    )
  ]);

  const estimates = estimatesResult?.rows ?? [];
  const jobs = jobsResult?.rows ?? [];
  const invoices = invoicesResult?.rows ?? [];
  const recurringPlans = recurringPlansResult?.rows ?? [];
  const portalAccess = portalResult?.rows[0];
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
    })),
    ...recurringPlans.map((plan) => ({
      id: `recurring-plan-${plan.id}`,
      type: "recurring plan",
      title: plan.title,
      body: `${plan.frequency} service plan${plan.next_service_date ? `, next service ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(plan.next_service_date)}` : ""}.`,
      occurredAtDate: plan.next_service_date ?? plan.created_at,
      href: `/app/service/customers/${customer.id}`,
      status: plan.status
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
    portal: portalAccess
      ? {
          enabled: portalAccess.enabled,
          url: `/portal/${portalAccess.public_token}`,
          lastViewedAt: portalAccess.last_viewed_at ? formatTimelineDate(portalAccess.last_viewed_at) : "Not viewed yet"
        }
      : null,
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
    recurringPlans: recurringPlans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      status: plan.status,
      frequency: plan.frequency,
      nextServiceDate: plan.next_service_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(plan.next_service_date) : "Not scheduled",
      price: formatMoney(plan.price_cents),
      nextAction: plan.ai_next_action ?? ""
    })),
    membershipPrograms: (membershipProgramsResult?.rows ?? []).map((program) => ({
      id: program.id,
      name: program.name,
      frequency: program.billing_frequency,
      price: formatMoney(program.price_cents),
      priceValue: (program.price_cents / 100).toFixed(2),
      visitsPerYear: program.visits_per_year
    })),
    locations: (locationsResult?.rows ?? []).map((location) => ({
      id: location.id,
      name: location.name,
      address: [location.address_line1, location.city, location.state].filter(Boolean).join(", ") || "Address not listed",
      type: location.location_type,
      access: location.access_instructions ?? "",
      primary: location.is_primary
    })),
    assets: (assetsResult?.rows ?? []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      detail: [asset.manufacturer, asset.model, asset.serial_number ? `S/N ${asset.serial_number}` : null].filter(Boolean).join(" / ") || "No equipment detail",
      condition: asset.condition,
      warranty: asset.warranty_expires_at ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(asset.warranty_expires_at) : "No warranty date"
    })),
    tags: (tagsResult?.rows ?? []).map((tag) => ({ id: tag.id, name: tag.name, color: tag.color ?? "" })),
    duplicateCandidates: (duplicatesResult?.rows ?? []).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      reason:
        customer.email && candidate.email?.toLowerCase() === customer.email.toLowerCase()
          ? `Same email: ${customer.email}`
          : `Same phone: ${customer.phone}`,
      status: candidate.status
    })),
    timeline
  };
}
