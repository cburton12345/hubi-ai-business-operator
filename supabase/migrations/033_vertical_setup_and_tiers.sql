create table if not exists public.operator_verticals (
  id uuid primary key default gen_random_uuid(),
  vertical_key text not null unique,
  name text not null,
  simple_description text not null,
  sort_order integer not null default 0,
  minimum_plan_key text not null default 'starter',
  status text not null default 'available'
    check (status in ('available', 'planned', 'hidden')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_vertical_steps (
  id uuid primary key default gen_random_uuid(),
  vertical_key text not null references public.operator_verticals(vertical_key) on delete cascade,
  step_key text not null,
  label text not null,
  plain_language_goal text not null,
  app_href text,
  sort_order integer not null default 0,
  provider_key text,
  requires_provider boolean not null default false,
  minimum_plan_key text not null default 'starter',
  automation_level text not null default 'manual'
    check (automation_level in ('manual', 'draft_assist', 'provider_ready', 'live_when_connected')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical_key, step_key)
);

create table if not exists public.workspace_vertical_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vertical_key text not null references public.operator_verticals(vertical_key) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'active', 'paused', 'not_needed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vertical_key)
);

create table if not exists public.workspace_step_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vertical_key text not null,
  step_key text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done', 'blocked', 'skipped')),
  updated_by_user_id uuid references public.users(id) on delete set null,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vertical_key, step_key),
  foreign key (vertical_key, step_key) references public.operator_vertical_steps(vertical_key, step_key) on delete cascade
);

create table if not exists public.provider_setup_steps (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  label text not null,
  plain_language_goal text not null,
  env_vars text[] not null default array[]::text[],
  callback_path text,
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  live_action_rule text not null,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, label)
);

create table if not exists public.plan_feature_matrix (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.billing_plans(plan_key) on delete cascade,
  feature_key text not null,
  feature_label text not null,
  included boolean not null default true,
  limit_label text,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_key, feature_key)
);

create index if not exists idx_operator_vertical_steps_vertical on public.operator_vertical_steps(vertical_key, sort_order);
create index if not exists idx_workspace_vertical_status_tenant on public.workspace_vertical_status(tenant_id, status, priority);
create index if not exists idx_workspace_step_status_tenant on public.workspace_step_status(tenant_id, vertical_key, status);
create index if not exists idx_provider_setup_steps_provider on public.provider_setup_steps(provider_key, sort_order);
create index if not exists idx_plan_feature_matrix_plan on public.plan_feature_matrix(plan_key, sort_order);

alter table public.operator_verticals enable row level security;
alter table public.operator_vertical_steps enable row level security;
alter table public.workspace_vertical_status enable row level security;
alter table public.workspace_step_status enable row level security;
alter table public.provider_setup_steps enable row level security;
alter table public.plan_feature_matrix enable row level security;

drop policy if exists operator_verticals_readable on public.operator_verticals;
create policy operator_verticals_readable on public.operator_verticals for select using (true);

drop policy if exists operator_vertical_steps_readable on public.operator_vertical_steps;
create policy operator_vertical_steps_readable on public.operator_vertical_steps for select using (true);

drop policy if exists provider_setup_steps_readable on public.provider_setup_steps;
create policy provider_setup_steps_readable on public.provider_setup_steps for select using (true);

drop policy if exists plan_feature_matrix_readable on public.plan_feature_matrix;
create policy plan_feature_matrix_readable on public.plan_feature_matrix for select using (true);

drop policy if exists workspace_vertical_status_tenant_operator on public.workspace_vertical_status;
create policy workspace_vertical_status_tenant_operator
on public.workspace_vertical_status
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists workspace_step_status_tenant_operator on public.workspace_step_status;
create policy workspace_step_status_tenant_operator
on public.workspace_step_status
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.operator_verticals (vertical_key, name, simple_description, sort_order, minimum_plan_key, metadata_json)
values
  ('get_leads', 'Get Leads', 'Create useful local marketing that brings in real requests.', 10, 'starter', '{"why":"SEO, GBP activity, forms, and ads should connect to lead intake."}'::jsonb),
  ('follow_up', 'Follow Up', 'Reply fast, recover stale leads, and keep estimates moving.', 20, 'starter', '{"why":"Most service businesses lose revenue by waiting too long."}'::jsonb),
  ('schedule_work', 'Schedule Work', 'Book callbacks, appointments, jobs, and reminders in one place.', 30, 'growth', '{"why":"Scheduling should connect sales promises to real work."}'::jsonb),
  ('get_reviews', 'Get Reviews', 'Ask happy customers for reviews and route unhappy ones to service recovery.', 40, 'growth', '{"why":"Reviews help ranking, trust, and close rates."}'::jsonb),
  ('publish_marketing', 'Publish Marketing', 'Move drafts through approval, schedule, and manual or provider-ready publishing.', 50, 'growth', '{"why":"Consistency compounds, but quality and approvals come first."}'::jsonb),
  ('track_money', 'Track Money', 'Connect leads, estimates, jobs, invoices, and revenue back to the source.', 60, 'operator', '{"why":"This is how Ferocity learns what actually grows the business."}'::jsonb),
  ('connect_tools', 'Connect Tools', 'Turn on outside tools only when credentials, permissions, and approval rules are ready.', 70, 'operator', '{"why":"Provider integrations should be deliberate, auditable, and safe."}'::jsonb)
