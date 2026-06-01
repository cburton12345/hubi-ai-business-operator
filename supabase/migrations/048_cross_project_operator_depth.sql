create table if not exists public.service_area_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  name text not null,
  city text,
  state text,
  zip text,
  latitude numeric,
  longitude numeric,
  radius_miles integer not null default 25,
  priority integer not null default 50,
  status text not null default 'active'
    check (status in ('active', 'paused', 'draft', 'archived')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_crew_bench (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider_type text not null default 'subcontractor'
    check (provider_type in ('subcontractor', 'worker', 'vendor', 'referral_partner', 'customer_contact', 'other')),
  display_name text not null,
  company_name text,
  phone text,
  email text,
  city text,
  state text,
  zip text,
  skills text,
  service_categories text[] not null default '{}',
  availability_status text not null default 'unknown'
    check (availability_status in ('available_today', 'available_tomorrow', 'available_weekends', 'available_next_week', 'busy', 'unknown', 'do_not_contact')),
  minimum_rate_cents integer,
  travel_radius_miles integer,
  source text not null default 'manual'
    check (source in ('manual', 'marketplacepro', 'referral', 'customer', 'import')),
  marketplacepro_object_id text,
  relationship_status text not null default 'prospect'
    check (relationship_status in ('prospect', 'saved', 'active', 'preferred', 'inactive', 'blocked')),
  private_notes text,
  last_contacted_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  subscription_type text not null
    check (subscription_type in ('source', 'service', 'city', 'customer', 'campaign', 'marketplacepro_vendor', 'public_profile', 'provider', 'keyword')),
  label text not null,
  match_value text,
  channel text not null default 'email'
    check (channel in ('email', 'sms', 'dashboard', 'webhook')),
  recipient_email text,
  recipient_phone text,
  frequency text not null default 'daily'
    check (frequency in ('instant', 'daily', 'weekly', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  last_triggered_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connector_run_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider_key text not null,
  run_type text not null default 'sync'
    check (run_type in ('sync', 'import', 'export', 'health_check', 'webhook', 'manual_check')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'partial', 'skipped')),
  records_found integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  failures integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.credential_rotation_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  credential_label text,
  status text not null default 'watching'
    check (status in ('watching', 'due_soon', 'expired', 'rotated', 'dismissed')),
  severity text not null default 'normal'
    check (severity in ('low', 'normal', 'high')),
  rotation_due_at timestamptz,
  last_checked_at timestamptz,
  alert_sent_at timestamptz,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, credential_label)
);

create table if not exists public.operator_daily_digests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  digest_date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'archived')),
  urgent_leads integer not null default 0,
  stale_estimates integer not null default 0,
  overdue_invoices integer not null default 0,
  review_opportunities integer not null default 0,
  seo_refreshes integer not null default 0,
  provider_issues integer not null default 0,
  summary text,
  next_actions_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, digest_date)
);

create table if not exists public.lead_source_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  source_family text,
  source_name text not null,
  campaign_name text,
  service_focus text,
  city_focus text,
  lead_count integer not null default 0,
  qualified_count integer not null default 0,
  estimate_count integer not null default 0,
  won_count integer not null default 0,
  revenue_cents integer not null default 0,
  fit_score integer not null default 50 check (fit_score between 0 and 100),
  urgency_score integer not null default 50 check (urgency_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  recommendation text,
  measured_from timestamptz,
  measured_to timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_review_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  related_type text not null
    check (related_type in ('estimate', 'invoice', 'job', 'contract', 'spec', 'ugc_asset', 'customer_upload', 'other')),
  related_id uuid,
  title text not null,
  document_url text,
  storage_bucket text,
  storage_path text,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'reviewing', 'approved', 'needs_changes', 'rejected', 'archived')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  summary text,
  required_actions_json jsonb not null default '[]'::jsonb,
  reviewer_notes text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_first_export_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  export_type text not null
    check (export_type in ('website_page', 'marketplacepro_profile', 'gbp_post', 'review_reply', 'ad_creative', 'seo_refresh', 'email_campaign', 'sms_campaign', 'other')),
  provider_key text,
  target_label text,
  title text not null,
  body text,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'exported', 'published_manually', 'blocked', 'archived')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  source_table text,
  source_id uuid,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,
  blocked_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_issue_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  source text not null default 'public_form'
    check (source in ('public_form', 'proof_page', 'customer_portal', 'integration', 'marketplacepro', 'internal', 'other')),
  issue_type text not null default 'general',
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed', 'archived')),
  severity text not null default 'normal'
    check (severity in ('low', 'normal', 'high')),
  requester_name text,
  requester_email text,
  requester_phone text,
  subject text,
  message text not null,
  related_type text,
  related_id uuid,
  assigned_to_user_id uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_endpoint_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  endpoint_key text not null,
  ip_hash text,
  event_type text not null default 'request'
    check (event_type in ('request', 'accepted', 'rejected', 'rate_limited', 'webhook_duplicate', 'webhook_invalid', 'upload_rejected')),
  provider_key text,
  idempotency_key text,
  status_code integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_public_endpoint_idempotency
  on public.public_endpoint_events(endpoint_key, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_service_area_targets_tenant_status
  on public.service_area_targets(tenant_id, brand_id, status, priority desc);

create unique index if not exists idx_service_area_targets_unique_area
  on public.service_area_targets(tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), name, coalesce(city, ''), coalesce(state, ''));

