create table if not exists public.estimator_supplier_price_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  import_name text not null,
  source_type text not null default 'uploaded_price_list'
    check (source_type in ('uploaded_price_list', 'manual_paste', 'account_pricing')),
  row_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'completed'
    check (status in ('completed', 'partial', 'failed')),
  warnings text[] not null default '{}',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.estimator_supplier_price_imports enable row level security;

drop policy if exists estimator_supplier_price_imports_tenant_member on public.estimator_supplier_price_imports;
create policy estimator_supplier_price_imports_tenant_member
on public.estimator_supplier_price_imports
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

create index if not exists estimator_supplier_price_imports_tenant_idx
  on public.estimator_supplier_price_imports (tenant_id, created_at desc);