on conflict (vertical_key) do update
set name = excluded.name,
    simple_description = excluded.simple_description,
    sort_order = excluded.sort_order,
    minimum_plan_key = excluded.minimum_plan_key,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.operator_vertical_steps (vertical_key, step_key, label, plain_language_goal, app_href, sort_order, provider_key, requires_provider, minimum_plan_key, automation_level, metadata_json)
values
  ('get_leads', 'brand_basics', 'Add the business basics', 'Tell Ferocity what the company does, where it works, and who it helps.', '/app/brands', 10, null, false, 'starter', 'manual', '{}'::jsonb),
  ('get_leads', 'seo_drafts', 'Create SEO drafts', 'Draft service pages, city pages, blogs, and refresh ideas from real business facts.', '/app/seo', 20, null, false, 'starter', 'draft_assist', '{}'::jsonb),
  ('get_leads', 'forms', 'Capture requests', 'Use forms and source tracking so leads do not get lost.', '/app/forms', 30, null, false, 'starter', 'manual', '{}'::jsonb),
  ('follow_up', 'operator_scan', 'Scan for missed follow-up', 'Find unanswered leads, stale opportunities, callbacks, and ignored estimates.', '/app/operator', 10, null, false, 'starter', 'draft_assist', '{}'::jsonb),
  ('follow_up', 'message_templates', 'Prepare replies', 'Use approved SMS and email templates before turning on live sending.', '/app/operator', 20, 'twilio', true, 'growth', 'provider_ready', '{}'::jsonb),
  ('schedule_work', 'callbacks', 'Schedule callbacks', 'Put callbacks and appointments on the operator schedule.', '/app/operator', 10, null, false, 'growth', 'manual', '{}'::jsonb),
  ('schedule_work', 'calendar_ready', 'Prepare calendar sync', 'Connect Google Calendar later, only after rules and users are mapped.', '/app/integrations', 20, 'calendar_provider', true, 'operator', 'provider_ready', '{}'::jsonb),
  ('get_reviews', 'review_requests', 'Prepare review requests', 'Draft review requests after completed jobs and keep unhappy feedback internal first.', '/app/growth', 10, 'review_platform', true, 'growth', 'provider_ready', '{}'::jsonb),
  ('get_reviews', 'gbp_reviews', 'Prepare GBP reviews', 'Connect Google Business Profile later for review tracking and response drafts.', '/app/integrations', 20, 'google_business_profile', true, 'operator', 'provider_ready', '{}'::jsonb),
  ('publish_marketing', 'quality_review', 'Review quality first', 'Block thin, generic, unsupported, or spammy content before publishing.', '/app/growth', 10, null, false, 'growth', 'manual', '{}'::jsonb),
  ('publish_marketing', 'publishing_queue', 'Use the publishing queue', 'Move approved content into a visible queue before any provider publishes it.', '/app/growth', 20, 'external_publishing', true, 'growth', 'provider_ready', '{}'::jsonb),
  ('track_money', 'attribution', 'Track what creates jobs', 'Connect campaigns, city pages, services, leads, jobs, and revenue.', '/app/growth', 10, null, false, 'operator', 'draft_assist', '{}'::jsonb),
  ('track_money', 'billing_ready', 'Prepare billing', 'Keep plan, seat, usage, trial, and subscription data ready for Stripe.', '/app/billing', 20, 'stripe', true, 'operator', 'provider_ready', '{}'::jsonb),
  ('connect_tools', 'provider_steps', 'Check provider steps', 'See what is needed before Twilio, email, calendar, Stripe, GBP, Meta, or CMS can go live.', '/app/setup', 10, null, false, 'starter', 'manual', '{}'::jsonb),
  ('connect_tools', 'live_actions', 'Keep live actions off', 'Only enable sending, publishing, billing, or calendar sync after credentials and approval rules pass.', '/app/integrations', 20, null, false, 'operator', 'manual', '{}'::jsonb)
on conflict (vertical_key, step_key) do update
set label = excluded.label,
    plain_language_goal = excluded.plain_language_goal,
    app_href = excluded.app_href,
    sort_order = excluded.sort_order,
    provider_key = excluded.provider_key,
    requires_provider = excluded.requires_provider,
    minimum_plan_key = excluded.minimum_plan_key,
    automation_level = excluded.automation_level,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.provider_setup_steps (provider_key, label, plain_language_goal, env_vars, callback_path, risk_level, live_action_rule, sort_order, metadata_json)
