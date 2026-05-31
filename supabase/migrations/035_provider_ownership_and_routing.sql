alter table public.provider_accounts
  add column if not exists ownership_mode text not null default 'workspace'
    check (ownership_mode in ('ferocity_managed', 'workspace')),
  add column if not exists sender_identity text,
  add column if not exists monthly_included_units integer,
  add column if not exists monthly_used_units integer not null default 0,
  add column if not exists overage_policy text not null default 'block'
    check (overage_policy in ('block', 'allow_with_review', 'allow'));

create table if not exists public.provider_routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action_type text not null
    check (action_type in ('sms_send', 'email_send', 'publish_content', 'calendar_sync', 'review_request', 'billing_sync')),
  default_provider_key text not null,
  ownership_mode text not null default 'ferocity_managed'
    check (ownership_mode in ('ferocity_managed', 'workspace')),
  fallback_provider_key text,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  plain_language_rule text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, action_type)
);

create table if not exists public.provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_account_id uuid references public.provider_accounts(id) on delete set null,
  provider_key text not null,
  action_type text not null,
  unit_count integer not null default 1,
  billing_status text not null default 'included'
    check (billing_status in ('included', 'billable', 'blocked', 'manual')),
  source_queue_id uuid references public.outbound_action_queue(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_accounts_ownership on public.provider_accounts(tenant_id, ownership_mode, provider_key);
create index if not exists idx_provider_routing_rules_tenant on public.provider_routing_rules(tenant_id, status, action_type);
create index if not exists idx_provider_usage_events_tenant on public.provider_usage_events(tenant_id, provider_key, created_at desc);

alter table public.provider_routing_rules enable row level security;
alter table public.provider_usage_events enable row level security;

drop policy if exists provider_routing_rules_tenant_operator on public.provider_routing_rules;
create policy provider_routing_rules_tenant_operator
on public.provider_routing_rules
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists provider_usage_events_tenant_operator on public.provider_usage_events;
create policy provider_usage_events_tenant_operator
on public.provider_usage_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.provider_accounts (
  tenant_id, provider_key, display_name, status, credentials_status, ownership_mode,
  sender_identity, monthly_included_units, overage_policy, metadata_json
)
select
  t.id,
  defaults.provider_key,
  defaults.display_name,
  defaults.status,
  defaults.credentials_status,
  defaults.ownership_mode,
  defaults.sender_identity,
  defaults.monthly_included_units,
  defaults.overage_policy,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('resend_shared', 'Ferocity Shared Email', 'planned', 'not_configured', 'ferocity_managed', 'Ferocity shared sender', 500, 'allow_with_review', '{"purpose":"Early email delivery through platform-managed Resend-style provider"}'::jsonb),
    ('twilio_shared', 'Ferocity Shared SMS', 'planned', 'not_configured', 'ferocity_managed', 'Ferocity shared number pool', 100, 'block', '{"purpose":"Early SMS delivery through platform-managed Twilio-style provider"}'::jsonb)
) as defaults(provider_key, display_name, status, credentials_status, ownership_mode, sender_identity, monthly_included_units, overage_policy, metadata_json)
on conflict (tenant_id, provider_key) do update
set display_name = excluded.display_name,
    ownership_mode = excluded.ownership_mode,
    sender_identity = excluded.sender_identity,
    monthly_included_units = excluded.monthly_included_units,
    overage_policy = excluded.overage_policy,
    metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
    updated_at = now();

update public.provider_accounts
set ownership_mode = 'workspace'
where provider_key in ('twilio', 'email_provider', 'google_business_profile', 'calendar_provider', 'external_publishing', 'stripe')
  and ownership_mode <> 'workspace';

insert into public.provider_routing_rules (
  tenant_id, action_type, default_provider_key, ownership_mode, fallback_provider_key, plain_language_rule, metadata_json
)
select
  t.id,
  defaults.action_type,
  defaults.default_provider_key,
  defaults.ownership_mode,
  defaults.fallback_provider_key,
  defaults.plain_language_rule,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('email_send', 'resend_shared', 'ferocity_managed', 'email_provider', 'Use Ferocity managed email first. Switch to customer email when domain and sender setup are ready.', '{"byoOption":"email_provider"}'::jsonb),
    ('sms_send', 'twilio_shared', 'ferocity_managed', 'twilio', 'Use Ferocity managed SMS for early testing. Switch to customer Twilio when number, consent, and compliance are ready.', '{"byoOption":"twilio"}'::jsonb),
    ('review_request', 'twilio_shared', 'ferocity_managed', 'twilio', 'Use the same reviewed SMS route as other customer messages. Never send review requests without job completion and consent checks.', '{"byoOption":"twilio"}'::jsonb),
    ('publish_content', 'external_publishing', 'workspace', null, 'Publishing uses the customer website or CMS connection. Ferocity should not host a fake CMS.', '{"byoRequired":true}'::jsonb),
    ('calendar_sync', 'calendar_provider', 'workspace', null, 'Calendar sync uses the customer Google or Microsoft calendar account.', '{"byoRequired":true}'::jsonb),
    ('billing_sync', 'stripe', 'workspace', null, 'Billing uses the configured Stripe account and owner/admin approval.', '{"byoRequired":true}'::jsonb)
) as defaults(action_type, default_provider_key, ownership_mode, fallback_provider_key, plain_language_rule, metadata_json)
on conflict (tenant_id, action_type) do update
set default_provider_key = excluded.default_provider_key,
    ownership_mode = excluded.ownership_mode,
    fallback_provider_key = excluded.fallback_provider_key,
    plain_language_rule = excluded.plain_language_rule,
    metadata_json = excluded.metadata_json,
    updated_at = now();
