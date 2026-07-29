alter table public.service_estimates
  add column if not exists estimating_profile_id uuid,
  add column if not exists margin_target_bps integer not null default 3500,
  add column if not exists material_cost_cents integer not null default 0,
  add column if not exists labor_cost_cents integer not null default 0,
  add column if not exists overhead_cost_cents integer not null default 0,
  add column if not exists profit_cents integer not null default 0,
  add column if not exists estimator_status text not null default 'manual'
    check (estimator_status in ('manual', 'draft_takeoff', 'review_required', 'ready_for_bid', 'approved'));

create table if not exists public.estimating_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  profile_key text not null,
  trade_key text not null default 'general',
  quality_level text not null default 'standard'
    check (quality_level in ('budget', 'standard', 'premium', 'custom')),
  preferred_suppliers text[] not null default '{}',
  preferred_brands text[] not null default '{}',
  excluded_products text[] not null default '{}',
  allowed_substitutions text not null default 'owner_review',
  minimum_grade text,
  warranty_level text,
  default_waste_bps integer not null default 1000,
  complex_waste_bps integer not null default 1500,
  material_markup_bps integer not null default 2500,
  labor_rate_cents integer not null default 7500,
  delivery_assumption text,
  tax_bps integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_key, trade_key)
);

create table if not exists public.estimate_measurements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  source_type text not null default 'typed_note'
    check (source_type in ('typed_note', 'spoken_note', 'audio_translation', 'photo_note', 'uploaded_plan', 'manual_field', 'job_record', 'future_integration')),
  original_note text,
  interpreted_note text,
  trade_key text not null default 'general',
  measurement_key text not null,
  measurement_label text not null,
  numeric_value numeric(12,4),
  unit text,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'confirmed')),
  requires_confirmation boolean not null default true,
  critical boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_assumptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  assumption_type text not null default 'calculation',
  assumption_text text not null,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'confirmed')),
  requires_confirmation boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  name text not null,
  trade_key text not null,
  required_specs text[] not null default '{}',
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  supplier_key text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'uploaded_price_list', 'authorized_api', 'account_pricing', 'approved_search')),
  website_url text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text,
  store_number text,
  address text,
  city text,
  state text,
  postal_code text,
  phone text,
  pickup_available boolean not null default false,
  delivery_available boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_category_id uuid references public.product_categories(id) on delete set null,
  product_name text not null,
  brand text,
  model text,
  sku text,
  material_type text,
  package_size text,
  coverage_value numeric(12,4),
  coverage_unit text,
  grade text,
  interior_exterior text,
  structural_use text,
  warranty_system text,
  product_url text,
  status text not null default 'active'
    check (status in ('active', 'clearance', 'discontinued', 'unverified', 'archived')),
  specs_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  supplier_location_id uuid references public.supplier_locations(id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'uploaded_price_list', 'authorized_api', 'account_pricing', 'approved_search')),
  unit_price_cents integer not null default 0,
  price_unit text not null default 'each',
  price_per_base_unit_cents integer not null default 0,
  availability text not null default 'unknown'
    check (availability in ('unknown', 'in_stock', 'limited', 'out_of_stock', 'special_order')),
  quantity_available numeric(12,2),
  pickup_or_delivery text,
  checked_at timestamptz not null default now(),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'verified')),
  product_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.company_product_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trade_key text not null,
  product_category_key text not null,
  preferred_brands text[] not null default '{}',
  preferred_product_ids uuid[] not null default '{}',
  avoided_brands text[] not null default '{}',
  avoided_product_ids uuid[] not null default '{}',
  preference_source text not null default 'manual'
    check (preference_source in ('manual', 'learned_suggestion', 'approved_learning')),
  approval_status text not null default 'active'
    check (approval_status in ('suggested', 'active', 'paused', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, trade_key, product_category_key)
);

