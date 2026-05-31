create table if not exists public.growth_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  source_family text not null
    check (source_family in ('organic', 'gbp', 'paid', 'email', 'sms', 'referral', 'direct', 'manual', 'unknown')),
  source_name text not null,
  campaign_name text,
  service_focus text,
  city_focus text,
  landing_url text,
  tracking_code text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, source_family, source_name, campaign_name, service_focus, city_focus)
);

create table if not exists public.growth_attribution_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  source_id uuid references public.growth_sources(id) on delete set null,
  event_type text not null
    check (event_type in ('visit', 'form_submission', 'lead_created', 'estimate_sent', 'estimate_viewed', 'estimate_approved', 'job_won', 'invoice_paid', 'review_received', 'manual_adjustment')),
  entity_type text
    check (entity_type in ('lead', 'customer', 'estimate', 'job', 'invoice', 'review', 'draft', 'calendar_item')),
  entity_id uuid,
  revenue_cents integer not null default 0,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.content_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  quality_status text not null default 'needs_review'
    check (quality_status in ('needs_review', 'passed', 'blocked', 'needs_edit')),
  usefulness_score integer not null default 0 check (usefulness_score between 0 and 100),
  local_relevance_score integer not null default 0 check (local_relevance_score between 0 and 100),
  originality_score integer not null default 0 check (originality_score between 0 and 100),
  conversion_clarity_score integer not null default 0 check (conversion_clarity_score between 0 and 100),
  risk_flags text[] not null default array[]::text[],
  reviewer_notes text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id)
);

create table if not exists public.publishing_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  draft_id uuid references public.ai_drafts(id) on delete set null,
  calendar_item_id uuid references public.marketing_calendar_items(id) on delete set null,
  target_platform text not null
    check (target_platform in ('website', 'google_business_profile', 'facebook', 'instagram', 'linkedin', 'email', 'sms', 'manual')),
  provider_status text not null default 'not_connected'
    check (provider_status in ('not_connected', 'ready', 'paused', 'error')),
  queue_status text not null default 'draft'
    check (queue_status in ('draft', 'needs_approval', 'approved', 'scheduled', 'published_manually', 'failed', 'canceled')),
  scheduled_for timestamptz,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  external_reference text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_request_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  trigger_event text not null default 'job_completed'
    check (trigger_event in ('job_completed', 'invoice_paid', 'manual', 'customer_followup')),
  channel text not null default 'sms'
    check (channel in ('sms', 'email', 'manual')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent_manually', 'completed', 'suppressed', 'canceled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  rating_received integer check (rating_received between 1 and 5),
  review_url text,
  negative_interception_status text not null default 'not_applicable'
    check (negative_interception_status in ('not_applicable', 'needs_service_recovery', 'resolved', 'escalated')),
  ai_response_draft text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follow_up_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  workflow_type text not null
    check (workflow_type in ('new_lead_response', 'stale_lead_recovery', 'estimate_followup', 'callback', 'nurture', 'invoice_followup')),
  channel text not null default 'manual'
    check (channel in ('manual', 'sms', 'email', 'phone')),
  status text not null default 'open'
    check (status in ('open', 'scheduled', 'completed', 'missed', 'canceled')),
  due_at timestamptz,
  completed_at timestamptz,
  assigned_user_id uuid references public.users(id) on delete set null,
  ai_suggested_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  event_family text not null
    check (event_family in ('lead', 'marketing', 'seo', 'content', 'review', 'follow_up', 'estimate', 'job', 'invoice', 'revenue', 'ai', 'billing', 'system')),
  event_type text not null,
  title text not null,
  body text,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'customer_visible', 'system')),
  primary_entity_type text,
  primary_entity_id uuid,
  source_table text,
  source_id uuid,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_operator_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  insight_key text not null,
  insight_type text not null
    check (insight_type in ('content_quality', 'lead_recovery', 'seo_compounding', 'review_flow', 'conversion_tracking', 'revenue_attribution', 'publishing_consistency')),
  severity text not null default 'medium'
    check (severity in ('info', 'low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  title text not null,
  summary text not null,
  recommendation text not null,
  impact_estimate text,
  action_href text,
  metadata_json jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, insight_key)
);

create table if not exists public.workspace_feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  status text not null default 'enabled'
    check (status in ('enabled', 'disabled', 'trial', 'limited')),
  usage_limit integer,
  usage_period text default 'monthly'
    check (usage_period in ('daily', 'weekly', 'monthly', 'annual')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_key)
);

create index if not exists idx_growth_sources_tenant_brand on public.growth_sources(tenant_id, brand_id, status);
create index if not exists idx_growth_attribution_events_tenant_type on public.growth_attribution_events(tenant_id, event_type, occurred_at desc);
create index if not exists idx_growth_attribution_events_entity on public.growth_attribution_events(entity_type, entity_id);
create index if not exists idx_content_quality_reviews_tenant_status on public.content_quality_reviews(tenant_id, quality_status, created_at desc);
create index if not exists idx_publishing_queue_tenant_status on public.publishing_queue(tenant_id, queue_status, scheduled_for);
create index if not exists idx_review_request_workflows_tenant_status on public.review_request_workflows(tenant_id, status, scheduled_for);
create index if not exists idx_follow_up_workflows_tenant_status on public.follow_up_workflows(tenant_id, status, due_at);
create index if not exists idx_operator_timeline_events_tenant on public.operator_timeline_events(tenant_id, occurred_at desc);
create index if not exists idx_operator_timeline_events_entity on public.operator_timeline_events(primary_entity_type, primary_entity_id);
create index if not exists idx_growth_operator_insights_tenant_status on public.growth_operator_insights(tenant_id, status, severity, detected_at desc);
create index if not exists idx_workspace_feature_entitlements_tenant on public.workspace_feature_entitlements(tenant_id, status);

alter table public.growth_sources enable row level security;
alter table public.growth_attribution_events enable row level security;
alter table public.content_quality_reviews enable row level security;
alter table public.publishing_queue enable row level security;
alter table public.review_request_workflows enable row level security;
alter table public.follow_up_workflows enable row level security;
alter table public.operator_timeline_events enable row level security;
alter table public.growth_operator_insights enable row level security;
alter table public.workspace_feature_entitlements enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'growth_sources',
    'growth_attribution_events',
    'content_quality_reviews',
    'publishing_queue',
    'review_request_workflows',
    'follow_up_workflows',
    'operator_timeline_events',
    'growth_operator_insights'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

drop policy if exists workspace_feature_entitlements_tenant_admin on public.workspace_feature_entitlements;
create policy workspace_feature_entitlements_tenant_admin
on public.workspace_feature_entitlements
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  defaults.feature_key,
  defaults.status,
  defaults.usage_limit,
  defaults.usage_period,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('seo_autopilot', 'enabled', 150, 'monthly', '{"description":"Draft-only SEO pages and refreshes"}'::jsonb),
    ('publishing_queue', 'enabled', 300, 'monthly', '{"description":"Approval and scheduled publishing readiness"}'::jsonb),
    ('review_requests', 'enabled', 500, 'monthly', '{"description":"Manual or provider-ready review request workflows"}'::jsonb),
    ('growth_attribution', 'enabled', null, 'monthly', '{"description":"Closed-loop marketing to revenue reporting"}'::jsonb),
    ('follow_up_recovery', 'enabled', 500, 'monthly', '{"description":"Manual/provider-ready stale lead and estimate follow-up"}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do nothing;
