create table if not exists public.app_error_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  source text not null,
  severity text not null default 'error'
    check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_launch_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  check_key text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'failed', 'waived')),
  notes text,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, check_key)
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  name text not null,
  monthly_price_cents integer not null default 0,
  included_workspaces integer not null default 1,
  included_brands integer not null default 1,
  included_ai_runs integer not null default 100,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_key text not null references public.billing_plans(plan_key),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'manual')),
  seats integer not null default 1,
  current_period_start timestamptz,
  current_period_end timestamptz,
  external_customer_ref text,
  external_subscription_ref text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  url text not null,
  event_types_json jsonb not null default '[]'::jsonb,
  status text not null default 'paused'
    check (status in ('paused', 'active', 'disabled')),
  signing_secret_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.app_error_events enable row level security;
alter table public.beta_launch_checks enable row level security;
alter table public.billing_plans enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists app_error_events_platform_or_tenant on public.app_error_events;
create policy app_error_events_platform_or_tenant
on public.app_error_events
for all
using (tenant_id is null or public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (tenant_id is null or public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists beta_launch_checks_tenant_admin on public.beta_launch_checks;
create policy beta_launch_checks_tenant_admin
on public.beta_launch_checks
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists billing_plans_readable on public.billing_plans;
create policy billing_plans_readable
on public.billing_plans
for select
using (true);

drop policy if exists billing_subscriptions_tenant_admin on public.billing_subscriptions;
create policy billing_subscriptions_tenant_admin
on public.billing_subscriptions
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists webhook_endpoints_tenant_admin on public.webhook_endpoints;
create policy webhook_endpoints_tenant_admin
on public.webhook_endpoints
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists webhook_events_tenant_admin on public.webhook_events;
create policy webhook_events_tenant_admin
on public.webhook_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.billing_plans (plan_key, name, monthly_price_cents, included_workspaces, included_brands, included_ai_runs, metadata_json)
values
  ('starter', 'Starter', 9900, 1, 2, 200, '{"stripeConnected": false}'::jsonb),
  ('growth', 'Growth', 29900, 3, 10, 1000, '{"stripeConnected": false}'::jsonb),
  ('operator', 'Operator', 79900, 10, 50, 5000, '{"stripeConnected": false}'::jsonb)
on conflict (plan_key) do update
set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  included_workspaces = excluded.included_workspaces,
  included_brands = excluded.included_brands,
  included_ai_runs = excluded.included_ai_runs,
  active = true,
  metadata_json = excluded.metadata_json;

insert into public.tenants (id, name, slug, account_type, status, billing_status, plan_key, onboarding_status, onboarding_completed_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'Beta Roofing Co',
  'beta-roofing-co',
  'customer',
  'trial',
  'trialing',
  'starter',
  'completed',
  now()
)
on conflict (slug) do update
set name = excluded.name,
    account_type = excluded.account_type,
    status = excluded.status,
    billing_status = excluded.billing_status,
    plan_key = excluded.plan_key,
    onboarding_status = excluded.onboarding_status,
    onboarding_completed_at = excluded.onboarding_completed_at,
    updated_at = now();

insert into public.brands (id, tenant_id, name, slug, domain, business_model, industry, vertical, description, primary_goal, primary_location, risk_profile, status)
values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'Beta Roofing Co',
  'beta-roofing-co',
  'betaroofing.example',
  'local_service',
  'Roofing and storm restoration',
  'roofing',
  'External beta customer workspace for roofing estimates, storm restoration, review generation, and local SEO.',
  'Generate qualified roofing inspection and estimate requests.',
  'Tulsa, OK',
  'normal',
  'active'
)
on conflict (tenant_id, slug) do update
set name = excluded.name,
    domain = excluded.domain,
    business_model = excluded.business_model,
    industry = excluded.industry,
    vertical = excluded.vertical,
    description = excluded.description,
    primary_goal = excluded.primary_goal,
    primary_location = excluded.primary_location,
    risk_profile = excluded.risk_profile,
    status = excluded.status,
    updated_at = now();

insert into public.brand_services (tenant_id, brand_id, name, slug, description, priority, active)
values
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Roof inspection', 'roof-inspection', 'Inspection requests after storms or visible roof damage.', 90, true),
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Storm damage repair', 'storm-damage-repair', 'Repair inquiries for wind, hail, and storm damage.', 85, true)
on conflict (brand_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    priority = excluded.priority,
    active = excluded.active;

insert into public.brand_locations (tenant_id, brand_id, service_area_name, city, state, priority, active)
values
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Tulsa Metro', 'Tulsa', 'OK', 90, true),
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Broken Arrow', 'Broken Arrow', 'OK', 75, true);

insert into public.brand_offers (tenant_id, brand_id, title, description, active)
values ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Free roof inspection request', 'Manual review required before using this offer publicly.', true);

insert into public.brand_seo_keywords (tenant_id, brand_id, keyword, intent, priority)
values
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'roof inspection Tulsa', 'local', 90),
  ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'storm damage roof repair', 'service', 85)
