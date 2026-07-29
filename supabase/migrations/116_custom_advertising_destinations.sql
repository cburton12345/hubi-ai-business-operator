create table if not exists public.marketing_advertising_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  platform_key text not null,
  display_name text not null,
  website_url text not null,
  destination_type text not null default 'other'
    check (destination_type in ('social', 'community', 'directory', 'marketplace', 'ad_network', 'publisher', 'website', 'other')),
  connection_mode text not null default 'manual_export'
    check (connection_mode in ('manual_export', 'byo_credentials', 'oauth_or_api_future')),
  status text not null default 'active'
    check (status in ('planned', 'active', 'paused', 'archived')),
  notes text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform_key)
);

create index if not exists marketing_advertising_destinations_tenant_idx
  on public.marketing_advertising_destinations(tenant_id, status, display_name);

alter table public.marketing_advertising_destinations enable row level security;

drop policy if exists marketing_advertising_destinations_tenant_operator
  on public.marketing_advertising_destinations;
create policy marketing_advertising_destinations_tenant_operator
on public.marketing_advertising_destinations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
