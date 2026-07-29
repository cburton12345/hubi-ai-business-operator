alter table public.material_takeoffs
  add column if not exists system_assembly_key text,
  add column if not exists system_assembly_json jsonb not null default '{}'::jsonb,
  add column if not exists product_specifications_json jsonb not null default '[]'::jsonb,
  add column if not exists pricing_guardrails_json jsonb not null default '{}'::jsonb,
  add column if not exists review_thresholds_json jsonb not null default '{}'::jsonb;

alter table public.material_takeoff_items
  add column if not exists assembly_role text,
  add column if not exists product_specification_json jsonb not null default '{}'::jsonb,
  add column if not exists pricing_type text not null default 'unpriced'
    check (pricing_type in ('unpriced', 'public', 'contractor', 'volume', 'rebate', 'quote', 'tax_exempt', 'negotiated', 'cached', 'manual')),
  add column if not exists pricing_confidence text not null default 'unverified'
    check (pricing_confidence in ('unverified', 'website_stock', 'api_stock', 'phone_confirmed', 'reserved', 'ordered', 'backordered')),
  add column if not exists installation_waste_bps integer not null default 0,
  add column if not exists purchased_overage_bps integer not null default 0,
  add column if not exists returnable_extra_bps integer not null default 0,
  add column if not exists non_returnable_custom boolean not null default false,
  add column if not exists quote_required boolean not null default false,
  add column if not exists substitute_allowed boolean not null default false,
  add column if not exists compatibility_notes text;

create table if not exists public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  version_number integer not null,
  reason text not null default 'revision',
  snapshot_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, estimate_id, version_number)
);

alter table public.estimate_versions enable row level security;

drop policy if exists estimate_versions_select on public.estimate_versions;
create policy estimate_versions_select on public.estimate_versions
  for select using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists estimate_versions_insert on public.estimate_versions;
create policy estimate_versions_insert on public.estimate_versions
  for insert with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

create index if not exists estimate_versions_estimate_idx
  on public.estimate_versions (tenant_id, estimate_id, version_number desc);
