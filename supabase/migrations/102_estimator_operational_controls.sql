alter table public.material_takeoff_items
  add column if not exists price_expires_at timestamptz,
  add column if not exists price_lock_status text not null default 'not_locked'
    check (price_lock_status in ('not_locked', 'locked', 'expired', 'needs_refresh')),
  add column if not exists price_refresh_required boolean not null default false;

alter table public.estimator_package_options
  add column if not exists fuel_surcharge_cents integer not null default 0,
  add column if not exists boom_delivery_cents integer not null default 0,
  add column if not exists minimum_delivery_cents integer not null default 0,
  add column if not exists remote_delivery_cents integer not null default 0,
  add column if not exists delivery_access_status text not null default 'needs_review'
    check (delivery_access_status in ('needs_review', 'confirmed', 'restricted', 'not_needed'));

create table if not exists public.estimate_change_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  change_type text not null default 'scope_change'
    check (change_type in ('scope_change', 'hidden_damage', 'customer_upgrade', 'additional_labor', 'additional_materials', 'deductible_or_insurance', 'other')),
  title text not null,
  description text,
  amount_cents integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'sent_manually', 'approved', 'rejected', 'cancelled')),
  original_estimate_snapshot_id uuid references public.estimate_versions(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimator_plan_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  validation_type text not null default 'scale_check'
    check (validation_type in ('scale_check', 'dimension_conflict', 'missing_dimensions', 'different_page_scales', 'manual_confirmation')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'confirmed', 'failed', 'not_applicable')),
  confidence text not null default 'low'
    check (confidence in ('low', 'medium', 'high', 'confirmed')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimator_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  check_type text not null
    check (check_type in ('local_code', 'climate_zone', 'manufacturer_instruction', 'warranty_requirement', 'permit_requirement', 'structural_review')),
  status text not null default 'unverified'
    check (status in ('unverified', 'needs_review', 'verified', 'failed', 'not_applicable')),
  confidence text not null default 'low'
    check (confidence in ('low', 'medium', 'high', 'verified')),
  source text,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimator_insurance_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  claim_number text,
  carrier text,
  scope_summary text,
  xactimate_comparison_status text not null default 'not_started'
    check (xactimate_comparison_status in ('not_started', 'needs_review', 'matched', 'supplement_needed', 'not_applicable')),
  deductible_cents integer not null default 0,
  depreciation_cents integer not null default 0,
  code_upgrade_cents integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'submitted', 'approved', 'closed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimate_change_orders enable row level security;
alter table public.estimator_plan_validations enable row level security;
alter table public.estimator_compliance_checks enable row level security;
alter table public.estimator_insurance_scopes enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estimate_change_orders',
    'estimator_plan_validations',
    'estimator_compliance_checks',
    'estimator_insurance_scopes'
  ]
  loop
    execute format('drop policy if exists %I_tenant_member on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_member on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))', table_name, table_name);
  end loop;
end $$;

create index if not exists estimate_change_orders_estimate_idx
  on public.estimate_change_orders (tenant_id, estimate_id, status, created_at desc);

create index if not exists estimator_plan_validations_status_idx
  on public.estimator_plan_validations (tenant_id, status, confidence, created_at desc);

create index if not exists estimator_compliance_checks_status_idx
  on public.estimator_compliance_checks (tenant_id, status, check_type, created_at desc);

create index if not exists estimator_insurance_scopes_status_idx
  on public.estimator_insurance_scopes (tenant_id, status, created_at desc);