create table if not exists public.material_takeoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  estimating_profile_id uuid references public.estimating_profiles(id) on delete set null,
  trade_key text not null,
  source_type text not null default 'typed_note',
  status text not null default 'draft'
    check (status in ('draft', 'needs_measurements', 'needs_review', 'ready_for_bid', 'approved', 'archived')),
  original_input text,
  interpreted_input text,
  job_address text,
  job_postal_code text,
  quality_level text not null default 'standard'
    check (quality_level in ('budget', 'standard', 'premium', 'custom')),
  waste_bps integer not null default 1000,
  material_cost_cents integer not null default 0,
  labor_cost_cents integer not null default 0,
  markup_cents integer not null default 0,
  recommended_customer_price_cents integer not null default 0,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  missing_information text[] not null default '{}',
  confirmation_required boolean not null default true,
  formulas_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_takeoff_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_id uuid not null references public.material_takeoffs(id) on delete cascade,
  product_category_key text not null,
  label text not null,
  formula text,
  original_measurements_json jsonb not null default '{}'::jsonb,
  waste_bps integer not null default 0,
  coverage_rate numeric(12,4),
  calculated_quantity numeric(12,4) not null default 0,
  rounded_purchase_quantity numeric(12,4) not null default 0,
  unit text not null default 'each',
  assumptions text[] not null default '{}',
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'confirmed')),
  selected_supplier_product_id uuid references public.supplier_products(id) on delete set null,
  selected_supplier_price_id uuid references public.supplier_prices(id) on delete set null,
  estimated_unit_price_cents integer not null default 0,
  estimated_total_cents integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'needs_product', 'needs_review', 'selected', 'ordered', 'removed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  supplier_price_id uuid references public.supplier_prices(id) on delete set null,
  source_type text not null default 'manual',
  checked_at timestamptz not null default now(),
  confidence text not null default 'medium',
  status text not null default 'recorded'
    check (status in ('recorded', 'stale', 'warning', 'rejected')),
  warnings text[] not null default '{}',
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.product_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete cascade,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  supplier_price_id uuid references public.supplier_prices(id) on delete set null,
  recommendation_type text not null
    check (recommendation_type in ('recommended', 'budget', 'premium', 'preferred_brand', 'fastest_available', 'best_warranty')),
  fit_score integer not null default 0,
  price_score integer not null default 0,
  availability_score integer not null default 0,
  warranty_score integer not null default 0,
  risk_score integer not null default 0,
  rationale text not null,
  warnings text[] not null default '{}',
  status text not null default 'prepared'
    check (status in ('prepared', 'selected', 'overridden', 'rejected')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_warnings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete cascade,
  takeoff_id uuid references public.material_takeoffs(id) on delete cascade,
  warning_type text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'blocking')),
  message text not null,
  requires_confirmation boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'confirmed', 'resolved', 'dismissed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_location_id uuid references public.supplier_locations(id) on delete set null,
  po_number text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'ordered', 'picked_up', 'delivered', 'reconciled', 'cancelled')),
  required_date date,
  delivery_method text,
  job_name text,
  job_address text,
  notes text,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  takeoff_item_id uuid references public.material_takeoff_items(id) on delete set null,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(12,4) not null default 0,
  unit text not null default 'each',
  unit_price_cents integer not null default 0,
  extended_price_cents integer not null default 0,
  substitution_rules text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'picked_up', 'used', 'returned', 'cancelled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_estimate_measurements_tenant_estimate on public.estimate_measurements(tenant_id, estimate_id, created_at desc);
create index if not exists idx_estimate_assumptions_tenant_estimate on public.estimate_assumptions(tenant_id, estimate_id, created_at desc);
create index if not exists idx_material_takeoffs_tenant_estimate on public.material_takeoffs(tenant_id, estimate_id, created_at desc);
create index if not exists idx_material_takeoff_items_takeoff on public.material_takeoff_items(tenant_id, takeoff_id, product_category_key);
create index if not exists idx_supplier_products_tenant_category on public.supplier_products(tenant_id, product_category_id, brand);
create index if not exists idx_supplier_prices_product_checked on public.supplier_prices(supplier_product_id, checked_at desc);
create index if not exists idx_product_recommendations_item on public.product_recommendations(tenant_id, takeoff_item_id, recommendation_type);
create index if not exists idx_estimate_warnings_tenant_open on public.estimate_warnings(tenant_id, status, severity, created_at desc);
create index if not exists idx_purchase_orders_tenant_status on public.purchase_orders(tenant_id, status, created_at desc);

