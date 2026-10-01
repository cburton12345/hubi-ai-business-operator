-- Provider-neutral paid-media read model. Provider credentials remain in the
-- encrypted integration vault; these tables normalize only safe operational
-- state, campaign structure, performance, and audited actions.

create table if not exists public.paid_media_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider_account_id uuid references public.provider_accounts(id) on delete set null,
  provider_key text not null,
  external_account_id text not null,
  display_name text not null,
  activation_state text not null default 'setup_required'
    check (activation_state in ('full_management','read_analytics','measurement_only','setup_required','waiting_for_platform_approval','unavailable')),
  authorization_status text not null default 'not_connected'
    check (authorization_status in ('not_connected','pending','connected','expired','revoked','error')),
  sync_status text not null default 'not_started'
    check (sync_status in ('not_started','queued','syncing','healthy','stale','error','paused')),
  capability_snapshot_json jsonb not null default '{}'::jsonb,
  account_metadata_json jsonb not null default '{}'::jsonb,
  historical_sync_since timestamptz,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_account_id)
);

create table if not exists public.paid_media_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  connection_id uuid not null references public.paid_media_connections(id) on delete cascade,
  provider_key text not null,
  external_campaign_id text not null,
  name text not null,
  provider_campaign_type text,
  objective text,
  status text not null default 'unknown',
  currency text,
  daily_budget_cents bigint check (daily_budget_cents is null or daily_budget_cents >= 0),
  lifetime_budget_cents bigint check (lifetime_budget_cents is null or lifetime_budget_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  tracking_json jsonb not null default '{}'::jsonb,
  provider_payload_json jsonb not null default '{}'::jsonb,
  last_provider_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_campaign_id)
);

create table if not exists public.paid_media_ad_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.paid_media_campaigns(id) on delete cascade,
  provider_key text not null,
  external_ad_group_id text not null,
  name text not null,
  status text not null default 'unknown',
  bid_strategy text,
  targeting_json jsonb not null default '{}'::jsonb,
  budget_json jsonb not null default '{}'::jsonb,
  provider_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_ad_group_id)
);

create table if not exists public.paid_media_creatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid references public.paid_media_campaigns(id) on delete cascade,
  ad_group_id uuid references public.paid_media_ad_groups(id) on delete cascade,
  marketing_asset_id uuid references public.marketing_media_assets(id) on delete set null,
  creative_variant_id uuid references public.marketing_creative_variants(id) on delete set null,
  provider_key text not null,
  external_creative_id text not null,
  external_ad_id text,
  name text not null,
  format text,
  status text not null default 'unknown',
  review_status text,
  destination_url text,
  content_json jsonb not null default '{}'::jsonb,
  provider_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_creative_id)
);

create table if not exists public.paid_media_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.paid_media_connections(id) on delete cascade,
  provider_key text not null,
  entity_type text not null check (entity_type in ('account','campaign','ad_group','ad','creative','placement','audience','conversion')),
  external_entity_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  time_granularity text not null default 'daily' check (time_granularity in ('hourly','daily','weekly','monthly','total')),
  currency text,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  provider_conversions numeric not null default 0 check (provider_conversions >= 0),
  provider_conversion_value_cents bigint not null default 0 check (provider_conversion_value_cents >= 0),
  ferocity_leads integer not null default 0 check (ferocity_leads >= 0),
  qualified_leads integer not null default 0 check (qualified_leads >= 0),
  booked_appointments integer not null default 0 check (booked_appointments >= 0),
  sold_jobs integer not null default 0 check (sold_jobs >= 0),
  attributed_revenue_cents bigint not null default 0 check (attributed_revenue_cents >= 0),
  attributed_gross_profit_cents bigint check (attributed_gross_profit_cents is null or attributed_gross_profit_cents >= 0),
  attribution_confidence numeric(5,4) not null default 0 check (attribution_confidence between 0 and 1),
  provider_metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key, entity_type, external_entity_id, period_start, period_end, time_granularity)
);

