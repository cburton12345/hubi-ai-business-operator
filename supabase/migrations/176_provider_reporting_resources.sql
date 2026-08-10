create table if not exists public.provider_reporting_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider_key text not null check (provider_key in ('search_console','analytics')),
  resource_type text not null,
  external_id text not null,
  display_name text not null,
  selected boolean not null default false,
  status text not null default 'available' check (status in ('available','selected','needs_attention','disconnected')),
  last_synced_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_id)
);

create table if not exists public.provider_reporting_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null references public.provider_reporting_resources(id) on delete cascade,
  provider_key text not null check (provider_key in ('search_console','analytics')),
  metric_date date not null,
  dimension_key text not null default 'all',
  dimension_value text not null default 'all',
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, metric_date, dimension_key, dimension_value)
);

create index if not exists provider_reporting_resources_tenant_idx
  on public.provider_reporting_resources (tenant_id, provider_key, selected desc);
create index if not exists provider_reporting_metrics_tenant_date_idx
  on public.provider_reporting_metrics_daily (tenant_id, provider_key, metric_date desc);

alter table public.provider_reporting_resources enable row level security;
alter table public.provider_reporting_metrics_daily enable row level security;

drop policy if exists provider_reporting_resources_tenant on public.provider_reporting_resources;
create policy provider_reporting_resources_tenant on public.provider_reporting_resources for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists provider_reporting_metrics_tenant on public.provider_reporting_metrics_daily;
create policy provider_reporting_metrics_tenant on public.provider_reporting_metrics_daily for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.provider_reporting_resources is
  'Tenant-selected read-only Search Console sites and GA4 properties; never a platform-global property ID.';
