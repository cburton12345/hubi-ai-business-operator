import { queryPostgres } from "@/lib/db/postgres";
import { formatMoney } from "@/lib/service-ops/money";

export type CustomerPortal = {
  customerName: string;
  organizationName: string;
  status: string;
  contact: string;
  location: string;
  estimates: { id: string; title: string; status: string; total: string; createdAt: string }[];
  jobs: { id: string; title: string; status: string; schedule: string; serviceAddress: string }[];
  invoices: { id: string; title: string; status: string; total: string; dueDate: string; amountPaid: string }[];
  recurringPlans: { id: string; title: string; frequency: string; nextServiceDate: string; price: string }[];
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

  const [estimatesResult, jobsResult, invoicesResult, recurringPlansResult] = await Promise.all([
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; created_at: Date }>(
      `
      select id, title, status, total_cents, created_at
      from public.service_estimates
      where tenant_id = $1 and customer_id = $2 and status in ('sent_manually', 'approved', 'declined', 'expired')
      order by created_at desc
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
    queryPostgres<{ id: string; title: string; status: string; total_cents: number; amount_paid_cents: number; due_date: Date | null }>(
      `
      select id, title, status, total_cents, amount_paid_cents, due_date
      from public.service_invoices
      where tenant_id = $1 and customer_id = $2 and status <> 'void'
      order by coalesce(due_date, created_at) desc
      limit 20
      `,
      [access.tenant_id, access.customer_id]
    ),
    queryPostgres<{ id: string; title: string; frequency: string; next_service_date: Date | null; price_cents: number }>(
      `
      select id, title, frequency, next_service_date, price_cents
      from public.recurring_service_plans
      where tenant_id = $1 and customer_id = $2 and status = 'active'
      order by coalesce(next_service_date, created_at) asc
      limit 10
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
    estimates: (estimatesResult?.rows ?? []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      status: estimate.status,
      total: formatMoney(estimate.total_cents),
      createdAt: formatDate(estimate.created_at)
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
      amountPaid: formatMoney(invoice.amount_paid_cents)
    })),
    recurringPlans: (recurringPlansResult?.rows ?? []).map((plan) => ({
      id: plan.id,
      title: plan.title,
      frequency: plan.frequency,
      nextServiceDate: formatDay(plan.next_service_date),
      price: formatMoney(plan.price_cents)
    }))
  };
}
