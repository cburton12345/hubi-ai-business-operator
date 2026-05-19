create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  display_name text not null,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'planned', 'connected', 'paused', 'error')),
  credentials_status text not null default 'not_configured'
    check (credentials_status in ('not_configured', 'configured', 'expired', 'invalid')),
  scopes_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  job_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_connections_tenant
  on public.integration_connections(tenant_id, provider);

create index if not exists idx_integration_jobs_tenant_created
  on public.integration_jobs(tenant_id, created_at desc);

alter table public.integration_connections enable row level security;
alter table public.integration_jobs enable row level security;

drop policy if exists integration_connections_tenant_admin on public.integration_connections;
create policy integration_connections_tenant_admin
on public.integration_connections
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists integration_jobs_tenant_operator on public.integration_jobs;
create policy integration_jobs_tenant_operator
on public.integration_jobs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
