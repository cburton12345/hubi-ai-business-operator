create table if not exists public.brand_user_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'operator'
    check (role in ('owner', 'admin', 'operator', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'revoked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, user_id)
);

create index if not exists idx_brand_user_access_tenant_user
  on public.brand_user_access(tenant_id, user_id, status);

create index if not exists idx_brand_user_access_tenant_brand
  on public.brand_user_access(tenant_id, brand_id, status);

alter table public.brand_user_access enable row level security;

drop policy if exists brand_user_access_tenant_admin on public.brand_user_access;
create policy brand_user_access_tenant_admin
on public.brand_user_access
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
