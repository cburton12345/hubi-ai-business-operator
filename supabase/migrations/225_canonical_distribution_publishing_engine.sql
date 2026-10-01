-- Canonical create-once distribution engine.
-- Provider-specific payloads live on destination rows; the canonical object remains provider neutral.

create table if not exists public.distribution_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  publication_type text not null check (publication_type in ('organic_post','paid_ad','listing','promotion','job_post','service_offer','email_campaign','sms_campaign','webpage')),
  title text not null,
  body text not null,
  canonical_payload_json jsonb not null default '{}'::jsonb,
  approval_mode text not null default 'approval_required' check (approval_mode in ('draft_first','approval_required','policy','autopilot')),
  status text not null default 'draft' check (status in ('draft','needs_approval','approved','scheduled','publishing','partially_published','published','paused','failed','canceled','archived')),
  campaign_key text,
  scheduled_for timestamptz,
  recurrence_rule text,
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid references public.users(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publication_id uuid not null references public.distribution_publications(id) on delete cascade,
  destination_key text not null,
  provider_key text not null,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  distribution_method text not null check (distribution_method in ('official_api','feed','signed_bridge','assisted_browser','manual')),
  status text not null default 'draft' check (status in ('draft','unsupported','needs_connection','needs_approval','needs_human','ready','queued','running','succeeded','partially_succeeded','failed','paused','removed','canceled')),
  capability_snapshot_json jsonb not null default '{}'::jsonb,
  adapted_payload_json jsonb not null default '{}'::jsonb,
  preview_json jsonb not null default '{}'::jsonb,
  attribution_json jsonb not null default '{}'::jsonb,
  analytics_json jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  external_reference text,
  external_url text,
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  published_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.distribution_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  destination_id uuid not null references public.distribution_destinations(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  action_key text not null default 'publish' check (action_key in ('publish','update','pause','resume','remove','refresh_status','collect_analytics')),
  status text not null check (status in ('queued','running','succeeded','needs_human','retry_scheduled','failed','canceled')),
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  provider_reference text,
  error_code text,
  error_message text,
  retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (destination_id, attempt_number, action_key)
);

create table if not exists public.distribution_asset_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publication_id uuid not null references public.distribution_publications(id) on delete cascade,
  destination_id uuid references public.distribution_destinations(id) on delete cascade,
  source_asset_id text not null,
  variant_kind text not null check (variant_kind in ('image','video','document','thumbnail','caption')),
  aspect_ratio text,
  width integer,
  height integer,
  duration_seconds numeric,
  mime_type text,
  storage_url text,
  status text not null default 'planned' check (status in ('planned','processing','ready','failed','archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_inbound_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  destination_id uuid references public.distribution_destinations(id) on delete set null,
  provider_key text not null,
  destination_key text not null,
  event_type text not null check (event_type in ('lead','reply','comment','message','reaction','delivery','bounce','complaint','unsubscribe','provider_warning','analytics')),
  provider_event_id text,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key, provider_event_id)
);

alter table public.publishing_queue add column if not exists distribution_publication_id uuid references public.distribution_publications(id) on delete set null;
alter table public.publishing_queue add column if not exists distribution_destination_id uuid references public.distribution_destinations(id) on delete set null;
alter table public.publishing_queue add column if not exists content_version integer not null default 1 check (content_version > 0);

alter table public.publishing_queue drop constraint if exists publishing_queue_target_platform_check;
alter table public.publishing_queue add constraint publishing_queue_target_platform_check
  check (target_platform in ('website','google_business_profile','facebook','instagram','linkedin','tiktok','google_ads','meta_ads','tiktok_ads','microsoft_ads','x','reddit','nextdoor','craigslist','email','sms','manual'));

alter table public.approvals drop constraint if exists approvals_target_type_check;
alter table public.approvals add constraint approvals_target_type_check
  check (target_type in ('ai_draft','recommendation','campaign_change','page_change','growth_action','growth_opportunity','distribution_publication','distribution_destination'));

create index if not exists idx_distribution_publications_queue on public.distribution_publications(tenant_id, status, scheduled_for, created_at desc);
create index if not exists idx_distribution_destinations_queue on public.distribution_destinations(tenant_id, status, scheduled_for, next_retry_at);
create index if not exists idx_distribution_destinations_publication on public.distribution_destinations(publication_id, destination_key);
create index if not exists idx_distribution_attempts_destination on public.distribution_attempts(destination_id, created_at desc);
create index if not exists idx_distribution_inbound_events_tenant on public.distribution_inbound_events(tenant_id, occurred_at desc);
create index if not exists idx_publishing_queue_distribution on public.publishing_queue(distribution_publication_id, distribution_destination_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'distribution_publications',
    'distribution_destinations',
    'distribution_attempts',
    'distribution_asset_variants',
    'distribution_inbound_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, 'canonical_distribution_engine', 'enabled', null, 'monthly',
  '{"category":"Growth","description":"Create once, adapt and distribute through capability-aware provider adapters with approval, attribution and delivery truth.","approvalMode":"policy","publicFacing":true}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