alter table public.estimating_profiles enable row level security;
alter table public.estimate_measurements enable row level security;
alter table public.estimate_assumptions enable row level security;
alter table public.product_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_locations enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_prices enable row level security;
alter table public.company_product_preferences enable row level security;
alter table public.material_takeoffs enable row level security;
alter table public.material_takeoff_items enable row level security;
alter table public.price_checks enable row level security;
alter table public.product_recommendations enable row level security;
alter table public.estimate_warnings enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estimating_profiles',
    'estimate_measurements',
    'estimate_assumptions',
    'suppliers',
    'supplier_locations',
    'supplier_products',
    'supplier_prices',
    'company_product_preferences',
    'material_takeoffs',
    'material_takeoff_items',
    'price_checks',
    'product_recommendations',
    'estimate_warnings',
    'purchase_orders',
    'purchase_order_items'
  ]
  loop
    execute format('drop policy if exists %I_tenant on public.%I', table_name, table_name);
    execute format(
      'create policy %I_tenant on public.%I for all using (tenant_id is null or public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (tenant_id is null or public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists product_categories_read on public.product_categories;
create policy product_categories_read
on public.product_categories
for select
using (true);

insert into public.product_categories (category_key, name, trade_key, required_specs, metadata_json)
values
  ('shingles', 'Shingles', 'shingle_roofing', array['material_type','coverage','warranty_system'], '{"coverageUnit":"bundle"}'::jsonb),
  ('roof_underlayment', 'Roof underlayment', 'shingle_roofing', array['material_type','coverage','roof_pitch'], '{"coverageUnit":"roll"}'::jsonb),
  ('ice_water_membrane', 'Ice and water membrane', 'shingle_roofing', array['coverage','temperature_rating'], '{}'::jsonb),
  ('starter_strip', 'Starter strip', 'shingle_roofing', array['linear_coverage','manufacturer_compatibility'], '{}'::jsonb),
  ('ridge_cap', 'Ridge cap', 'shingle_roofing', array['linear_coverage','manufacturer_compatibility'], '{}'::jsonb),
  ('drip_edge', 'Drip edge', 'shingle_roofing', array['length','finish','exterior_use'], '{}'::jsonb),
  ('roof_fasteners', 'Roof fasteners', 'shingle_roofing', array['type','length','application'], '{}'::jsonb),
  ('metal_panels', 'Metal panels', 'metal_roofing', array['gauge','profile','coverage_width','finish'], '{}'::jsonb),
  ('siding_panels', 'Siding panels', 'vinyl_siding', array['coverage','profile','exterior_use'], '{}'::jsonb),
  ('house_wrap', 'House wrap', 'vinyl_siding', array['coverage','exterior_use'], '{}'::jsonb),
  ('trim', 'Trim and accessories', 'vinyl_siding', array['length','profile','compatibility'], '{}'::jsonb),
  ('gutters', 'Gutters', 'gutters', array['material','length','profile'], '{}'::jsonb),
  ('framing_lumber', 'Framing lumber', 'framing', array['dimension','grade','structural_use'], '{}'::jsonb),
  ('drywall_sheets', 'Drywall sheets', 'drywall', array['thickness','dimensions','interior_use'], '{}'::jsonb),
  ('flooring', 'Flooring', 'flooring', array['coverage','material_type','grade'], '{}'::jsonb),
  ('concrete', 'Concrete', 'concrete', array['mix','yield'], '{}'::jsonb),
  ('insulation', 'Insulation', 'insulation', array['r_value','coverage','application'], '{}'::jsonb),
  ('paint', 'Paint', 'painting', array['coverage','interior_exterior','finish'], '{}'::jsonb),
  ('ductwork', 'Basic ductwork', 'ductwork', array['diameter','length','material'], '{}'::jsonb),
  ('plumbing_material', 'Basic plumbing material', 'plumbing', array['material','diameter','application'], '{}'::jsonb),
  ('electrical_material', 'Basic electrical material', 'electrical', array['wire_gauge','rating','application'], '{}'::jsonb)
on conflict (category_key) do update
set name = excluded.name,
    trade_key = excluded.trade_key,
    required_specs = excluded.required_specs,
    metadata_json = public.product_categories.metadata_json || excluded.metadata_json;

do $$
begin
  if to_regclass('public.feature_entitlements') is not null then
    insert into public.feature_entitlements (feature_key, feature_name, description, tier, status, metadata_json)
    values
      (
        'ai_estimator_takeoff',
        'AI Estimator and material takeoff',
        'Turn field notes, measurements, photos, and plans into reviewed takeoffs, product recommendations, bid drafts, and material order lists.',
        'operations',
        'enabled',
        '{"ownerVisible":true,"requiresApproval":true,"approvalBeforeBid":true,"approvalBeforeOrdering":true}'::jsonb
      )
    on conflict (feature_key) do update set
      feature_name = excluded.feature_name,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      metadata_json = public.feature_entitlements.metadata_json || excluded.metadata_json;
  end if;
end $$;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('job_tracker', 'ai_estimator_takeoff', 'AI Estimator Lite', true, 'Manual notes, calculators, assumptions, and order list drafts', 58, '{"simpleMode":true,"approvalRequired":true}'::jsonb),
  ('starter', 'ai_estimator_takeoff', 'AI Estimator', true, 'Core takeoff calculators and reviewed bid drafts', 124, '{"approvalRequired":true}'::jsonb),
  ('growth', 'ai_estimator_takeoff', 'AI Estimator Plus', true, 'Supplier comparisons, product preferences, and margin review', 224, '{"approvalRequired":true}'::jsonb),
  ('operator', 'ai_estimator_takeoff', 'AI Estimator Operator', true, 'Advanced takeoffs, order lists, and actual-vs-estimate learning', 324, '{"approvalRequired":true}'::jsonb),
  ('managed_operator', 'ai_estimator_takeoff', 'Managed AI Estimator', true, 'Managed estimator setup and review path', 255, '{"approvalRequired":true,"managedService":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