create table if not exists public.paid_media_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.paid_media_connections(id) on delete cascade,
  provider_key text not null,
  sync_type text not null check (sync_type in ('account_discovery','initial','incremental','reporting','creative','conversion_reconciliation')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed','canceled')),
  range_start timestamptz,
  range_end timestamptz,
  cursor_json jsonb not null default '{}'::jsonb,
  counts_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.paid_media_action_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.paid_media_connections(id) on delete set null,
  provider_key text not null,
  action_type text not null,
  external_entity_type text,
  external_entity_id text,
  requested_by text not null default 'ferocity',
  autonomy_mode text not null default 'recommend' check (autonomy_mode in ('observe','recommend','approval','autopilot')),
  approval_id uuid references public.approvals(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed','needs_approval','approved','executing','succeeded','failed','rolled_back','blocked','canceled')),
  idempotency_key text not null,
  before_json jsonb not null default '{}'::jsonb,
  requested_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  reason text not null default '',
  error_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key, idempotency_key)
);

create index if not exists paid_media_connections_sync_idx on public.paid_media_connections(tenant_id, provider_key, sync_status, next_sync_at);
create index if not exists paid_media_campaigns_status_idx on public.paid_media_campaigns(tenant_id, provider_key, status, updated_at desc);
create index if not exists paid_media_performance_period_idx on public.paid_media_performance_snapshots(tenant_id, provider_key, period_start desc, entity_type);
create index if not exists paid_media_sync_runs_queue_idx on public.paid_media_sync_runs(tenant_id, status, created_at);
create index if not exists paid_media_action_audit_status_idx on public.paid_media_action_audit(tenant_id, status, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'paid_media_connections','paid_media_campaigns','paid_media_ad_groups','paid_media_creatives',
    'paid_media_performance_snapshots','paid_media_sync_runs','paid_media_action_audit'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

insert into public.provider_connection_lanes (
  tenant_id, capability_key, provider_key, lane_key, display_name,
  connection_status, credentials_status, live_actions_enabled, plain_language_status, metadata_json
)
select t.id, p.provider_key, p.provider_key, lane.lane_key,
  case when lane.lane_key='customer_owned' then 'Customer ' || p.label else 'Ferocity-managed ' || p.label end,
  'not_connected','not_configured',false,
  p.label || ' is represented honestly but is not authorized or certified for this workspace.',
  jsonb_build_object('category','paid_media','activationState',p.activation_state,'sort',p.sort)
from public.tenants t
cross join (values
  ('linkedin_ads','LinkedIn Ads','waiting_for_platform_approval',110),
  ('x_ads','X Ads','waiting_for_platform_approval',120),
  ('pinterest_ads','Pinterest Ads','setup_required',130),
  ('snapchat_ads','Snapchat Ads','setup_required',140),
  ('amazon_ads','Amazon Ads','setup_required',150),
  ('openai_ads','ChatGPT Ads','setup_required',160),
  ('apple_search_ads','Apple Ads','setup_required',170)
) as p(provider_key,label,activation_state,sort)
cross join (values ('customer_owned'),('ferocity_managed')) as lane(lane_key)
where t.status <> 'archived'
on conflict (tenant_id, capability_key, lane_key) do update set
  display_name=excluded.display_name,
  plain_language_status=excluded.plain_language_status,
  metadata_json=public.provider_connection_lanes.metadata_json || excluded.metadata_json,
  updated_at=now();

insert into public.managed_ad_budget_controls (
  tenant_id, provider_key, lane_key, status, prepaid_required, approved_by_customer,
  live_spend_enabled, daily_cap_cents, monthly_cap_cents, management_fee_bps, notes, metadata_json
)
select t.id,p.provider_key,'ferocity_managed','not_ready',true,false,false,0,0,1000,
  'Live spend is blocked until authorization, provider approval, tracking, prepaid funds, written approval, and hard caps are all certified.',
  jsonb_build_object('capability',p.provider_key,'platform',p.label)
from public.tenants t
cross join (values
  ('linkedin_ads','LinkedIn Ads'),('x_ads','X Ads'),('pinterest_ads','Pinterest Ads'),
  ('snapchat_ads','Snapchat Ads'),('amazon_ads','Amazon Ads'),('openai_ads','ChatGPT Ads'),
  ('apple_search_ads','Apple Ads')
) as p(provider_key,label)
where t.status <> 'archived'
on conflict (tenant_id,provider_key,lane_key) do nothing;

insert into public.workspace_feature_entitlements (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select t.id,'provider_neutral_paid_media','enabled',null,'monthly',
  '{"category":"Growth","description":"Normalized paid-media connections, campaign/creative reporting, setup truth, source-to-cash outcomes, approvals and spend safety across supported networks.","approvalMode":"approval_required","publicFacing":true}'::jsonb
from public.tenants t where t.status <> 'archived'
on conflict (tenant_id,feature_key) do update set
  metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,updated_at=now();
