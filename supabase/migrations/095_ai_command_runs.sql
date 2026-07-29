create table if not exists public.ai_command_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  command text not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'needs_attention', 'failed')),
  prepared_json jsonb not null default '[]'::jsonb,
  blocked_json jsonb not null default '[]'::jsonb,
  missing_info_json jsonb not null default '[]'::jsonb,
  routes_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_command_runs_tenant_created
  on public.ai_command_runs(tenant_id, created_at desc);

alter table public.ai_command_runs enable row level security;

drop policy if exists ai_command_runs_tenant_access on public.ai_command_runs;
create policy ai_command_runs_tenant_access
on public.ai_command_runs
for all
using (public.has_tenant_access(tenant_id))
with check (public.has_tenant_access(tenant_id));
