create table if not exists public.customer_portal_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  public_token text not null unique,
  enabled boolean not null default true,
  expires_at timestamptz,
  last_viewed_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create index if not exists idx_customer_portal_access_token
  on public.customer_portal_access(public_token)
  where enabled = true;

create index if not exists idx_customer_portal_access_customer
  on public.customer_portal_access(tenant_id, customer_id);

alter table public.customer_portal_access enable row level security;

drop policy if exists customer_portal_access_tenant_operator on public.customer_portal_access;
create policy customer_portal_access_tenant_operator
on public.customer_portal_access
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
