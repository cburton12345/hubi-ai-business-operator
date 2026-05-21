create table if not exists public.recurring_service_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  service_type text,
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'canceled')),
  next_service_date date,
  price_cents integer not null default 0,
  internal_notes text,
  ai_next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_service_plans_tenant_status
  on public.recurring_service_plans(tenant_id, status, next_service_date);

create index if not exists idx_recurring_service_plans_customer
  on public.recurring_service_plans(tenant_id, customer_id);

alter table public.recurring_service_plans enable row level security;

drop policy if exists recurring_service_plans_tenant_operator on public.recurring_service_plans;
create policy recurring_service_plans_tenant_operator
on public.recurring_service_plans
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
