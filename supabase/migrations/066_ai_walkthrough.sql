create table if not exists public.ai_walkthrough_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  title text not null,
  walkthrough_type text not null default 'property'
    check (walkthrough_type in ('property', 'roof', 'inspection', 'damage_claim', 'rental', 'jobsite', 'equipment', 'fleet', 'other')),
  capture_mode text not null default 'spoken_notes'
    check (capture_mode in ('spoken_notes', 'audio', 'video', 'photos', 'mixed', 'drone', 'meta_glasses')),
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'needs_review', 'reviewed', 'converted', 'archived')),
  site_location text,
  transcript_text text,
  content_mode_enabled boolean not null default false,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  property_summary text,
  damage_summary text,
  customer_requests text,
  material_requirements text,
  labor_requirements text,
  safety_concerns text,
  follow_up_items text,
  open_questions text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_walkthrough_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.ai_walkthrough_sessions(id) on delete cascade,
  media_type text not null default 'photo'
    check (media_type in ('photo', 'video', 'audio', 'extracted_frame', 'drone_video', 'meta_glasses_video', 'other')),
  source_url text,
  original_filename text,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'kept', 'deleted', 'attached', 'archived')),
  ai_title text,
  ai_description text,
  timestamp_seconds integer,
  location_reference text,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_walkthrough_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.ai_walkthrough_sessions(id) on delete cascade,
  observation_type text not null default 'finding'
    check (observation_type in ('damage', 'customer_request', 'material', 'labor', 'safety', 'measurement', 'asset', 'open_question', 'finding')),
  title text not null,
  description text,
  quantity numeric,
  unit text,
  material text,
  location_reference text,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review', 'approved', 'edited', 'rejected', 'converted')),
  related_media_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_walkthrough_estimate_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.ai_walkthrough_sessions(id) on delete cascade,
  observation_id uuid references public.ai_walkthrough_observations(id) on delete set null,
  line_item text not null,
  quantity numeric,
  unit text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent_to_estimate', 'rejected')),
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_walkthrough_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.ai_walkthrough_sessions(id) on delete cascade,
  report_type text not null default 'inspection'
    check (report_type in ('inspection', 'insurance', 'estimate_scope', 'marketing_recap', 'property_summary')),
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'archived')),
  report_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_walkthrough_sessions_tenant_created
  on public.ai_walkthrough_sessions(tenant_id, created_at desc);

create index if not exists idx_ai_walkthrough_media_session
  on public.ai_walkthrough_media(tenant_id, session_id, created_at desc);

create index if not exists idx_ai_walkthrough_observations_session
  on public.ai_walkthrough_observations(tenant_id, session_id, review_status, created_at desc);

create index if not exists idx_ai_walkthrough_estimate_items_session
  on public.ai_walkthrough_estimate_items(tenant_id, session_id, status, created_at desc);

create index if not exists idx_ai_walkthrough_reports_session
  on public.ai_walkthrough_reports(tenant_id, session_id, report_type, created_at desc);

alter table public.ai_walkthrough_sessions enable row level security;
alter table public.ai_walkthrough_media enable row level security;
alter table public.ai_walkthrough_observations enable row level security;
alter table public.ai_walkthrough_estimate_items enable row level security;
alter table public.ai_walkthrough_reports enable row level security;

drop policy if exists ai_walkthrough_sessions_tenant on public.ai_walkthrough_sessions;
create policy ai_walkthrough_sessions_tenant
on public.ai_walkthrough_sessions
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists ai_walkthrough_media_tenant on public.ai_walkthrough_media;
create policy ai_walkthrough_media_tenant
on public.ai_walkthrough_media
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists ai_walkthrough_observations_tenant on public.ai_walkthrough_observations;
create policy ai_walkthrough_observations_tenant
on public.ai_walkthrough_observations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists ai_walkthrough_estimate_items_tenant on public.ai_walkthrough_estimate_items;
create policy ai_walkthrough_estimate_items_tenant
on public.ai_walkthrough_estimate_items
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists ai_walkthrough_reports_tenant on public.ai_walkthrough_reports;
create policy ai_walkthrough_reports_tenant
on public.ai_walkthrough_reports
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
