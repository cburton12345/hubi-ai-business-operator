-- Canonical service-business operating kernel.
-- This migration links the existing lead/estimate/job/invoice system to
-- customer locations, assets, work orders, schedulable visits, assignments,
-- and one auditable event stream without removing legacy records.

create table if not exists public.customer_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null default 'Primary location',
  location_type text not null default 'service'
    check (location_type in ('service', 'billing', 'service_and_billing', 'commercial_site', 'other')),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code text not null default 'US',
  latitude numeric(10,7),
  longitude numeric(10,7),
  timezone text,
  service_zone text,
  access_instructions text,
  parking_instructions text,
  gate_code text,
  is_primary boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_customer_primary_location
  on public.customer_locations(tenant_id, customer_id)
  where is_primary and active;

create index if not exists idx_customer_locations_customer
  on public.customer_locations(tenant_id, customer_id, active, created_at);

create index if not exists idx_customer_locations_zone
  on public.customer_locations(tenant_id, service_zone, active);

create table if not exists public.customer_location_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.customer_locations(id) on delete cascade,
  name text not null,
  role_label text,
  email text,
  phone text,
  is_primary boolean not null default false,
  receives_appointment_updates boolean not null default true,
  receives_billing_updates boolean not null default false,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'consented', 'transactional_only', 'opted_out')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_location_contacts_location
  on public.customer_location_contacts(tenant_id, location_id, is_primary);

create table if not exists public.customer_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid not null references public.customer_locations(id) on delete cascade,
  parent_asset_id uuid references public.customer_assets(id) on delete set null,
  asset_type text not null default 'equipment',
  name text not null,
  manufacturer text,
  model text,
  serial_number text,
  installed_at date,
  manufactured_at date,
  condition text not null default 'unknown'
    check (condition in ('unknown', 'new', 'good', 'fair', 'poor', 'failed', 'retired')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'replaced', 'retired')),
  warranty_provider text,
  warranty_expires_at date,
  last_service_at timestamptz,
  next_service_at timestamptz,
  specifications_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_assets_location
  on public.customer_assets(tenant_id, location_id, status, asset_type);

create index if not exists idx_customer_assets_service_due
  on public.customer_assets(tenant_id, next_service_at)
  where status = 'active' and next_service_at is not null;

create table if not exists public.service_work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.customer_locations(id) on delete set null,
  source_lead_id uuid references public.leads(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  recurring_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  external_key text,
  work_order_number text,
  title text not null,
  service_type text,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'ready_to_schedule', 'scheduled', 'in_progress', 'on_hold', 'completed', 'canceled', 'lost')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent', 'emergency')),
  requested_start timestamptz,
  requested_end timestamptz,
  promised_by timestamptz,
  completion_requirements_json jsonb not null default '[]'::jsonb,
  customer_summary text,
  internal_notes text,
  ai_next_action text,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancellation_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_service_work_orders_external_key
  on public.service_work_orders(tenant_id, external_key)
  where external_key is not null;

create unique index if not exists uniq_service_work_orders_number
  on public.service_work_orders(tenant_id, work_order_number)
  where work_order_number is not null;

create index if not exists idx_service_work_orders_schedule
  on public.service_work_orders(tenant_id, status, priority, requested_start);

create index if not exists idx_service_work_orders_customer
  on public.service_work_orders(tenant_id, customer_id, created_at desc);

create table if not exists public.service_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  work_order_id uuid not null references public.service_work_orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.customer_locations(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  recurring_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  revenue_appointment_id uuid references public.revenue_appointments(id) on delete set null,
  external_key text,
  visit_number integer not null default 1 check (visit_number > 0),
  title text not null,
  service_type text,
  status text not null default 'unscheduled'
    check (status in (
      'unscheduled', 'tentative', 'scheduled', 'confirmed', 'dispatched',
      'en_route', 'arrived', 'in_progress', 'paused', 'completed',
      'no_show', 'canceled'
    )),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent', 'emergency')),
  arrival_window_start timestamptz,
  arrival_window_end timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  expected_duration_minutes integer check (expected_duration_minutes is null or expected_duration_minutes > 0),
  actual_departed_at timestamptz,
  actual_arrived_at timestamptz,
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  required_crew_size integer not null default 1 check (required_crew_size > 0),
  required_skills_json jsonb not null default '[]'::jsonb,
  required_certifications_json jsonb not null default '[]'::jsonb,
  dispatch_notes text,
  field_instructions text,
  customer_notes text,
  completion_summary text,
  cancellation_reason text,
  no_show_reason text,
  customer_confirmation_status text not null default 'not_requested'
    check (customer_confirmation_status in ('not_requested', 'pending', 'confirmed', 'declined', 'reschedule_requested')),
  route_sequence integer,
  travel_minutes_estimate integer check (travel_minutes_estimate is null or travel_minutes_estimate >= 0),
  travel_distance_meters integer check (travel_distance_meters is null or travel_distance_meters >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, visit_number)
);

