-- Phase 4: connected CRM, pricebook, membership, and customer portal foundation.
-- This migration is intentionally additive so existing service records continue to work.

create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.customer_tag_assignments (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create table if not exists public.customer_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  field_key text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  options_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, field_key)
);

create table if not exists public.customer_custom_field_values (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  definition_id uuid not null references public.customer_custom_field_definitions(id) on delete cascade,
  value_json jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (customer_id, definition_id)
);

create table if not exists public.customer_merge_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  target_customer_id uuid not null references public.customers(id) on delete cascade,
  source_customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'completed'
    check (status in ('completed', 'reversed', 'needs_review')),
  reason text,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  affected_counts_json jsonb not null default '{}'::jsonb,
  merged_by_user_id uuid references public.users(id) on delete set null,
  merged_at timestamptz not null default now(),
  reversed_at timestamptz
);

create table if not exists public.pricebook_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.pricebook_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.pricebook_categories(id) on delete set null,
  service_type_id uuid references public.service_types(id) on delete set null,
  sku text,
  item_type text not null default 'service'
    check (item_type in ('service', 'material', 'labor', 'equipment', 'fee', 'discount')),
  name text not null,
  customer_description text,
  internal_description text,
  unit text not null default 'each',
  cost_cents integer not null default 0 check (cost_cents >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  taxable boolean not null default true,
  expected_duration_minutes integer check (expected_duration_minutes is null or expected_duration_minutes > 0),
  image_url text,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pricebook_items_tenant_sku_unique
  on public.pricebook_items (tenant_id, lower(sku))
  where sku is not null and sku <> '';

create table if not exists public.pricebook_region_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pricebook_item_id uuid not null references public.pricebook_items(id) on delete cascade,
  service_zone text not null,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pricebook_item_id, service_zone)
);

create table if not exists public.pricebook_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.pricebook_categories(id) on delete set null,
  name text not null,
  tier text not null default 'standard'
    check (tier in ('good', 'better', 'best', 'standard', 'custom')),
  customer_description text,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricebook_package_items (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.pricebook_packages(id) on delete cascade,
  pricebook_item_id uuid not null references public.pricebook_items(id) on delete cascade,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  price_override_cents integer check (price_override_cents is null or price_override_cents >= 0),
  position integer not null default 0,
  primary key (package_id, pricebook_item_id)
);

alter table public.estimate_line_items
  add column if not exists pricebook_item_id uuid references public.pricebook_items(id) on delete set null,
  add column if not exists cost_cents integer not null default 0,
  add column if not exists taxable boolean not null default true,
  add column if not exists optional boolean not null default false,
  add column if not exists selected boolean not null default true,
  add column if not exists package_tier text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.service_estimates
  add column if not exists deposit_type text not null default 'none'
    check (deposit_type in ('none', 'fixed', 'percent')),
  add column if not exists deposit_value numeric(12,2) not null default 0,
  add column if not exists financing_interest boolean not null default false,
  add column if not exists change_request_status text not null default 'none'
    check (change_request_status in ('none', 'requested', 'reviewing', 'resolved'));

create table if not exists public.membership_programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  customer_description text,
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('monthly', 'quarterly', 'annual')),
  price_cents integer not null default 0 check (price_cents >= 0),
  visits_per_year integer not null default 1 check (visits_per_year >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  priority_service boolean not null default false,
  benefits_json jsonb not null default '[]'::jsonb,
  service_type_id uuid references public.service_types(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table public.recurring_service_plans
  add column if not exists membership_program_id uuid references public.membership_programs(id) on delete set null,
  add column if not exists started_at date,
  add column if not exists renews_at date,
  add column if not exists paused_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists visits_remaining integer,
  add column if not exists auto_renew boolean not null default true,
  add column if not exists billing_status text not null default 'manual'
    check (billing_status in ('manual', 'ready', 'active', 'past_due', 'canceled')),
  add column if not exists provider_subscription_id text,
  add column if not exists last_visit_generated_at timestamptz;

create table if not exists public.customer_portal_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.customer_locations(id) on delete set null,
  request_type text not null default 'service'
    check (request_type in ('service', 'reschedule', 'cancel', 'estimate_change', 'billing', 'document', 'other')),
  subject text not null,
  details text,
  preferred_start timestamptz,
  preferred_end timestamptz,
  status text not null default 'new'
    check (status in ('new', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  source text not null default 'portal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_portal_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  request_id uuid references public.customer_portal_requests(id) on delete set null,
  direction text not null check (direction in ('customer', 'business')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_portal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  work_order_id uuid references public.service_work_orders(id) on delete set null,
  visit_id uuid references public.service_visits(id) on delete set null,
  title text not null,
  document_type text not null default 'other',
  storage_path text,
  external_url text,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists customer_tag_assignments_tenant_customer_idx
  on public.customer_tag_assignments (tenant_id, customer_id);
create index if not exists pricebook_items_tenant_active_idx
  on public.pricebook_items (tenant_id, active, category_id, name);
create index if not exists pricebook_packages_tenant_active_idx
  on public.pricebook_packages (tenant_id, active, tier, position);
create index if not exists membership_programs_tenant_active_idx
  on public.membership_programs (tenant_id, active, name);
create index if not exists customer_portal_requests_tenant_status_idx
  on public.customer_portal_requests (tenant_id, status, created_at desc);
create index if not exists customer_portal_messages_customer_idx
  on public.customer_portal_messages (tenant_id, customer_id, created_at desc);
create index if not exists customer_portal_documents_customer_idx
  on public.customer_portal_documents (tenant_id, customer_id, created_at desc);

alter table public.customer_tags enable row level security;
alter table public.customer_tag_assignments enable row level security;
alter table public.customer_custom_field_definitions enable row level security;
alter table public.customer_custom_field_values enable row level security;
alter table public.customer_merge_audits enable row level security;
alter table public.pricebook_categories enable row level security;
alter table public.pricebook_items enable row level security;
alter table public.pricebook_region_overrides enable row level security;
alter table public.pricebook_packages enable row level security;
alter table public.pricebook_package_items enable row level security;
alter table public.membership_programs enable row level security;
alter table public.customer_portal_requests enable row level security;
alter table public.customer_portal_messages enable row level security;
alter table public.customer_portal_documents enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customer_tags',
    'customer_tag_assignments',
    'customer_custom_field_definitions',
    'customer_custom_field_values',
    'customer_merge_audits',
    'pricebook_categories',
    'pricebook_items',
    'pricebook_region_overrides',
    'pricebook_packages',
    'pricebook_package_items',
    'membership_programs',
    'customer_portal_requests',
    'customer_portal_messages',
    'customer_portal_documents'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

-- Preserve existing recurring plan behavior while making renewal dates explicit.
update public.recurring_service_plans
set started_at = coalesce(started_at, created_at::date),
    renews_at = coalesce(
      renews_at,
      case frequency
        when 'weekly' then current_date + 7
        when 'monthly' then current_date + 30
        when 'quarterly' then current_date + 90
        when 'annual' then current_date + 365
        else null
      end
    )
where started_at is null or renews_at is null;
