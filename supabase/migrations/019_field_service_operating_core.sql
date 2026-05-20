create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  source_lead_id uuid references public.leads(id) on delete set null,
  name text not null,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  customer_type text not null default 'residential'
    check (customer_type in ('residential', 'commercial', 'property_manager', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'do_not_contact')),
  notes text,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_estimates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  source_lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent_manually', 'approved', 'declined', 'expired')),
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  customer_summary text,
  internal_notes text,
  manual_follow_up_draft text,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price_cents integer not null default 0,
  total_cents integer not null default 0,
  position integer not null default 0
);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  source_lead_id uuid references public.leads(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  title text not null,
  status text not null default 'unscheduled'
    check (status in ('unscheduled', 'scheduled', 'in_progress', 'completed', 'canceled', 'lost')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  service_address text,
  service_area text,
  assigned_user_id uuid references public.users(id) on delete set null,
  dispatcher_notes text,
  completion_notes text,
  ai_next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  job_id uuid references public.service_jobs(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent_manually', 'partially_paid', 'paid', 'void', 'overdue')),
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  due_date date,
  internal_notes text,
  manual_payment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.service_invoices(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price_cents integer not null default 0,
  total_cents integer not null default 0,
  position integer not null default 0
);

create index if not exists idx_customers_tenant_status on public.customers(tenant_id, status, created_at desc);
create index if not exists idx_service_estimates_tenant_status on public.service_estimates(tenant_id, status, created_at desc);
create index if not exists idx_service_jobs_tenant_status_schedule on public.service_jobs(tenant_id, status, scheduled_start);
create index if not exists idx_service_invoices_tenant_status on public.service_invoices(tenant_id, status, due_date);

alter table public.customers enable row level security;
alter table public.service_estimates enable row level security;
alter table public.estimate_line_items enable row level security;
alter table public.service_jobs enable row level security;
alter table public.service_invoices enable row level security;
alter table public.invoice_line_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'service_estimates',
    'estimate_line_items',
    'service_jobs',
    'service_invoices',
    'invoice_line_items'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;
