create table if not exists public.setup_operator_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by_user_id uuid references public.users(id) on delete set null,
  request_text text not null,
  template_key text not null default 'general_service',
  status text not null default 'previewed'
    check (status in ('previewed', 'applied', 'reverted', 'canceled')),
  plan_json jsonb not null default '{}'::jsonb,
  rollback_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.setup_operator_run_changes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.setup_operator_runs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_type text not null,
  target_table text not null,
  target_key text not null,
  status text not null default 'applied'
    check (status in ('planned', 'applied', 'reverted', 'skipped')),
  before_json jsonb,
  after_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_setup_operator_runs_tenant on public.setup_operator_runs(tenant_id, created_at desc);
create index if not exists idx_setup_operator_run_changes_run on public.setup_operator_run_changes(run_id, created_at asc);
create index if not exists idx_setup_operator_run_changes_tenant on public.setup_operator_run_changes(tenant_id, target_table, target_key);

alter table public.setup_operator_runs enable row level security;
alter table public.setup_operator_run_changes enable row level security;

drop policy if exists setup_operator_runs_tenant_operator on public.setup_operator_runs;
create policy setup_operator_runs_tenant_operator
on public.setup_operator_runs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists setup_operator_run_changes_tenant_operator on public.setup_operator_run_changes;
create policy setup_operator_run_changes_tenant_operator
on public.setup_operator_run_changes
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
