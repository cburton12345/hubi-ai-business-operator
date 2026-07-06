create table if not exists public.owner_daily_briefings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brief_date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent_manually', 'archived')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  title text not null,
  summary text not null,
  yesterday_json jsonb not null default '{}'::jsonb,
  today_json jsonb not null default '{}'::jsonb,
  owner_attention_json jsonb not null default '[]'::jsonb,
  ai_handled_json jsonb not null default '[]'::jsonb,
  sections_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brief_date)
);

create table if not exists public.ai_monitor_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_key text not null,
  source_type text not null
    check (source_type in ('lead', 'email', 'review', 'finance', 'job', 'employee', 'marketing', 'competitor', 'bid', 'connected_system', 'owner_event')),
  provider_key text,
  display_name text not null,
  status text not null default 'planned'
    check (status in ('planned', 'not_connected', 'connected', 'needs_attention', 'paused', 'archived')),
  immediate_alert_enabled boolean not null default true,
  daily_brief_enabled boolean not null default true,
  last_checked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_key)
);

create table if not exists public.ai_monitor_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  monitor_area text not null
    check (monitor_area in ('lead', 'estimate', 'job', 'financial', 'customer', 'employee', 'review', 'competitor', 'bid', 'marketing', 'system')),
  rule_key text not null,
  label text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  immediate_alert boolean not null default false,
  daily_brief boolean not null default true,
  action_href text not null default '/app/owner-command-center',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rule_key)
);

create table if not exists public.competitor_monitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  competitor_name text not null,
  website_url text,
  google_business_profile_url text,
  service_area text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'archived')),
  last_checked_at timestamptz,
  summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_owner_daily_briefings_tenant
  on public.owner_daily_briefings(tenant_id, brief_date desc, status);
create index if not exists idx_ai_monitor_sources_tenant
  on public.ai_monitor_sources(tenant_id, source_type, status);
create index if not exists idx_ai_monitor_rules_tenant
  on public.ai_monitor_rules(tenant_id, monitor_area, status, immediate_alert);
create index if not exists idx_competitor_monitors_tenant
  on public.competitor_monitors(tenant_id, status, competitor_name);

alter table public.owner_daily_briefings enable row level security;
alter table public.ai_monitor_sources enable row level security;
alter table public.ai_monitor_rules enable row level security;
alter table public.competitor_monitors enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'owner_daily_briefings',
    'ai_monitor_sources',
    'ai_monitor_rules',
    'competitor_monitors'
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

insert into public.ai_monitor_sources (tenant_id, source_key, source_type, provider_key, display_name, status, immediate_alert_enabled, daily_brief_enabled, metadata_json)
select t.id, defaults.source_key, defaults.source_type, defaults.provider_key, defaults.display_name, defaults.status, defaults.immediate_alert_enabled, defaults.daily_brief_enabled, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('owner_events', 'owner_event', 'ferocity', 'Owner event stream', 'connected', true, true, '{"description":"Shared event stream for Ferocity and connected systems."}'::jsonb),
    ('website_forms', 'lead', 'ferocity_forms', 'Website and landing page leads', 'connected', true, true, '{"description":"Website forms, hosted pages, and public lead capture."}'::jsonb),
    ('email_monitor', 'email', 'gmail_outlook_m365', 'Gmail / Outlook monitor', 'not_connected', true, true, '{"description":"Future email categorization for leads, customers, vendors, financial mail, important items, and spam."}'::jsonb),
    ('reviews_monitor', 'review', 'google_facebook_yelp', 'Review monitor', 'not_connected', true, true, '{"description":"Future review provider monitoring and response drafts."}'::jsonb),
    ('competitor_monitor', 'competitor', 'manual_or_provider', 'Competitor monitor', 'planned', false, true, '{"description":"Competitor review, website, promotion, hiring, and location watchlist."}'::jsonb),
    ('bid_monitor', 'bid', 'govflow_bidops', 'GovFlow / BidOps monitor', 'planned', true, true, '{"description":"Government opportunity matching, deadlines, rebids, and bid scores."}'::jsonb),
    ('marketing_monitor', 'marketing', 'analytics_search_social', 'Marketing performance monitor', 'planned', false, true, '{"description":"Traffic, SEO, landing pages, lead sources, and campaign performance."}'::jsonb),
    ('employee_monitor', 'employee', 'ferocity_operations', 'Employee and field monitor', 'connected', true, true, '{"description":"Clock-ins, assignments, proof, safety, payroll, and productivity signals."}'::jsonb),
    ('finance_monitor', 'finance', 'stripe_invoices_ledger', 'Invoices, payments, and cash monitor', 'planned', true, true, '{"description":"Outstanding invoices, overdue balances, received payments, and cash alerts."}'::jsonb)
) as defaults(source_key, source_type, provider_key, display_name, status, immediate_alert_enabled, daily_brief_enabled, metadata_json)
on conflict (tenant_id, source_key) do update
set source_type = excluded.source_type,
    provider_key = excluded.provider_key,
    display_name = excluded.display_name,
    metadata_json = public.ai_monitor_sources.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.ai_monitor_rules (tenant_id, monitor_area, rule_key, label, severity, immediate_alert, daily_brief, action_href, metadata_json)