create unique index if not exists uniq_service_visits_external_key
  on public.service_visits(tenant_id, external_key)
  where external_key is not null;

create index if not exists idx_service_visits_dispatch
  on public.service_visits(tenant_id, status, scheduled_start, priority);

create index if not exists idx_service_visits_work_order
  on public.service_visits(tenant_id, work_order_id, visit_number);

create table if not exists public.service_visit_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.service_visits(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete cascade,
  crew_id uuid references public.operations_crews(id) on delete cascade,
  operations_assignment_id uuid references public.operations_assignments(id) on delete set null,
  role_label text,
  status text not null default 'assigned'
    check (status in ('proposed', 'assigned', 'acknowledged', 'declined', 'dispatched', 'completed', 'removed')),
  is_lead boolean not null default false,
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  removed_at timestamptz,
  removal_reason text,
  eligibility_snapshot_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (worker_id is not null or crew_id is not null)
);

create unique index if not exists uniq_service_visit_worker_assignment
  on public.service_visit_assignments(visit_id, worker_id)
  where worker_id is not null and status <> 'removed';

create unique index if not exists uniq_service_visit_crew_assignment
  on public.service_visit_assignments(visit_id, crew_id)
  where crew_id is not null and status <> 'removed';

create index if not exists idx_service_visit_assignments_worker
  on public.service_visit_assignments(tenant_id, worker_id, status, assigned_at);

create table if not exists public.service_operating_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  location_id uuid references public.customer_locations(id) on delete set null,
  work_order_id uuid references public.service_work_orders(id) on delete cascade,
  visit_id uuid references public.service_visits(id) on delete cascade,
  asset_id uuid references public.customer_assets(id) on delete set null,
  event_type text not null,
  source_type text not null default 'system'
    check (source_type in ('system', 'user', 'worker', 'customer', 'ai', 'provider', 'migration')),
  source_id text,
  title text not null,
  detail text,
  previous_state_json jsonb not null default '{}'::jsonb,
  next_state_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_service_operating_events_work_order
  on public.service_operating_events(tenant_id, work_order_id, occurred_at desc);

create index if not exists idx_service_operating_events_visit
  on public.service_operating_events(tenant_id, visit_id, occurred_at desc);

alter table public.service_estimates
  add column if not exists location_id uuid references public.customer_locations(id) on delete set null;

alter table public.service_jobs
  add column if not exists location_id uuid references public.customer_locations(id) on delete set null,
  add column if not exists work_order_id uuid references public.service_work_orders(id) on delete set null;

alter table public.service_invoices
  add column if not exists location_id uuid references public.customer_locations(id) on delete set null,
  add column if not exists work_order_id uuid references public.service_work_orders(id) on delete set null;

alter table public.operations_assignments
  add column if not exists service_visit_id uuid references public.service_visits(id) on delete set null;

alter table public.revenue_appointments
  add column if not exists location_id uuid references public.customer_locations(id) on delete set null,
  add column if not exists service_visit_id uuid references public.service_visits(id) on delete set null;

alter table public.recurring_service_plans
  add column if not exists location_id uuid references public.customer_locations(id) on delete set null,
  add column if not exists asset_id uuid references public.customer_assets(id) on delete set null;

create index if not exists idx_service_jobs_work_order
  on public.service_jobs(tenant_id, work_order_id);

