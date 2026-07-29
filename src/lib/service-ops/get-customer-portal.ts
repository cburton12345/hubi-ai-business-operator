import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";

export type CustomerPortal = {
  customerName: string;
  organizationName: string;
  status: string;
  contact: string;
  location: string;
  locations: { id: string; label: string; address: string; accessInstructions: string }[];
  assets: { id: string; name: string; detail: string; warranty: string }[];
  estimates: { id: string; title: string; status: string; total: string; createdAt: string; url: string }[];
  visits: { id: string; title: string; status: string; schedule: string; address: string }[];
  jobs: { id: string; title: string; status: string; schedule: string; serviceAddress: string }[];
  invoices: { id: string; title: string; status: string; total: string; dueDate: string; amountPaid: string; paymentUrl: string }[];
  recurringPlans: { id: string; title: string; frequency: string; nextServiceDate: string; price: string; renewal: string }[];
  requests: { id: string; subject: string; details: string; type: string; status: string; createdAt: string }[];
  messages: { id: string; body: string; direction: string; createdAt: string }[];
  documents: { id: string; title: string; type: string; url: string; createdAt: string }[];
};

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Not scheduled";
}

function formatDay(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(value) : "No due date";
}

export async function getCustomerPortal(publicToken: string): Promise<CustomerPortal | null> {
  const accessResult = await queryPostgres<{
    tenant_id: string;
    customer_id: string;
    customer_name: string;
    organization_name: string;
    status: string;
    email: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
  }>(
    `
    select
      c.tenant_id,
      c.id as customer_id,
      c.name as customer_name,
      t.name as organization_name,
      c.status,
      c.email,
      c.phone,
      c.address_line1,
      c.city,
      c.state
    from public.customer_portal_access a
    join public.customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
    join public.tenants t on t.id = a.tenant_id
    where a.public_token = $1
      and a.enabled = true
      and (a.expires_at is null or a.expires_at > now())
    limit 1
    `,
    [publicToken]
  );

  const access = accessResult?.rows[0];
  if (!access) return null;

  await queryPostgres("update public.customer_portal_access set last_viewed_at = now(), updated_at = now() where public_token = $1", [
    publicToken
  ]);

  const [locationsResult, assetsResult, estimatesResult, visitsResult, jobsResult, invoicesResult, recurringPlansResult, requestsResult, messagesResult, documentsResult] = await Promise.all([
    queryPostgres<{ id: string; label: string; address_line1: string | null; city: string | null; state: string | null; access_instructions: string | null }>(
      `
      select id, name as label, address_line1, city, state, access_instructions
      from public.customer_locations
      where tenant_id = $1 and customer_id = $2 and status = 'active'
      order by is_primary desc, label
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; name: string; manufacturer: string | null; model: string | null; serial_number: string | null; warranty_expires_at: Date | null }>(
      `
      select id, name, manufacturer, model, serial_number, warranty_expires_at
      from public.customer_assets
      where tenant_id = $1 and customer_id = $2 and active = true
      order by name
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; created_at: Date; public_token: string | null }>(
      `
      select e.id, e.title, e.status, e.total_cents, e.created_at, l.public_token
      from public.service_estimates e
      left join public.estimate_share_links l on l.estimate_id = e.id and l.tenant_id = e.tenant_id
        and l.status not in ('draft', 'revoked')
      where e.tenant_id = $1 and e.customer_id = $2 and e.status in ('sent_manually', 'approved', 'declined', 'expired')
      order by e.created_at desc
      limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; status: string; scheduled_start: Date | null; address_line1: string | null; city: string | null; state: string | null }>(
      `
      select v.id, w.title, v.status, v.scheduled_start, l.address_line1, l.city, l.state
      from public.service_visits v
      join public.service_work_orders w on w.id = v.work_order_id and w.tenant_id = v.tenant_id
      left join public.customer_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
      where v.tenant_id = $1 and v.customer_id = $2 and v.status <> 'canceled'
      order by coalesce(v.scheduled_start, v.created_at) desc
      limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; status: string; scheduled_start: Date | null; service_address: string | null }>(
      `
      select id, title, status, scheduled_start, service_address
      from public.service_jobs
      where tenant_id = $1 and customer_id = $2 and status <> 'lost'
      order by coalesce(scheduled_start, created_at) desc
      limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; amount_paid_cents: number; due_date: Date | null; payment_url: string | null }>(
      `
      select i.id, i.title, i.status, i.total_cents, i.amount_paid_cents, i.due_date,
        (select p.payment_url from public.service_invoice_payment_links p
          where p.tenant_id = i.tenant_id and p.invoice_id = i.id
            and p.status in ('ready', 'sent')
          order by p.created_at desc limit 1) as payment_url
      from public.service_invoices i
      where i.tenant_id = $1 and i.customer_id = $2 and i.status <> 'void'
      order by coalesce(i.due_date, i.created_at) desc
      limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; frequency: string; next_service_date: Date | null; price_cents: number; renews_at: Date | null }>(
      `
      select id, title, frequency, next_service_date, price_cents, renews_at
      from public.recurring_service_plans
      where tenant_id = $1 and customer_id = $2 and status = 'active'
      order by coalesce(next_service_date, created_at) asc
      limit 10
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; subject: string; details: string | null; request_type: string; status: string; created_at: Date }>(
      `
      select id, subject, details, request_type, status, created_at
      from public.customer_portal_requests
      where tenant_id = $1 and customer_id = $2
      order by created_at desc limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; body: string; direction: string; created_at: Date }>(
      `
      select id, body, direction, created_at
      from public.customer_portal_messages
      where tenant_id = $1 and customer_id = $2
      order by created_at desc limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; document_type: string; external_url: string | null; created_at: Date }>(
      `
      select id, title, document_type, external_url, created_at
      from public.customer_portal_documents
      where tenant_id = $1 and customer_id = $2 and customer_visible = true
      order by created_at desc limit 20
      `,
      [access.tenant_id, access.customer_id]
    )
  ]);

  return {
    customerName: access.customer_name,
    organizationName: access.organization_name,
    status: access.status,
    contact: access.email || access.phone || "Contact the business directly",
    location: [access.address_line1, access.city, access.state].filter(Boolean).join(", ") || "No service address on file",
    locations: (locationsResult?.rows ?? []).map((location) => ({
      id: location.id,
      label: location.label,
      address: [location.address_line1, location.city, location.state].filter(Boolean).join(", ") || "Address not listed",
      accessInstructions: location.access_instructions ?? ""
    })),
    assets: (assetsResult?.rows ?? []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      detail: [asset.manufacturer, asset.model, asset.serial_number ? `S/N ${asset.serial_number}` : null].filter(Boolean).join(" / ") || "No equipment details",
      warranty: asset.warranty_expires_at ? `Warranty through ${formatDay(asset.warranty_expires_at)}` : "No warranty date on file"
    })),
    estimates: (estimatesResult?.rows ?? []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      status: estimate.status,
      total: formatMoney(estimate.total_cents),
      createdAt: formatDate(estimate.created_at),
      url: estimate.public_token ? `/estimate/${estimate.public_token}` : ""
    })),
    visits: (visitsResult?.rows ?? []).map((visit) => ({
      id: visit.id,
      title: visit.title,
      status: visit.status,
      schedule: formatDate(visit.scheduled_start),
      address: [visit.address_line1, visit.city, visit.state].filter(Boolean).join(", ") || "Address not listed"
    })),
    jobs: (jobsResult?.rows ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      schedule: formatDate(job.scheduled_start),
      serviceAddress: job.service_address || access.address_line1 || "Address not listed"
    })),
    invoices: (invoicesResult?.rows ?? []).map((invoice) => ({
      id: invoice.id,
      title: invoice.title,
      status: invoice.status,
      total: formatMoney(invoice.total_cents),
      dueDate: formatDay(invoice.due_date),
      amountPaid: formatMoney(invoice.amount_paid_cents),
      paymentUrl: invoice.payment_url ?? ""
    })),
    recurringPlans: (recurringPlansResult?.rows ?? []).map((plan) => ({
      id: plan.id,
      title: plan.title,
      frequency: plan.frequency,
      nextServiceDate: formatDay(plan.next_service_date),
      price: formatMoney(plan.price_cents),
      renewal: formatDay(plan.renews_at)
    })),
    requests: (requestsResult?.rows ?? []).map((request) => ({
      id: request.id,
      subject: request.subject,
      details: request.details ?? "",
      type: request.request_type,
      status: request.status,
      createdAt: formatDate(request.created_at)
    })),
    messages: (messagesResult?.rows ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      direction: message.direction,
      createdAt: formatDate(message.created_at)
    })),
    documents: (documentsResult?.rows ?? []).map((document) => ({
      id: document.id,
      title: document.title,
      type: document.document_type,
      url: document.external_url ?? "",
      createdAt: formatDate(document.created_at)
    }))
  };
}
