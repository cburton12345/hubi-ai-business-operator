-- Tenant-safe, review-first rental listing syndication for Ferocity.
-- Tokens are visible once to the owner and only SHA-256 hashes are stored.
-- This migration does not create provider accounts, submit feeds, enable spend, or publish listings.

create table if not exists public.listing_syndication_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null check (provider_key in ('zillow_network','apartments_feed','tenantcloud','turbotenant')),
  status text not null default 'draft' check (status in ('draft','needs_setup','ready_for_test','submitted','approved','paused','blocked','revoked')),
  mode text not null default 'review' check (mode in ('review','manual','disabled')),
  feed_enabled boolean not null default false,
  feed_token_hash text,
  feed_token_created_at timestamptz,
  provider_approved boolean not null default false,
  publish_allowed boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key),
  check (publish_allowed = false or provider_approved = true),
  check (feed_enabled = false or feed_token_hash is not null)
);

create table if not exists public.listing_syndication_provider_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.listing_syndication_connectors(id) on delete cascade,
  action_type text not null check (action_type in ('listing_feed_token_created','submit_to_provider','fix_listing_photos','confirm_private_address','provider_approved','pause_feed','rotate_feed_token')),
  status text not null default 'draft' check (status in ('draft','queued','in_review','completed','blocked','canceled')),
  approval_status text not null default 'needs_approval' check (approval_status in ('needs_approval','approved','rejected','not_required')),
  idempotency_key text not null,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create or replace view public.listing_syndication_readiness_v
with (security_invoker = true) as
select
  p.tenant_id,
  p.id as publication_id,
  p.title,
  d.destination_key as provider_key,
  p.status as publication_status,
  d.status as destination_status,
  nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,street}',p.canonical_payload_json#>>'{property,street}',p.canonical_payload_json#>>'{location,street}'), '') as provider_street,
  nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,city}',p.canonical_payload_json#>>'{location,city}'), '') as provider_city,
  nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,state}',p.canonical_payload_json#>>'{location,region}'), '') as provider_state,
  nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,postalCode}',p.canonical_payload_json#>>'{location,postalCode}'), '') as provider_postal_code,
  case
    when coalesce(p.canonical_payload_json#>>'{property,rent}',p.canonical_payload_json->>'rent','') ~ '^[0-9]+(\.[0-9]+)?$'
      then coalesce(p.canonical_payload_json#>>'{property,rent}',p.canonical_payload_json->>'rent')::numeric
    else 0
  end as rent,
  case when jsonb_typeof(p.canonical_payload_json->'media')='array' then jsonb_array_length(p.canonical_payload_json->'media') else 0 end as media_count,
  array_remove(array[
    case when nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,street}',p.canonical_payload_json#>>'{property,street}',p.canonical_payload_json#>>'{location,street}'), '') is null then 'missing provider street address' end,
    case when nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,city}',p.canonical_payload_json#>>'{location,city}'), '') is null then 'missing provider city' end,
    case when nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,state}',p.canonical_payload_json#>>'{location,region}'), '') is null then 'missing provider state' end,
    case when nullif(coalesce(p.canonical_payload_json#>>'{privateProviderFields,postalCode}',p.canonical_payload_json#>>'{location,postalCode}'), '') is null then 'missing provider ZIP' end,
    case
      when coalesce(p.canonical_payload_json#>>'{property,rent}',p.canonical_payload_json->>'rent','') ~ '^[0-9]+(\.[0-9]+)?$'
        then case when coalesce(p.canonical_payload_json#>>'{property,rent}',p.canonical_payload_json->>'rent')::numeric <= 0 then 'missing rent' end
      else 'missing rent'
    end,
    case when nullif(p.body,'') is null then 'missing description' end,
    case when jsonb_typeof(p.canonical_payload_json->'media')='array'
      then case when jsonb_array_length(p.canonical_payload_json->'media') <= 0 then 'missing photos' end
      else 'missing photos'
    end,
    case when nullif(coalesce(p.canonical_payload_json#>>'{callToAction,url}',p.canonical_payload_json->>'listingUrl'),'') is null then 'missing renter route' end
  ], null) as readiness_issues
from public.distribution_publications p
join public.distribution_destinations d on d.publication_id=p.id and d.tenant_id=p.tenant_id
where p.publication_type='listing'
  and d.destination_key in ('zillow_network','apartments_feed','tenantcloud','turbotenant');

create index if not exists idx_listing_syndication_connectors_tenant on public.listing_syndication_connectors(tenant_id,status,provider_key);
create index if not exists idx_listing_syndication_actions_review on public.listing_syndication_provider_actions(tenant_id,approval_status,status,created_at desc);

alter table public.listing_syndication_connectors enable row level security;
alter table public.listing_syndication_provider_actions enable row level security;
drop policy if exists listing_syndication_connectors_tenant_operator on public.listing_syndication_connectors;
create policy listing_syndication_connectors_tenant_operator on public.listing_syndication_connectors for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));
drop policy if exists listing_syndication_actions_tenant_operator on public.listing_syndication_provider_actions;
create policy listing_syndication_actions_tenant_operator on public.listing_syndication_provider_actions for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

grant select on public.listing_syndication_readiness_v to authenticated;

alter table public.publishing_queue drop constraint if exists publishing_queue_target_platform_check;
alter table public.publishing_queue add constraint publishing_queue_target_platform_check
  check (target_platform in ('website','google_business_profile','facebook','instagram','linkedin','tiktok','google_ads','meta_ads','tiktok_ads','microsoft_ads','x','reddit','nextdoor','craigslist','email','sms','zillow_network','apartments_feed','tenantcloud','turbotenant','manual'));
