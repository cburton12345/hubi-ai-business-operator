create table if not exists public.provider_integration_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by_user_id uuid references public.users(id) on delete set null,
  provider_name text not null,
  provider_url text,
  capability_category text not null
    check (capability_category in ('sms', 'voice', 'video', 'image', 'email', 'storage', 'payments', 'accounting', 'calendar', 'advertising', 'other')),
  use_case text not null,
  currently_using boolean not null default false,
  status text not null default 'requested'
    check (status in ('requested', 'researching', 'planned', 'building', 'available', 'declined')),
  request_count integer not null default 1 check (request_count > 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_name, capability_category)
);

create index if not exists idx_provider_integration_requests_demand
  on public.provider_integration_requests(capability_category, status, request_count desc, updated_at desc);

alter table public.provider_integration_requests enable row level security;

drop policy if exists provider_integration_requests_tenant_select on public.provider_integration_requests;
create policy provider_integration_requests_tenant_select
on public.provider_integration_requests
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists provider_integration_requests_tenant_insert on public.provider_integration_requests;
create policy provider_integration_requests_tenant_insert
on public.provider_integration_requests
for insert
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists provider_integration_requests_tenant_update on public.provider_integration_requests;
create policy provider_integration_requests_tenant_update
on public.provider_integration_requests
for update
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