on conflict (brand_id, keyword) do update
set intent = excluded.intent,
    priority = excluded.priority;

insert into public.brand_landing_pages (tenant_id, brand_id, title, slug, page_type, primary_keyword, status)
values ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Roof Inspection in Tulsa', 'roof-inspection-tulsa', 'city_page', 'roof inspection Tulsa', 'planned')
on conflict (brand_id, slug) do update
set title = excluded.title,
    page_type = excluded.page_type,
    primary_keyword = excluded.primary_keyword,
    status = excluded.status;

insert into public.brand_marketing_settings (tenant_id, brand_id, target_customers, cta_goals, ad_goals, seo_targets, review_strategy, follow_up_strategy, tone_of_voice, approval_mode)
values (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  'Homeowners in the Tulsa metro who need roofing help after storms or visible damage.',
  'Request a roof inspection',
  'Draft campaign concepts only; no ad launch or budget changes.',
  'Create useful city and service pages around inspection and storm damage searches.',
  'Draft review requests only after completed customer work.',
  'Draft manual lead follow-ups after consent is confirmed.',
  'Helpful, local, direct, and careful about claims.',
  'manual'
)
on conflict (brand_id) do update
set target_customers = excluded.target_customers,
    cta_goals = excluded.cta_goals,
    ad_goals = excluded.ad_goals,
    seo_targets = excluded.seo_targets,
    review_strategy = excluded.review_strategy,
    follow_up_strategy = excluded.follow_up_strategy,
    tone_of_voice = excluded.tone_of_voice,
    approval_mode = excluded.approval_mode,
    updated_at = now();

insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
values ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 'Beta Roofing Lead Form', 'beta-roofing-lead-form', 'beta-roofing-co-primary-lead-form', true)
on conflict (brand_id, slug) do update
set name = excluded.name,
    public_key = excluded.public_key,
    active = excluded.active;

insert into public.workspace_settings (tenant_id, display_name, timezone, default_report_email, plan_key, billing_status, onboarding_checklist_json, usage_json)
values (
  '55555555-5555-4555-8555-555555555555',
  'Beta Roofing Co',
  'America/Chicago',
  'owner@betaroofing.example',
  'starter',
  'trialing',
  '[
    {"key":"profile","label":"Complete organization profile","done":true},
    {"key":"brands","label":"Add brand services, service areas, offers, and keywords","done":true},
    {"key":"forms","label":"Publish approved lead forms","done":true},
    {"key":"users","label":"Invite operators and reviewers","done":false},
    {"key":"ai","label":"Generate weekly AI marketing plan","done":false},
    {"key":"review","label":"Review and export first content package","done":false}
  ]'::jsonb,
  '{"betaSeed": true, "externalCustomerReady": true}'::jsonb
)
on conflict (tenant_id) do update
set display_name = excluded.display_name,
    timezone = excluded.timezone,
    default_report_email = excluded.default_report_email,
    plan_key = excluded.plan_key,
    billing_status = excluded.billing_status,
    onboarding_checklist_json = excluded.onboarding_checklist_json,
    usage_json = excluded.usage_json,
    updated_at = now();

insert into public.billing_subscriptions (tenant_id, plan_key, status, seats, current_period_start, current_period_end, metadata_json)
values ('55555555-5555-4555-8555-555555555555', 'starter', 'trialing', 1, now(), now() + interval '14 days', '{"stripeConnected": false, "manualBeta": true}'::jsonb)
on conflict (tenant_id) do update
set plan_key = excluded.plan_key,
    status = excluded.status,
    seats = excluded.seats,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.beta_launch_checks (tenant_id, check_key, label, status)
values
  ('55555555-5555-4555-8555-555555555555', 'workspace-created', 'External organization workspace exists', 'passed'),
  ('55555555-5555-4555-8555-555555555555', 'brand-complete', 'Primary brand profile has services, areas, offers, keywords, and form', 'passed'),
  ('55555555-5555-4555-8555-555555555555', 'workspace-user-login', 'Workspace user account created and login verified', 'pending'),
  ('55555555-5555-4555-8555-555555555555', 'permission-qa', 'Owner/admin/operator/viewer permissions verified', 'pending'),
  ('55555555-5555-4555-8555-555555555555', 'weekly-ai-plan', 'Weekly AI marketing plan generated and reviewed', 'pending'),
  ('55555555-5555-4555-8555-555555555555', 'lead-ops', 'Lead scoring, assignment, duplicate review, and CSV export verified', 'pending'),
  ('55555555-5555-4555-8555-555555555555', 'safety-runbook', 'Backup, rollback, and secret rotation runbook reviewed', 'pending')
on conflict (tenant_id, check_key) do update
set label = excluded.label,
    status = case when public.beta_launch_checks.status = 'passed' then public.beta_launch_checks.status else excluded.status end,
    updated_at = now();
