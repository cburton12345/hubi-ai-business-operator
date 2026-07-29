create table if not exists public.estimator_quote_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  product_category_key text not null,
  requested_spec_json jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'needed'
    check (status in ('needed', 'requested', 'received', 'expired', 'cancelled')),
  quote_expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, takeoff_item_id)
);

create table if not exists public.estimator_inventory_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  inventory_item_id uuid references public.service_inventory_items(id) on delete set null,
  match_status text not null default 'possible'
    check (match_status in ('possible', 'recommended', 'reserved', 'rejected', 'unavailable')),
  available_quantity numeric(12,4) not null default 0,
  required_quantity numeric(12,4) not null default 0,
  usable_quantity numeric(12,4) not null default 0,
  confidence text not null default 'low'
    check (confidence in ('low', 'medium', 'high', 'confirmed')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, takeoff_item_id, inventory_item_id)
);

create table if not exists public.estimator_package_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  option_name text not null,
  package_strategy text not null default 'needs_supplier_packages'
    check (package_strategy in ('needs_supplier_packages', 'single_package', 'quantity_break', 'bundle', 'pallet', 'minimum_order', 'mixed_packages')),
  purchase_quantity numeric(12,4) not null default 0,
  estimated_landed_cost_cents integer not null default 0,
  delivery_notes text,
  optimization_notes text,
  selected boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.estimator_approval_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  requirement_key text not null,
  role_required text not null
    check (role_required in ('worker', 'estimator', 'manager', 'purchasing', 'owner')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high', 'blocking')),
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'approved', 'rejected', 'dismissed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, takeoff_id, requirement_key)
);

alter table public.estimator_quote_requests enable row level security;
alter table public.estimator_inventory_matches enable row level security;
alter table public.estimator_package_options enable row level security;
alter table public.estimator_approval_requirements enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estimator_quote_requests',
    'estimator_inventory_matches',
    'estimator_package_options',
    'estimator_approval_requirements'
  ]
  loop
    execute format('drop policy if exists %I_tenant_member on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_member on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))', table_name, table_name);
  end loop;
end $$;

create index if not exists estimator_quote_requests_status_idx
  on public.estimator_quote_requests (tenant_id, status, created_at desc);

create index if not exists estimator_inventory_matches_takeoff_idx
  on public.estimator_inventory_matches (tenant_id, takeoff_id, match_status);

create index if not exists estimator_package_options_takeoff_idx
  on public.estimator_package_options (tenant_id, takeoff_id, selected);

create index if not exists estimator_approval_requirements_status_idx
  on public.estimator_approval_requirements (tenant_id, status, risk_level, created_at desc);
