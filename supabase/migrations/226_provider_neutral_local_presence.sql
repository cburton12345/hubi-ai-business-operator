-- Provider-neutral local presence control plane. Google Business Profile is
-- the first adapter; Apple, Bing, directories and review providers share it.

create table if not exists public.local_presence_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider_key text not null,
  provider_location_key text not null,
  business_profile_location_id uuid references public.business_profile_locations(id) on delete set null,
  display_name text not null,
  status text not null default 'monitoring' check (status in ('draft','monitoring','healthy','needs_attention','verification_required','paused','disconnected')),
  profile_health_score integer not null default 0 check (profile_health_score between 0 and 100),
  completeness_score integer not null default 0 check (completeness_score between 0 and 100),
  consistency_score integer not null default 0 check (consistency_score between 0 and 100),
  freshness_score integer not null default 0 check (freshness_score between 0 and 100),
  canonical_business_json jsonb not null default '{}'::jsonb,
  provider_snapshot_json jsonb not null default '{}'::jsonb,
  capability_snapshot_json jsonb not null default '{}'::jsonb,
  last_profile_sync_at timestamptz,
  last_content_at timestamptz,
  last_review_sync_at timestamptz,
  last_performance_sync_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, provider_location_key)
);

create table if not exists public.local_presence_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider_key text not null,
  authority_mode text not null default 'approval_required' check (authority_mode in ('suggest','approval_required','autopilot')),
  keep_profile_accurate boolean not null default true,
  use_tracked_phone_when_appropriate boolean not null default false,
  auto_prepare_posts boolean not null default true,
  auto_request_reviews boolean not null default true,
  positive_reply_opt_in boolean not null default false,
  positive_reply_min_stars integer not null default 4 check (positive_reply_min_stars between 1 and 5),
  negative_review_threshold integer not null default 3 check (negative_review_threshold between 1 and 5),
  negative_review_route text not null default 'owner' check (negative_review_route in ('owner','service_recovery','approval_queue')),
  stale_after_days integer not null default 45 check (stale_after_days between 7 and 365),
  response_rules_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, provider_key)
);

create table if not exists public.local_presence_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.local_presence_profiles(id) on delete cascade,
  issue_key text not null,
  field_key text,
  issue_type text not null check (issue_type in ('missing','inconsistent','stale','provider_update','policy','verification','performance','reputation')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','recommended','needs_approval','approved','queued','resolved','dismissed','blocked')),
  title text not null,
  explanation text,
  current_value_json jsonb not null default 'null'::jsonb,
  recommended_value_json jsonb not null default 'null'::jsonb,
  safe_to_auto_fix boolean not null default false,
  provider_action text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, issue_key)
);

create table if not exists public.local_presence_review_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.local_presence_profiles(id) on delete cascade,
  business_profile_review_id uuid references public.business_profile_reviews(id) on delete cascade,
  provider_review_key text not null,
  action_type text not null check (action_type in ('prepare_reply','publish_reply','update_reply','delete_reply','route_owner','service_recovery','flag_for_review')),
  status text not null default 'draft' check (status in ('draft','needs_approval','approved','queued','running','succeeded','failed','blocked','canceled')),
  proposed_reply text,
  owner_opt_in_snapshot boolean not null default false,
  personalization_json jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default array[]::text[],
  idempotency_key text not null,
  provider_reference text,
  failure_code text,
  failure_message text,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.local_presence_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.local_presence_profiles(id) on delete cascade,
  provider_key text not null,
  metric_key text not null,
  metric_date date not null,
  value numeric not null default 0,
  breakdown_json jsonb not null default '{}'::jsonb,
  source text not null default 'provider_api' check (source in ('provider_api','ferocity_attribution','manual','estimated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, metric_key, metric_date, breakdown_json)
);

create table if not exists public.local_presence_search_queries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.local_presence_profiles(id) on delete cascade,
  provider_key text not null,
  period_start date not null,
  period_end date not null,
  query_text text not null,
  impressions_value numeric,
  impressions_threshold numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_start, period_end, query_text)
);

create table if not exists public.local_presence_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  event_type text not null check (event_type in ('job_completed','photo_added','promotion_created','service_changed','hours_changed','location_changed','review_received','profile_stale','manual')),
  source_table text,
  source_id uuid,
  status text not null default 'new' check (status in ('new','evaluated','planned','queued','completed','ignored','blocked')),
  event_payload_json jsonb not null default '{}'::jsonb,
  recommended_destinations text[] not null default array[]::text[],
  distribution_publication_id uuid references public.distribution_publications(id) on delete set null,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

alter table public.publishing_queue drop constraint if exists publishing_queue_target_platform_check;
alter table public.publishing_queue add constraint publishing_queue_target_platform_check
  check (target_platform in ('website','google_business_profile','apple_business_connect','bing_places','directory_sync','review_platform','facebook','instagram','linkedin','tiktok','google_ads','meta_ads','tiktok_ads','microsoft_ads','x','reddit','nextdoor','craigslist','email','sms','manual'));

alter table public.approvals drop constraint if exists approvals_target_type_check;
alter table public.approvals add constraint approvals_target_type_check
  check (target_type in ('ai_draft','recommendation','campaign_change','page_change','growth_action','growth_opportunity','distribution_publication','distribution_destination','local_presence_issue','local_presence_review_action'));

create index if not exists idx_local_presence_profiles_health on public.local_presence_profiles(tenant_id,status,profile_health_score);
create index if not exists idx_local_presence_issues_open on public.local_presence_issues(tenant_id,status,severity,detected_at desc);
create index if not exists idx_local_presence_review_actions_queue on public.local_presence_review_actions(tenant_id,status,created_at);
create index if not exists idx_local_presence_metrics_date on public.local_presence_metrics(tenant_id,profile_id,metric_date desc);
create index if not exists idx_local_presence_queries_period on public.local_presence_search_queries(tenant_id,profile_id,period_end desc);
create index if not exists idx_local_presence_events_queue on public.local_presence_events(tenant_id,status,occurred_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['local_presence_profiles','local_presence_policies','local_presence_issues','local_presence_review_actions','local_presence_metrics','local_presence_search_queries','local_presence_events']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

insert into public.local_presence_policies (tenant_id,brand_id,provider_key)
select b.tenant_id,b.id,'google_business_profile' from public.brands b where b.status='active'
on conflict (tenant_id,brand_id,provider_key) do nothing;

insert into public.workspace_feature_entitlements (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select t.id,'local_presence','enabled',null,'monthly',
  '{"category":"Growth","description":"Provider-neutral profile accuracy, reputation, local publishing, performance and source-to-revenue optimization.","approvalMode":"policy","publicFacing":true}'::jsonb
from public.tenants t where t.status <> 'archived'
on conflict (tenant_id,feature_key) do update set metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,updated_at=now();
