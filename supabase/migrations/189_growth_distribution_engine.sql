-- Extend the existing closed-loop growth operator with provider-independent
-- distribution, community intelligence, scoped autonomy, and opportunity intake.

create table if not exists public.growth_objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  service_focus text,
  geography_json jsonb not null default '{}'::jsonb,
  target_revenue_cents integer check (target_revenue_cents is null or target_revenue_cents >= 0),
  target_leads integer check (target_leads is null or target_leads >= 0),
  target_jobs integer check (target_jobs is null or target_jobs >= 0),
  time_horizon_days integer not null default 30 check (time_horizon_days between 1 and 730),
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  channel_keys text[] not null default array[]::text[],
  autonomy_level text not null default 'suggest'
    check (autonomy_level in ('suggest', 'approve', 'autopilot')),
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_distribution_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider_account_id uuid references public.provider_accounts(id) on delete set null,
  channel_key text not null,
  provider_key text not null,
  account_type text not null default 'business'
    check (account_type in ('business', 'page', 'group', 'personal', 'community', 'listing', 'mailbox', 'other')),
  display_name text not null,
  external_account_id text,
  external_profile_id text,
  profile_url text,
  connection_mode text not null default 'manual'
    check (connection_mode in ('official_api', 'assisted_browser', 'manual', 'signed_bridge')),
  capability_keys text[] not null default array[]::text[],
  authorization_status text not null default 'not_connected'
    check (authorization_status in ('not_connected', 'pending', 'connected', 'expired', 'revoked', 'verification_required')),
  autonomy_level text not null default 'suggest'
    check (autonomy_level in ('suggest', 'approve', 'autopilot')),
  risk_state text not null default 'healthy'
    check (risk_state in ('healthy', 'caution', 'throttled', 'verification_required', 'restricted', 'cooldown', 'disabled')),
  verification_status text not null default 'unknown'
    check (verification_status in ('unknown', 'not_required', 'pending', 'verified', 'failed', 'expired')),
  restricted_until timestamptz,
  cooldown_until timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, channel_key, provider_key, display_name)
);

create table if not exists public.growth_communities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  channel_key text not null,
  external_community_id text,
  name text not null,
  url text,
  geography_json jsonb not null default '{}'::jsonb,
  relevance_score integer not null default 50 check (relevance_score between 0 and 100),
  rules_text text,
  rules_source_url text,
  rules_checked_at timestamptz,
  posting_policy text not null default 'suggest_only'
    check (posting_policy in ('disabled', 'suggest_only', 'approval_required', 'autopilot_allowed')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'restricted', 'archived')),
  last_posted_at timestamptz,
  last_removed_at timestamptz,
  engagement_json jsonb not null default '{}'::jsonb,
  revenue_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, channel_key, name)
);

create table if not exists public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete set null,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  community_id uuid references public.growth_communities(id) on delete set null,
  source_id uuid references public.growth_sources(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  channel_key text not null,
  external_reference text,
  source_url text,
  author_label text,
  body_excerpt text not null,
  detected_intent text not null default 'unknown'
    check (detected_intent in ('expressed_demand', 'recommendation_request', 'price_question', 'availability_question', 'complaint', 'competitor_mention', 'general_interest', 'unknown')),
  service_focus text,
  geography_text text,
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  geography_score integer not null default 0 check (geography_score between 0 and 100),
  objective_score integer not null default 0 check (objective_score between 0 and 100),
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  recommended_action text,
  suggested_response text,
  status text not null default 'detected'
    check (status in ('detected', 'needs_review', 'approved', 'queued', 'responded', 'converted_to_lead', 'dismissed', 'expired', 'blocked')),
  risk_flags text[] not null default array[]::text[],
  detected_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_key, external_reference)
);

create table if not exists public.growth_autonomy_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete cascade,
  identity_id uuid references public.growth_distribution_identities(id) on delete cascade,
  community_id uuid references public.growth_communities(id) on delete cascade,
  channel_key text,
  action_key text not null,
  autonomy_level text not null default 'suggest'
    check (autonomy_level in ('suggest', 'approve', 'autopilot')),
  enabled boolean not null default true,
  daily_action_limit integer check (daily_action_limit is null or daily_action_limit >= 0),
  minimum_interval_minutes integer check (minimum_interval_minutes is null or minimum_interval_minutes >= 0),
  requires_verified_identity boolean not null default true,
  risk_policy_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_action_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete set null,
  identity_id uuid references public.growth_distribution_identities(id) on delete set null,
  community_id uuid references public.growth_communities(id) on delete set null,
  opportunity_id uuid references public.growth_opportunities(id) on delete set null,
  queue_id uuid references public.outbound_action_queue(id) on delete set null,
  channel_key text not null,
  action_key text not null,
  execution_mode text not null default 'manual'
    check (execution_mode in ('official_api', 'assisted_browser', 'manual', 'signed_bridge')),
  status text not null default 'planned'
    check (status in ('planned', 'needs_approval', 'approved', 'queued', 'running', 'succeeded', 'failed', 'blocked', 'canceled')),
  risk_state text not null default 'healthy'
    check (risk_state in ('healthy', 'caution', 'throttled', 'verification_required', 'restricted', 'cooldown', 'disabled')),
  provider_reference text,
  failure_code text,
  failure_message text,
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.publishing_queue drop constraint if exists publishing_queue_target_platform_check;
alter table public.publishing_queue add constraint publishing_queue_target_platform_check
  check (target_platform in ('website', 'google_business_profile', 'facebook', 'instagram', 'linkedin', 'x', 'reddit', 'nextdoor', 'craigslist', 'email', 'sms', 'manual'));

alter table public.approvals drop constraint if exists approvals_target_type_check;
alter table public.approvals add constraint approvals_target_type_check
  check (target_type in ('ai_draft', 'recommendation', 'campaign_change', 'page_change', 'growth_action', 'growth_opportunity'));

create index if not exists idx_growth_objectives_active on public.growth_objectives(tenant_id, brand_id, status, created_at desc);
create index if not exists idx_growth_distribution_identity_health on public.growth_distribution_identities(tenant_id, risk_state, authorization_status, channel_key);
create index if not exists idx_growth_communities_active on public.growth_communities(tenant_id, brand_id, status, relevance_score desc);
create index if not exists idx_growth_opportunities_queue on public.growth_opportunities(tenant_id, status, overall_score desc, detected_at desc);
create index if not exists idx_growth_action_attempts_health on public.growth_action_attempts(tenant_id, status, risk_state, created_at desc);
create index if not exists idx_growth_autonomy_scope_resolution on public.growth_autonomy_scopes(tenant_id, brand_id, channel_key, action_key, enabled);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'growth_objectives',
    'growth_distribution_identities',
    'growth_communities',
    'growth_opportunities',
    'growth_autonomy_scopes',
    'growth_action_attempts'
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
select t.id, 'growth_distribution_engine', 'enabled', 1000, 'monthly',
  '{"category":"Growth","description":"Provider-independent growth objectives, distribution identities, community intelligence, opportunity detection, and risk-governed actions.","approvalMode":"scoped","publicFacing":true}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
