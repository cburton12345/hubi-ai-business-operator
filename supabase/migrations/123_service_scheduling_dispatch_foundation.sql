-- Scheduling, dispatch, worker eligibility, routing, and customer confirmation
-- foundations built on the canonical service visit.

create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  code text,
  description text,
  default_duration_minutes integer not null default 60 check (default_duration_minutes > 0),
  arrival_window_minutes integer not null default 120 check (arrival_window_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  required_crew_size integer not null default 1 check (required_crew_size > 0),
  required_skills_json jsonb not null default '[]'::jsonb,
  required_certifications_json jsonb not null default '[]'::jsonb,
  service_zones_json jsonb not null default '[]'::jsonb,
  customer_can_book boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_service_types_code
  on public.service_types(tenant_id, code)
  where code is not null;

create index if not exists idx_service_types_active
  on public.service_types(tenant_id, active, name);

create table if not exists public.operations_worker_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  skill_key text not null,
  skill_label text not null,
  proficiency text not null default 'qualified'
    check (proficiency in ('learning', 'qualified', 'advanced', 'expert')),
  verified boolean not null default false,
  verified_by_user_id uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  expires_at date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, worker_id, skill_key)
);

create index if not exists idx_operations_worker_skills_lookup
  on public.operations_worker_skills(tenant_id, skill_key, verified, expires_at);

create table if not exists public.operations_worker_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  certification_key text not null,
  certification_label text not null,
  issuing_authority text,
  credential_number text,
  issued_at date,
  expires_at date,
  verified boolean not null default false,
  document_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, worker_id, certification_key)
);

create index if not exists idx_operations_worker_certifications_lookup
  on public.operations_worker_certifications(tenant_id, certification_key, verified, expires_at);

create table if not exists public.operations_worker_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/Los_Angeles',
  effective_from date,
  effective_until date,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists idx_operations_worker_availability_lookup
  on public.operations_worker_availability(tenant_id, worker_id, weekday, active);

create table if not exists public.operations_worker_time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'approved'
    check (status in ('requested', 'approved', 'declined', 'canceled')),
  reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_operations_worker_time_off_lookup
  on public.operations_worker_time_off(tenant_id, worker_id, status, starts_at, ends_at);

create table if not exists public.service_visit_conflicts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete cascade,
  conflict_type text not null
    check (conflict_type in (
      'missing_time', 'invalid_time', 'worker_overlap', 'outside_availability',
      'time_off', 'missing_skill', 'missing_certification', 'expired_certification',
      'crew_shortage', 'service_zone', 'travel_risk', 'customer_unconfirmed',
      'location_missing', 'other'
    )),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'blocking')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'overridden')),
  title text not null,
  detail text not null,
  resolution text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_service_visit_open_conflict
  on public.service_visit_conflicts(
    tenant_id, visit_id, conflict_type, coalesce(worker_id::text, '')
  )
  where status in ('open', 'acknowledged');

create index if not exists idx_service_visit_conflicts_open
  on public.service_visit_conflicts(tenant_id, status, severity, detected_at desc);

create table if not exists public.service_route_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_date date not null,
  worker_id uuid references public.operations_workers(id) on delete cascade,
  crew_id uuid references public.operations_crews(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'dispatched', 'in_progress', 'completed', 'canceled')),
  start_location_label text,
  end_location_label text,
  total_travel_minutes integer not null default 0 check (total_travel_minutes >= 0),
  total_distance_meters integer not null default 0 check (total_distance_meters >= 0),
  optimization_provider text,
  optimized_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (worker_id is not null or crew_id is not null)
);

create unique index if not exists uniq_service_route_plan_worker_day
  on public.service_route_plans(tenant_id, route_date, worker_id)
  where worker_id is not null and status <> 'canceled';

create unique index if not exists uniq_service_route_plan_crew_day
  on public.service_route_plans(tenant_id, route_date, crew_id)
  where crew_id is not null and status <> 'canceled';

create table if not exists public.service_route_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_plan_id uuid not null references public.service_route_plans(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  stop_sequence integer not null check (stop_sequence > 0),
  estimated_arrival_at timestamptz,
  estimated_departure_at timestamptz,
  travel_minutes_from_previous integer check (travel_minutes_from_previous is null or travel_minutes_from_previous >= 0),
  distance_meters_from_previous integer check (distance_meters_from_previous is null or distance_meters_from_previous >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'dispatched', 'en_route', 'arrived', 'completed', 'skipped', 'canceled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_plan_id, visit_id),
  unique (route_plan_id, stop_sequence)
);

create index if not exists idx_service_route_stops_visit
  on public.service_route_stops(tenant_id, visit_id, status);

create table if not exists public.service_visit_customer_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  public_token text not null unique,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_visit_customer_tokens_visit
  on public.service_visit_customer_tokens(tenant_id, visit_id, status);

alter table public.service_visits
  add column if not exists service_type_id uuid references public.service_types(id) on delete set null,
  add column if not exists schedule_locked boolean not null default false,
  add column if not exists schedule_lock_reason text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_types',
    'operations_worker_skills',
    'operations_worker_certifications',
    'operations_worker_availability',
    'operations_worker_time_off',
    'service_visit_conflicts',
    'service_route_plans',
    'service_route_stops',
    'service_visit_customer_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

-- Seed service types from the business service catalog without introducing a
-- second catalog.
insert into public.service_types (
  tenant_id, brand_id, name, code, description, default_duration_minutes,
  customer_can_book, metadata_json
)
select
  s.tenant_id,
  s.brand_id,
  s.name,
  'brand-service-' || s.id::text,
  s.description,
  60,
  true,
  jsonb_build_object('backfilledFrom', 'brand_services', 'brandServiceId', s.id)
from public.brand_services s
where s.active
on conflict (tenant_id, code) where code is not null
do update set
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now();
