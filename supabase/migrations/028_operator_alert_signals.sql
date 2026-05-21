create table if not exists public.operator_alert_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  signal_type text not null
    check (signal_type in (
      'bad_review',
      'ad_performance_drop',
      'seo_ranking_drop',
      'listing_problem',
      'customer_communication_failure',
      'payment_failure',
      'conversion_problem'
    )),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high')),
  title text not null,
  summary text not null,
  action_href text,
  source text not null default 'manual',
  source_ref text,
  status text not null default 'active'
    check (status in ('active', 'resolved')),
  metadata_json jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operator_alert_signals_tenant_status
  on public.operator_alert_signals(tenant_id, status, signal_type, detected_at desc);

alter table public.operator_alert_signals enable row level security;

drop policy if exists operator_alert_signals_tenant_operator on public.operator_alert_signals;
create policy operator_alert_signals_tenant_operator
on public.operator_alert_signals
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
