alter table public.follow_up_workflows
  add column if not exists invoice_id uuid references public.service_invoices(id) on delete cascade;

create index if not exists idx_follow_up_workflows_invoice
  on public.follow_up_workflows(tenant_id, invoice_id, status);

create table if not exists public.external_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider_key text not null,
  metric_family text not null
    check (metric_family in ('ads', 'analytics', 'payments', 'seo', 'reviews', 'marketing')),
  metric_key text not null,
  metric_value numeric(14,2) not null default 0,
  currency text,
  period_start date not null,
  period_end date not null,
  source_reference text,
  metadata_json jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, brand_id, provider_key, metric_family, metric_key, period_start, period_end)
);

create index if not exists idx_external_metric_snapshots_tenant
  on public.external_metric_snapshots(tenant_id, metric_family, metric_key, period_start desc);

alter table public.external_metric_snapshots enable row level security;

drop policy if exists external_metric_snapshots_tenant_operator on public.external_metric_snapshots;
create policy external_metric_snapshots_tenant_operator
on public.external_metric_snapshots
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
