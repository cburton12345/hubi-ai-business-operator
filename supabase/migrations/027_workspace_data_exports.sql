create table if not exists public.workspace_data_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  export_scope text not null default 'workspace_snapshot'
    check (export_scope in ('workspace_snapshot')),
  status text not null default 'ready'
    check (status in ('queued', 'ready', 'archived')),
  package_json jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_workspace_data_exports_tenant_requested
  on public.workspace_data_exports(tenant_id, requested_at desc);

alter table public.workspace_data_exports enable row level security;

drop policy if exists workspace_data_exports_tenant_admin on public.workspace_data_exports;
create policy workspace_data_exports_tenant_admin
on public.workspace_data_exports
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
