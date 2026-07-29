alter table public.material_takeoffs
  add column if not exists labor_factors_json jsonb not null default '{}'::jsonb,
  add column if not exists quality_tier_rules_json jsonb not null default '{}'::jsonb,
  add column if not exists readiness_score integer not null default 0;

create table if not exists public.estimator_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_match_id uuid references public.estimator_inventory_matches(id) on delete cascade,
  inventory_item_id uuid references public.service_inventory_items(id) on delete set null,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  reserved_quantity numeric(12,4) not null default 0,
  unit text,
  status text not null default 'reserved'
    check (status in ('reserved', 'released', 'used', 'cancelled')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, inventory_match_id)
);

create table if not exists public.estimator_manual_price_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_item_id uuid not null references public.material_takeoff_items(id) on delete cascade,
  supplier_name text,
  price_type text not null default 'manual'
    check (price_type in ('public', 'contractor', 'volume', 'rebate', 'quote', 'tax_exempt', 'negotiated', 'cached', 'manual')),
  unit_price_cents integer not null default 0,
  package_quantity numeric(12,4) not null default 1,
  package_unit text,
  expires_at timestamptz,
  confidence text not null default 'unverified'
    check (confidence in ('unverified', 'website_stock', 'api_stock', 'phone_confirmed', 'reserved', 'ordered', 'backordered')),
  source text,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.estimator_substitution_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  original_spec_json jsonb not null default '{}'::jsonb,
  substitute_spec_json jsonb not null default '{}'::jsonb,
  appearance_status text not null default 'needs_review',
  performance_status text not null default 'needs_review',
  warranty_status text not null default 'needs_review',
  compatibility_status text not null default 'needs_review',
  customer_spec_status text not null default 'needs_review',
  insurance_status text not null default 'needs_review',
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'not_allowed')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimator_delivery_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  delivery_method text,
  fuel_surcharge_cents integer not null default 0,
  boom_delivery_cents integer not null default 0,
  multiple_trip_cents integer not null default 0,
  remote_location_cents integer not null default 0,
  minimum_delivery_cents integer not null default 0,
  jobsite_access_status text not null default 'needs_review'
    check (jobsite_access_status in ('needs_review', 'confirmed', 'restricted', 'not_required')),
  landed_cost_cents integer not null default 0,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'confirmed', 'not_required')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimator_quality_tier_systems (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trade_key text not null,
  quality_level text not null
    check (quality_level in ('budget', 'standard', 'premium', 'custom')),
  system_label text not null,
  required_roles text[] not null default '{}',
  allowed_substitution_level text not null default 'compatible_only'
    check (allowed_substitution_level in ('none', 'compatible_only', 'manager_approval', 'owner_approval')),
  warranty_requirement text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, trade_key, quality_level)
);

alter table public.estimator_inventory_reservations enable row level security;
alter table public.estimator_manual_price_entries enable row level security;
alter table public.estimator_substitution_reviews enable row level security;
alter table public.estimator_delivery_reviews enable row level security;
alter table public.estimator_quality_tier_systems enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estimator_inventory_reservations',
    'estimator_manual_price_entries',
    'estimator_substitution_reviews',
    'estimator_delivery_reviews',
    'estimator_quality_tier_systems'
  ]
  loop
    execute format('drop policy if exists %I_tenant_member on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_member on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))', table_name, table_name);
  end loop;
end $$;

create index if not exists estimator_inventory_reservations_status_idx
  on public.estimator_inventory_reservations (tenant_id, status, created_at desc);

create index if not exists estimator_manual_price_entries_item_idx
  on public.estimator_manual_price_entries (tenant_id, takeoff_item_id, created_at desc);

create index if not exists estimator_substitution_reviews_status_idx
  on public.estimator_substitution_reviews (tenant_id, status, created_at desc);

create index if not exists estimator_delivery_reviews_status_idx
  on public.estimator_delivery_reviews (tenant_id, status, created_at desc);
