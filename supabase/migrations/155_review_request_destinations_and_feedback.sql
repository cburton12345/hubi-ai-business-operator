alter table public.review_request_workflows
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists feedback_text text,
  add column if not exists feedback_received_at timestamptz;

create unique index if not exists idx_review_request_workflows_public_token
  on public.review_request_workflows(public_token);

create table if not exists public.review_request_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  destination_key text not null,
  provider text not null
    check (provider in ('google_business_profile', 'facebook', 'yelp', 'bbb', 'industry_directory', 'custom')),
  display_name text not null,
  review_url text not null,
  priority integer not null default 100,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  verified_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, brand_id, destination_key)
);

create index if not exists idx_review_request_destinations_active
  on public.review_request_destinations(tenant_id, brand_id, priority, created_at)
  where status = 'active';

alter table public.review_request_destinations enable row level security;

drop policy if exists review_request_destinations_tenant_admin on public.review_request_destinations;
create policy review_request_destinations_tenant_admin
on public.review_request_destinations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

comment on table public.review_request_destinations is
  'Public review destinations shown equally to every customer. Private feedback and service recovery must never be used to hide public review links from unhappy customers.';
