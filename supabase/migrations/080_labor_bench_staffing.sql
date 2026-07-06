create table if not exists public.labor_staffing_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  trade text not null,
  jobsite text,
  service_area text,
  start_date date,
  duration_label text,
  headcount integer not null default 1,
  pay_range text,
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'matching', 'approval_needed', 'contacting', 'filled', 'paused', 'cancelled')),
  approval_mode text not null default 'owner_approval_required'
    check (approval_mode in ('owner_approval_required', 'platform_review_required')),
  placement_mode text not null default 'manual_or_paid_tier'
    check (placement_mode in ('manual_or_paid_tier', 'included_in_plan', 'placement_fee', 'not_offered')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_worker_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  trade text not null,
  service_area text,
  home_location text,
  phone text,
  email text,
  availability_label text,
  travel_radius_miles integer,
  rate_label text,
  experience_label text,
  source text not null default 'manual'
    check (source in ('manual', 'marketplacepro', 'public_form', 'referral', 'import')),
  status text not null default 'available'
    check (status in ('available', 'needs_review', 'contacted', 'placed', 'unavailable', 'archived')),
  consent_to_contact boolean not null default false,
  last_available_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_staffing_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.labor_staffing_requests(id) on delete cascade,
  worker_availability_id uuid not null references public.labor_worker_availability(id) on delete cascade,
  match_score integer not null default 0,
  match_reason text,
  status text not null default 'suggested'
    check (status in ('suggested', 'owner_approved_contact', 'contacted', 'worker_interested', 'placed', 'rejected', 'not_available')),
  owner_approved_at timestamptz,
  contacted_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, worker_availability_id)
);

create index if not exists idx_labor_staffing_requests_tenant_status
  on public.labor_staffing_requests(tenant_id, status, urgency, created_at desc);
create index if not exists idx_labor_worker_availability_tenant_status
  on public.labor_worker_availability(tenant_id, status, trade, service_area);
create index if not exists idx_labor_staffing_matches_request
  on public.labor_staffing_matches(tenant_id, request_id, status, match_score desc);

alter table public.labor_staffing_requests enable row level security;
alter table public.labor_worker_availability enable row level security;
alter table public.labor_staffing_matches enable row level security;

drop policy if exists labor_staffing_requests_tenant on public.labor_staffing_requests;
create policy labor_staffing_requests_tenant on public.labor_staffing_requests for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists labor_worker_availability_tenant on public.labor_worker_availability;
create policy labor_worker_availability_tenant on public.labor_worker_availability for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists labor_staffing_matches_tenant on public.labor_staffing_matches;
create policy labor_staffing_matches_tenant on public.labor_staffing_matches for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