create index if not exists idx_operations_assignments_visit
  on public.operations_assignments(tenant_id, service_visit_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customer_locations',
    'customer_location_contacts',
    'customer_assets',
    'service_work_orders',
    'service_visits',
    'service_visit_assignments',
    'service_operating_events'
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

-- Backfill a primary location for every existing customer.
insert into public.customer_locations (
  tenant_id, brand_id, customer_id, name, location_type,
  address_line1, address_line2, city, state, postal_code, is_primary,
  metadata_json, created_at, updated_at
)
select
  c.tenant_id,
  c.brand_id,
  c.id,
  'Primary location',
  'service_and_billing',
  c.address_line1,
  c.address_line2,
  c.city,
  c.state,
  c.postal_code,
  true,
  jsonb_build_object('backfilledFrom', 'customers', 'backfilledAt', now()),
  c.created_at,
  c.updated_at
from public.customers c
where not exists (
  select 1
  from public.customer_locations l
  where l.tenant_id = c.tenant_id
    and l.customer_id = c.id
    and l.is_primary
    and l.active
);

-- Carry primary contact information into the location-aware contact layer.
insert into public.customer_location_contacts (
  tenant_id, customer_id, location_id, name, role_label, email, phone,
  is_primary, receives_appointment_updates, receives_billing_updates,
  consent_status, metadata_json, created_at, updated_at
)
select
  c.tenant_id,
  c.id,
  l.id,
  c.name,
  'Primary customer',
  c.email,
  c.phone,
  true,
  true,
  true,
  case when c.status = 'do_not_contact' then 'opted_out' else 'unknown' end,
  jsonb_build_object('backfilledFrom', 'customers'),
  c.created_at,
  c.updated_at
from public.customers c
join public.customer_locations l
  on l.tenant_id = c.tenant_id
 and l.customer_id = c.id
 and l.is_primary
 and l.active
where not exists (
  select 1
  from public.customer_location_contacts lc
  where lc.tenant_id = c.tenant_id
    and lc.customer_id = c.id
    and lc.is_primary
);

-- Add location links to existing transactional records.
update public.service_estimates e
set location_id = l.id
from public.customer_locations l
where e.location_id is null
  and l.tenant_id = e.tenant_id
  and l.customer_id = e.customer_id
  and l.is_primary
  and l.active;

update public.service_jobs j
set location_id = l.id
from public.customer_locations l
where j.location_id is null
  and l.tenant_id = j.tenant_id
  and l.customer_id = j.customer_id
  and l.is_primary
  and l.active;

update public.service_invoices i
set location_id = l.id
from public.customer_locations l
where i.location_id is null
  and l.tenant_id = i.tenant_id
  and l.customer_id = i.customer_id
  and l.is_primary
  and l.active;

update public.recurring_service_plans p
set location_id = l.id
from public.customer_locations l
where p.location_id is null
  and l.tenant_id = p.tenant_id
  and l.customer_id = p.customer_id
  and l.is_primary
  and l.active;

-- Wrap each existing job in a canonical work order.
insert into public.service_work_orders (
  tenant_id, brand_id, customer_id, location_id, source_lead_id, estimate_id,
  service_job_id, external_key, work_order_number, title, description, status,
  priority, requested_start, requested_end, completed_at, internal_notes,
  ai_next_action, metadata_json, created_at, updated_at
)
select
  j.tenant_id,
  j.brand_id,
  j.customer_id,
  j.location_id,
  j.source_lead_id,
  j.estimate_id,
  j.id,
  'legacy-job:' || j.id::text,
  'WO-' || upper(substr(replace(j.id::text, '-', ''), 1, 10)),
  j.title,
  coalesce(j.completion_notes, j.dispatcher_notes),
  case j.status
    when 'unscheduled' then 'ready_to_schedule'
    when 'scheduled' then 'scheduled'
    when 'in_progress' then 'in_progress'
    when 'completed' then 'completed'
    when 'canceled' then 'canceled'
    when 'lost' then 'lost'
    else 'draft'
  end,
  'normal',
  j.scheduled_start,
  j.scheduled_end,
  case when j.status = 'completed' then coalesce(j.updated_at, now()) else null end,
  j.dispatcher_notes,
  j.ai_next_action,
  jsonb_build_object('backfilledFrom', 'service_jobs'),
  j.created_at,
  j.updated_at
from public.service_jobs j
where not exists (
  select 1
  from public.service_work_orders wo
  where wo.tenant_id = j.tenant_id
    and wo.external_key = 'legacy-job:' || j.id::text
);

update public.service_jobs j
set work_order_id = wo.id
from public.service_work_orders wo
where j.work_order_id is null
  and wo.tenant_id = j.tenant_id
  and wo.service_job_id = j.id;

update public.service_invoices i
set work_order_id = j.work_order_id
from public.service_jobs j
where i.work_order_id is null
  and i.tenant_id = j.tenant_id
  and i.job_id = j.id
  and j.work_order_id is not null;

-- Create one schedulable visit for each legacy job. Future work orders may
-- contain multiple visits.
insert into public.service_visits (
  tenant_id, brand_id, work_order_id, customer_id, location_id, service_job_id,
  external_key, visit_number, title, status, priority, scheduled_start,
  scheduled_end, expected_duration_minutes, actual_started_at,
  actual_completed_at, dispatch_notes, completion_summary, metadata_json,
  created_at, updated_at
)
select
  j.tenant_id,
  j.brand_id,
  j.work_order_id,
  j.customer_id,
  j.location_id,
  j.id,
  'legacy-job-visit:' || j.id::text,
  1,
  j.title,
  case j.status
    when 'unscheduled' then 'unscheduled'
    when 'scheduled' then 'scheduled'
    when 'in_progress' then 'in_progress'
    when 'completed' then 'completed'
    when 'canceled' then 'canceled'
    when 'lost' then 'canceled'
    else 'unscheduled'
  end,
  'normal',
  j.scheduled_start,
  j.scheduled_end,
  case
    when j.scheduled_start is not null and j.scheduled_end is not null
      then greatest(1, extract(epoch from (j.scheduled_end - j.scheduled_start))::integer / 60)
    else null
  end,
  case when j.status = 'in_progress' then j.updated_at else null end,
  case when j.status = 'completed' then j.updated_at else null end,
  j.dispatcher_notes,
  j.completion_notes,
  jsonb_build_object('backfilledFrom', 'service_jobs'),
  j.created_at,
  j.updated_at
from public.service_jobs j
where j.work_order_id is not null
  and not exists (
    select 1
    from public.service_visits v
    where v.tenant_id = j.tenant_id
      and v.external_key = 'legacy-job-visit:' || j.id::text
  );

update public.operations_assignments a
set service_visit_id = v.id
from public.service_visits v
where a.service_visit_id is null
  and a.service_job_id is not null
  and v.tenant_id = a.tenant_id
  and v.service_job_id = a.service_job_id;

insert into public.service_visit_assignments (
  tenant_id, visit_id, worker_id, crew_id, operations_assignment_id,
  status, is_lead, assigned_at, eligibility_snapshot_json, metadata_json,
  created_at, updated_at
)
select
  a.tenant_id,
  a.service_visit_id,
  a.worker_id,
  a.crew_id,
  a.id,
  case a.status
    when 'completed' then 'completed'
    when 'archived' then 'removed'
    else 'assigned'
  end,
  false,
  a.created_at,
  '{}'::jsonb,
  jsonb_build_object('backfilledFrom', 'operations_assignments'),
  a.created_at,
  a.updated_at
from public.operations_assignments a
where a.service_visit_id is not null
  and (a.worker_id is not null or a.crew_id is not null)
  and not exists (
    select 1
    from public.service_visit_assignments va
    where va.tenant_id = a.tenant_id
      and va.operations_assignment_id = a.id
  );

insert into public.service_operating_events (
  tenant_id, brand_id, customer_id, location_id, work_order_id, visit_id,
  event_type, source_type, source_id, title, detail, next_state_json,
  metadata_json, occurred_at
)
select
  wo.tenant_id,
  wo.brand_id,
  wo.customer_id,
  wo.location_id,
  wo.id,
  v.id,
  'kernel_backfilled',
  'migration',
  '122_canonical_service_operating_kernel',
  'Existing job connected to the service operating kernel',
  'Ferocity preserved the existing job and added canonical work-order and visit links.',
  jsonb_build_object('workOrderStatus', wo.status, 'visitStatus', v.status),
  jsonb_build_object('serviceJobId', wo.service_job_id),
  now()
from public.service_work_orders wo
join public.service_visits v
  on v.tenant_id = wo.tenant_id
 and v.work_order_id = wo.id
where wo.metadata_json->>'backfilledFrom' = 'service_jobs'
  and not exists (
    select 1
    from public.service_operating_events e
    where e.tenant_id = wo.tenant_id
      and e.work_order_id = wo.id
      and e.event_type = 'kernel_backfilled'
  );
