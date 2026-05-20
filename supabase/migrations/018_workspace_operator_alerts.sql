create table if not exists public.operator_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alert_key text not null,
  category text not null
    check (category in ('lead', 'content', 'approval', 'form', 'system', 'ai', 'integration', 'billing')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high')),
  status text not null default 'active'
    check (status in ('active', 'resolved')),
  title text not null,
  summary text not null,
  action_href text,
  metadata_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, alert_key)
);

create index if not exists idx_operator_alerts_tenant_status
  on public.operator_alerts(tenant_id, status, severity, last_seen_at desc);

alter table public.operator_alerts enable row level security;

drop policy if exists operator_alerts_tenant_operator on public.operator_alerts;
create policy operator_alerts_tenant_operator
on public.operator_alerts
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
