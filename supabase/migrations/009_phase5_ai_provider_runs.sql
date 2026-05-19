create table if not exists public.ai_provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'openai',
  model text not null default 'configured-by-env',
  status text not null default 'ready'
    check (status in ('ready', 'disabled', 'missing_credentials')),
  fallback_enabled boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.ai_generation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider text not null,
  model text not null,
  run_type text not null,
  status text not null
    check (status in ('completed', 'fallback', 'failed')),
  prompt_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  fallback_used boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_generation_runs_tenant_created
  on public.ai_generation_runs(tenant_id, created_at desc);

alter table public.ai_provider_settings enable row level security;
alter table public.ai_generation_runs enable row level security;

drop policy if exists ai_provider_settings_tenant_operator on public.ai_provider_settings;
create policy ai_provider_settings_tenant_operator
on public.ai_provider_settings
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists ai_generation_runs_tenant_operator on public.ai_generation_runs;
create policy ai_generation_runs_tenant_operator
on public.ai_generation_runs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