values
  ('twilio', 'SMS sending', 'Send and receive texts after consent, number setup, compliance, and templates are ready.', array['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER'], '/api/integrations/twilio/status', 'high', 'Live SMS stays off until consent rules and approval mode are configured.', 10, '{}'::jsonb),
  ('email_provider', 'Email sending', 'Send follow-up emails after sender domain, unsubscribe rules, and templates are ready.', array['EMAIL_PROVIDER','EMAIL_API_KEY','EMAIL_FROM_ADDRESS'], null, 'high', 'Live email stays off until sender identity and compliance footer are configured.', 20, '{}'::jsonb),
  ('calendar_provider', 'Calendar sync', 'Sync callbacks and appointments after calendars are mapped to users and brands.', array['CALENDAR_PROVIDER','CALENDAR_CLIENT_ID','CALENDAR_CLIENT_SECRET','CALENDAR_OAUTH_REDIRECT_URI'], '/api/integrations/calendar/oauth/callback', 'medium', 'Auto-booking stays off until scheduling rules are approved.', 30, '{}'::jsonb),
  ('stripe', 'Stripe billing', 'Create paid subscriptions after products, prices, webhooks, trial rules, and seat limits are mapped.', array['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'], '/api/integrations/stripe/webhook', 'high', 'Billing changes require owner/admin review until Stripe lifecycle tests pass.', 40, '{}'::jsonb),
  ('google_business_profile', 'Google Business Profile', 'Publish GBP posts and track reviews after OAuth, location mapping, and approvals are ready.', array['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_REDIRECT_URI'], '/api/integrations/google/oauth/callback', 'high', 'Public posts and review responses require approval.', 50, '{}'::jsonb),
  ('external_publishing', 'Website/CMS publishing', 'Publish approved pages after CMS credentials, page mapping, rollback, and quality rules are ready.', array['CMS_PROVIDER','CMS_API_KEY'], null, 'high', 'Provider publishing stays off until quality review passes.', 60, '{}'::jsonb)
on conflict (provider_key, label) do update
set plain_language_goal = excluded.plain_language_goal,
    env_vars = excluded.env_vars,
    callback_path = excluded.callback_path,
    risk_level = excluded.risk_level,
    live_action_rule = excluded.live_action_rule,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'lead_capture', 'Lead Capture', true, '1 form and limited monthly leads', 5, '{"freeTier":true}'::jsonb),
  ('free', 'source_tracking', 'Source Tracking', true, 'Basic website/source tracking', 6, '{"freeTier":true}'::jsonb),
  ('free', 'manual_tasks', 'Manual Tasks', true, 'Manual follow-up only', 7, '{"freeTier":true}'::jsonb),
  ('starter', 'get_leads', 'Get Leads', true, 'Core SEO drafts and lead capture', 10, '{}'::jsonb),
  ('starter', 'follow_up_basic', 'Basic Follow Up', true, 'Manual follow-up and draft replies', 20, '{}'::jsonb),
  ('starter', 'quality_guardrails', 'Quality Guardrails', true, 'Review content before publishing', 30, '{}'::jsonb),
  ('growth', 'get_leads', 'Get Leads', true, 'More brands and campaigns', 10, '{}'::jsonb),
  ('growth', 'follow_up_basic', 'Follow Up', true, 'Templates, recovery workflows, and queue visibility', 20, '{}'::jsonb),
  ('growth', 'schedule_work', 'Schedule Work', true, 'Callbacks, appointments, and job schedule foundation', 30, '{}'::jsonb),
  ('growth', 'get_reviews', 'Get Reviews', true, 'Review request workflow and service recovery', 40, '{}'::jsonb),
  ('growth', 'publish_marketing', 'Publish Marketing', true, 'Publishing queue and approvals', 50, '{}'::jsonb),
  ('operator', 'get_leads', 'Get Leads', true, 'Full growth loop', 10, '{}'::jsonb),
  ('operator', 'follow_up_basic', 'Follow Up', true, 'Provider-ready SMS/email workflows', 20, '{}'::jsonb),
  ('operator', 'schedule_work', 'Schedule Work', true, 'Calendar and dispatch readiness', 30, '{}'::jsonb),
  ('operator', 'get_reviews', 'Get Reviews', true, 'GBP/review provider readiness', 40, '{}'::jsonb),
  ('operator', 'publish_marketing', 'Publish Marketing', true, 'Provider-ready publishing', 50, '{}'::jsonb),
  ('operator', 'track_money', 'Track Money', true, 'Attribution, forecasting, usage, and Stripe readiness', 60, '{}'::jsonb),
  ('operator', 'connect_tools', 'Connect Tools', true, 'Provider setup and live action controls', 70, '{}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.workspace_vertical_status (tenant_id, vertical_key, status, priority, metadata_json)
select t.id, v.vertical_key, case when v.vertical_key in ('get_leads', 'follow_up') then 'active' else 'not_started' end, 'normal', '{}'::jsonb
from public.tenants t
cross join public.operator_verticals v
on conflict (tenant_id, vertical_key) do nothing;
