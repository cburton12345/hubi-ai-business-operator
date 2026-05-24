create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  status text not null default 'planned'
    check (status in ('planned', 'connected', 'paused', 'error')),
  credentials_status text not null default 'not_configured'
    check (credentials_status in ('not_configured', 'configured', 'expired', 'revoked')),
  live_actions_enabled boolean not null default false,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create table if not exists public.live_action_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action_key text not null,
  provider_key text not null,
  label text not null,
  status text not null default 'disabled'
    check (status in ('disabled', 'review_only', 'approval_required', 'live')),
  minimum_plan_key text not null default 'operator',
  requires_consent boolean not null default true,
  requires_human_approval boolean not null default true,
  risk_level text not null default 'high'
    check (risk_level in ('low', 'medium', 'high')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, action_key)
);

create table if not exists public.contact_consent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  channel text not null
    check (channel in ('sms', 'email', 'phone')),
  contact_value text not null,
  status text not null default 'unknown'
    check (status in ('unknown', 'granted', 'revoked', 'blocked')),
  source text,
  recorded_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, contact_value)
);

create table if not exists public.contact_suppression_list (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null
    check (channel in ('sms', 'email', 'phone')),
  contact_value text not null,
  reason text not null default 'manual',
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, contact_value)
);

create table if not exists public.outbound_action_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  action_type text not null
    check (action_type in ('sms_send', 'email_send', 'publish_content', 'calendar_sync', 'review_request', 'billing_sync')),
  provider_key text not null,
  status text not null default 'needs_review'
    check (status in ('draft', 'needs_review', 'approved', 'queued', 'sent_manually', 'sent', 'failed', 'canceled', 'blocked')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  target_type text,
  target_id uuid,
  subject text,
  recipient_label text,
  scheduled_for timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  policy_id uuid references public.live_action_policies(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  processed_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outbound_delivery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_id uuid references public.outbound_action_queue(id) on delete cascade,
  provider_key text not null,
  event_type text not null,
  status text not null default 'logged'
    check (status in ('logged', 'received', 'failed')),
  provider_event_id text,
  message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_accounts_tenant on public.provider_accounts(tenant_id, provider_key, status);
create index if not exists idx_live_action_policies_tenant on public.live_action_policies(tenant_id, status, provider_key);
create index if not exists idx_contact_consent_records_tenant on public.contact_consent_records(tenant_id, channel, status);
create index if not exists idx_contact_suppression_tenant on public.contact_suppression_list(tenant_id, channel, active);
create index if not exists idx_outbound_action_queue_tenant on public.outbound_action_queue(tenant_id, status, scheduled_for, created_at desc);
create index if not exists idx_outbound_action_queue_target on public.outbound_action_queue(target_type, target_id);
create index if not exists idx_outbound_delivery_events_queue on public.outbound_delivery_events(queue_id, created_at desc);

alter table public.provider_accounts enable row level security;
alter table public.live_action_policies enable row level security;
alter table public.contact_consent_records enable row level security;
alter table public.contact_suppression_list enable row level security;
alter table public.outbound_action_queue enable row level security;
alter table public.outbound_delivery_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'provider_accounts',
    'live_action_policies',
    'contact_consent_records',
    'contact_suppression_list',
    'outbound_action_queue',
    'outbound_delivery_events'
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

insert into public.provider_accounts (tenant_id, provider_key, display_name, status, credentials_status, metadata_json)
select t.id, provider_key, display_name, 'planned', 'not_configured', metadata_json
from public.tenants t
cross join (
  values
    ('twilio', 'Twilio SMS', '{"liveActionsEnabled":false}'::jsonb),
    ('email_provider', 'Email Provider', '{"liveActionsEnabled":false}'::jsonb),
    ('google_business_profile', 'Google Business Profile', '{"liveActionsEnabled":false}'::jsonb),
    ('calendar_provider', 'Calendar Provider', '{"liveActionsEnabled":false}'::jsonb),
    ('external_publishing', 'Website Publishing', '{"liveActionsEnabled":false}'::jsonb),
    ('stripe', 'Stripe Billing', '{"liveActionsEnabled":false}'::jsonb)
) as defaults(provider_key, display_name, metadata_json)
on conflict (tenant_id, provider_key) do nothing;

insert into public.live_action_policies (
  tenant_id, action_key, provider_key, label, status, minimum_plan_key,
  requires_consent, requires_human_approval, risk_level, metadata_json
)
select t.id, action_key, provider_key, label, 'approval_required', minimum_plan_key, requires_consent, true, risk_level, metadata_json
from public.tenants t
cross join (
  values
    ('sms_send', 'twilio', 'Send SMS', 'operator', true, 'high', '{"plainRule":"Only send texts after consent and approval."}'::jsonb),
    ('email_send', 'email_provider', 'Send Email', 'operator', true, 'high', '{"plainRule":"Only send emails after sender setup and approval."}'::jsonb),
    ('publish_content', 'external_publishing', 'Publish Content', 'growth', false, 'high', '{"plainRule":"Only publish content after approval and quality review."}'::jsonb),
    ('gbp_publish', 'google_business_profile', 'Publish GBP Post', 'operator', false, 'high', '{"plainRule":"Only publish GBP posts after approval."}'::jsonb),
    ('calendar_sync', 'calendar_provider', 'Sync Calendar', 'operator', false, 'medium', '{"plainRule":"Only sync calendar events after user/calendar mapping."}'::jsonb),
    ('review_request', 'twilio', 'Send Review Request', 'growth', true, 'high', '{"plainRule":"Only request reviews after job completion and service recovery rules."}'::jsonb),
    ('billing_sync', 'stripe', 'Sync Billing', 'operator', false, 'high', '{"plainRule":"Only change billing after owner/admin approval."}'::jsonb)
) as defaults(action_key, provider_key, label, minimum_plan_key, requires_consent, risk_level, metadata_json)
on conflict (tenant_id, action_key) do nothing;