create index if not exists idx_provider_crew_bench_tenant_status
  on public.provider_crew_bench(tenant_id, relationship_status, availability_status, updated_at desc);

create index if not exists idx_operator_subscriptions_tenant_status
  on public.operator_subscriptions(tenant_id, status, subscription_type);

create index if not exists idx_connector_run_history_tenant_provider
  on public.connector_run_history(tenant_id, provider_key, started_at desc);

create index if not exists idx_credential_rotation_alerts_tenant_status
  on public.credential_rotation_alerts(tenant_id, status, rotation_due_at);

create unique index if not exists idx_credential_rotation_alerts_active
  on public.credential_rotation_alerts(tenant_id, provider_key, coalesce(credential_label, ''))
  where status in ('watching', 'due_soon', 'expired');

create index if not exists idx_operator_daily_digests_tenant_date
  on public.operator_daily_digests(tenant_id, digest_date desc);

create index if not exists idx_lead_source_scores_tenant_fit
  on public.lead_source_scores(tenant_id, brand_id, fit_score desc, urgency_score desc);

create index if not exists idx_document_review_items_tenant_status
  on public.document_review_items(tenant_id, status, risk_level, created_at desc);

create index if not exists idx_review_first_export_queue_tenant_status
  on public.review_first_export_queue(tenant_id, status, export_type, created_at desc);

create index if not exists idx_support_issue_queue_tenant_status
  on public.support_issue_queue(tenant_id, status, severity, created_at desc);

create index if not exists idx_public_endpoint_events_recent
  on public.public_endpoint_events(endpoint_key, created_at desc);

alter table public.service_area_targets enable row level security;
alter table public.provider_crew_bench enable row level security;
alter table public.operator_subscriptions enable row level security;
alter table public.connector_run_history enable row level security;
alter table public.credential_rotation_alerts enable row level security;
alter table public.operator_daily_digests enable row level security;
alter table public.lead_source_scores enable row level security;
alter table public.document_review_items enable row level security;
alter table public.review_first_export_queue enable row level security;
alter table public.support_issue_queue enable row level security;
alter table public.public_endpoint_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_area_targets',
    'provider_crew_bench',
    'operator_subscriptions',
    'connector_run_history',
    'credential_rotation_alerts',
    'operator_daily_digests',
    'lead_source_scores',
    'document_review_items',
    'review_first_export_queue',
    'support_issue_queue',
    'public_endpoint_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (tenant_id is null or public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (tenant_id is null or public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('service_area_intelligence', 'enabled', 250, 'monthly', '{"category":"Growth","description":"ZIP, city, radius, service area, and distance-aware routing intelligence","approvalMode":"review_required","plainRule":"Use service areas to route leads and prioritize city/service pages."}'::jsonb),
    ('crew_bench', 'enabled', 250, 'monthly', '{"category":"Operations","description":"Saved subcontractors, workers, partners, and referral relationships","approvalMode":"manual","plainRule":"Keep private provider notes and availability organized."}'::jsonb),
    ('connector_health', 'enabled', 500, 'monthly', '{"category":"Integrations","description":"Connector run history, health logs, and credential rotation alerts","approvalMode":"manual","plainRule":"Know which outside tools are healthy before trusting automation."}'::jsonb),
    ('operator_digest', 'enabled', 31, 'monthly', '{"category":"Reporting","description":"Daily operator digest for leads, estimates, invoices, reviews, SEO, and provider issues","approvalMode":"review_required","plainRule":"Give operators one daily command summary."}'::jsonb),
    ('review_first_exports', 'enabled', 500, 'monthly', '{"category":"Safety","description":"Review queue for website, MarketplacePro, GBP, ads, review replies, and SEO exports","approvalMode":"review_required","plainRule":"Nothing public leaves Ferocity without review."}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'service_area_intelligence', 'Service Area Basics', true, '1 target area', 170, '{"crossProjectBacklog":true}'::jsonb),
  ('growth', 'service_area_intelligence', 'Service Area Intelligence', true, 'City, ZIP, radius, and SEO routing', 170, '{"crossProjectBacklog":true}'::jsonb),
  ('operator', 'crew_bench', 'Provider and Crew Bench', true, 'Saved providers, workers, partners, and private notes', 175, '{"crossProjectBacklog":true}'::jsonb),
  ('operator', 'connector_health', 'Connector Health', true, 'Run history, credential alerts, and source checks', 180, '{"crossProjectBacklog":true}'::jsonb),
  ('operator', 'operator_digest', 'Daily Operator Digest', true, 'Daily command summary', 185, '{"crossProjectBacklog":true}'::jsonb),
  ('growth', 'review_first_exports', 'Review-First Export Queue', true, 'Draft exports for website, GBP, ads, reviews, and MarketplacePro', 190, '{"crossProjectBacklog":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
