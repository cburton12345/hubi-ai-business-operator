alter table public.tenants
  add column if not exists onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'completed')),
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.workspace_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  step_key text not null,
  status text not null default 'completed'
    check (status in ('completed', 'skipped', 'needs_review')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_onboarding_events_tenant
  on public.workspace_onboarding_events(tenant_id, created_at desc);

alter table public.workspace_onboarding_events enable row level security;

drop policy if exists workspace_onboarding_events_read_by_tenant_member on public.workspace_onboarding_events;
create policy workspace_onboarding_events_read_by_tenant_member
on public.workspace_onboarding_events
for select
using (public.has_tenant_access(tenant_id));

drop policy if exists workspace_onboarding_events_write_by_tenant_operator on public.workspace_onboarding_events;
create policy workspace_onboarding_events_write_by_tenant_operator
on public.workspace_onboarding_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
