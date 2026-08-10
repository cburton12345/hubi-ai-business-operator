create table if not exists public.business_profile_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider_key text not null default 'google_business_profile',
  external_account_name text not null,
  external_location_name text not null,
  title text not null,
  store_code text,
  website_uri text,
  primary_phone text,
  address_text text,
  primary_category text,
  verification_state text,
  selected boolean not null default false,
  source_updated_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_account_name, external_location_name)
);

create index if not exists business_profile_locations_tenant_selected_idx
  on public.business_profile_locations(tenant_id, selected, title);

create table if not exists public.business_profile_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  location_id uuid not null references public.business_profile_locations(id) on delete cascade,
  external_review_name text not null,
  reviewer_name text,
  star_rating integer check (star_rating between 1 and 5),
  comment_text text,
  review_created_at timestamptz,
  review_updated_at timestamptz,
  reply_comment text,
  reply_updated_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_review_name)
);

create index if not exists business_profile_reviews_tenant_recent_idx
  on public.business_profile_reviews(tenant_id, review_created_at desc);

alter table public.business_profile_locations enable row level security;
alter table public.business_profile_reviews enable row level security;

drop policy if exists business_profile_locations_tenant on public.business_profile_locations;
create policy business_profile_locations_tenant on public.business_profile_locations for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists business_profile_reviews_tenant on public.business_profile_reviews;
create policy business_profile_reviews_tenant on public.business_profile_reviews for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.business_profile_reviews is
  'Read model for tenant-owned Google Business Profile reviews. Public replies remain separate approval-gated actions.';