select t.id, defaults.monitor_area, defaults.rule_key, defaults.label, defaults.severity, defaults.immediate_alert, defaults.daily_brief, defaults.action_href, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('lead', 'lost_lead_risk', 'Lost lead risk', 'high', true, true, '/app/lead-command', '{"interruptReason":"Lead may be lost without response."}'::jsonb),
    ('lead', 'high_value_lead', 'High value lead', 'high', true, true, '/app/leads', '{"interruptReason":"Money opportunity."}'::jsonb),
    ('customer', 'customer_complaint', 'Customer complaint', 'critical', true, true, '/app/owner-command-center', '{"interruptReason":"Customer trust risk."}'::jsonb),
    ('review', 'negative_review', 'Negative review', 'critical', true, true, '/app/review', '{"interruptReason":"Reputation risk."}'::jsonb),
    ('employee', 'safety_issue', 'Safety issue', 'critical', true, true, '/app/safety-readiness', '{"interruptReason":"Safety risk."}'::jsonb),
    ('employee', 'missed_payroll_issue', 'Missed payroll issue', 'high', true, true, '/app/operations-workforce#payroll', '{"interruptReason":"Payroll risk."}'::jsonb),
    ('financial', 'large_invoice_overdue', 'Large invoice overdue', 'high', true, true, '/app/cash-collection', '{"interruptReason":"Cash risk.","defaultThresholdCents":100000}'::jsonb),
    ('bid', 'urgent_bid_opportunity', 'Urgent bid opportunity', 'high', true, true, '/app/owner-command-center', '{"interruptReason":"Deadline or revenue opportunity."}'::jsonb),
    ('system', 'automation_failure', 'Automation failure', 'high', true, true, '/app/automation-command', '{"interruptReason":"System failed or confidence is low."}'::jsonb),
    ('marketing', 'marketing_performance_shift', 'Marketing performance shift', 'medium', false, true, '/app/reports', '{"briefOnly":true}'::jsonb),
    ('competitor', 'competitor_change', 'Competitor change', 'medium', false, true, '/app/ai-monitoring', '{"briefOnly":true}'::jsonb),
    ('job', 'job_behind_schedule', 'Job behind schedule', 'high', true, true, '/app/service-command', '{"interruptReason":"Delivery risk."}'::jsonb)
) as defaults(monitor_area, rule_key, label, severity, immediate_alert, daily_brief, action_href, metadata_json)
on conflict (tenant_id, rule_key) do update
set monitor_area = excluded.monitor_area,
    label = excluded.label,
    severity = excluded.severity,
    immediate_alert = excluded.immediate_alert,
    daily_brief = excluded.daily_brief,
    action_href = excluded.action_href,
    metadata_json = public.ai_monitor_rules.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, 'ai_monitoring_briefing', 'enabled', 31, 'monthly',
  '{"category":"AI Command","description":"Daily owner briefs and high-signal monitoring over Ferocity and connected systems.","approvalMode":"review_required","plainRule":"Interrupt only for money, risk, disputes, safety, failures, low confidence, or owner approval.","costed":true,"publicFacing":false}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'ai_monitoring_briefing', 'Daily Owner Brief', true, 'Manual daily brief generation', 275, '{"aiCommand":true}'::jsonb),
  ('growth', 'ai_monitoring_briefing', 'AI Monitoring & Briefing Center', true, 'Daily briefs plus monitor queues', 276, '{"aiCommand":true}'::jsonb),
  ('operator', 'ai_monitoring_briefing', 'AI Chief Operating Officer Layer', true, 'Daily briefs, owner escalation, operations monitoring', 277, '{"aiCommand":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
