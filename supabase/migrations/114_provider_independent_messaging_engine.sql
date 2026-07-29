create table if not exists public.messaging_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  provider_family text not null
    check (provider_family in ('sms', 'mms', 'email', 'voice', 'manual', 'multi_channel')),
  status text not null default 'planned'
    check (status in ('planned', 'available', 'configured', 'active', 'paused', 'blocked', 'retired')),
  supports_sms boolean not null default false,
  supports_mms boolean not null default false,
  supports_email boolean not null default false,
  supports_voice boolean not null default false,
  supports_manual_send boolean not null default false,
  supports_inbound_webhook boolean not null default false,
  supports_delivery_webhook boolean not null default false,
  requires_registration boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create table if not exists public.tenant_messaging_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  ownership_mode text not null default 'customer_owned'
    check (ownership_mode in ('customer_owned', 'ferocity_managed', 'manual_assisted')),
  account_label text not null,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected', 'configured', 'active', 'paused', 'needs_attention', 'blocked')),
  credentials_status text not null default 'not_configured'
    check (credentials_status in ('not_configured', 'configured', 'expired', 'revoked', 'not_required')),
  live_sending_enabled boolean not null default false,
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  default_channel text not null default 'sms'
    check (default_channel in ('sms', 'mms', 'email', 'phone', 'manual_sms', 'app_push')),
  provider_account_ref text,
  monthly_unit_cap integer check (monthly_unit_cap is null or monthly_unit_cap >= 0),
  monthly_cost_cap_cents integer check (monthly_cost_cap_cents is null or monthly_cost_cap_cents >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, ownership_mode)
);

create table if not exists public.tenant_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  messaging_account_id uuid references public.tenant_messaging_accounts(id) on delete set null,
  provider_key text not null,
  phone_number text not null,
  number_mode text not null default 'customer_owned'
    check (number_mode in ('customer_owned', 'ferocity_managed', 'forward_existing', 'manual_device', 'google_voice', 'sip_trunk')),
  status text not null default 'not_ready'
    check (status in ('not_ready', 'active', 'paused', 'released', 'needs_attention', 'blocked')),
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  voice_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  mms_enabled boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_number)
);

create table if not exists public.messaging_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  messaging_account_id uuid references public.tenant_messaging_accounts(id) on delete cascade,
  provider_key text not null,
  registration_type text not null default 'a2p_10dlc'
    check (registration_type in ('a2p_10dlc', 'sole_proprietor', 'toll_free', 'voice_compliance', 'email_domain', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'needs_info', 'submitted', 'approved', 'rejected', 'paused', 'archived')),
  legal_business_name text,
  dba_name text,
  tax_id_last4 text,
  business_address_json jsonb not null default '{}'::jsonb,
  website_url text,
  messaging_use_case text,
  expected_volume text,
  sample_messages_json jsonb not null default '[]'::jsonb,
  opt_in_method text,
  privacy_policy_url text,
  terms_url text,
  generated_campaign_description text,
  generated_compliance_text_json jsonb not null default '{}'::jsonb,
  provider_registration_ref text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messaging_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  channel text not null default 'sms'
    check (channel in ('sms', 'mms', 'email', 'phone', 'manual_sms', 'website_chat', 'app_push', 'internal')),
  provider_key text,
  external_conversation_ref text,
  subject text not null default 'Customer conversation',
  status text not null default 'open'
    check (status in ('open', 'waiting_on_customer', 'waiting_on_team', 'ai_handled', 'human_handoff', 'closed', 'archived')),
  ai_reply_lock_key text,
  last_message_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, external_conversation_ref)
);

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.messaging_conversations(id) on delete cascade,
  participant_type text not null
    check (participant_type in ('customer', 'lead', 'owner', 'employee', 'ai', 'provider', 'system')),
  display_name text,
  contact_channel text
    check (contact_channel in ('sms', 'email', 'phone', 'app_push', 'internal')),
  contact_value text,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'granted', 'revoked', 'not_required')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.messaging_conversations(id) on delete set null,
  direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound', 'internal', 'draft')),
  channel text not null default 'sms'
    check (channel in ('sms', 'mms', 'email', 'phone', 'manual_sms', 'website_chat', 'app_push', 'internal')),
  provider_key text,
  provider_message_ref text,
  from_value text,
  to_value text,
  subject text,
  body text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sent', 'sent_manually', 'delivered', 'received', 'failed', 'blocked', 'archived')),
  ai_generated boolean not null default false,
  idempotency_key text,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  attachment_type text not null
    check (attachment_type in ('image', 'video', 'audio', 'pdf', 'document', 'link', 'other')),
  file_url text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  provider_key text not null,
  event_type text not null,
  provider_event_ref text,
  status text not null default 'logged',
  safe_error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.message_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  webhook_type text not null
    check (webhook_type in ('inbound_message', 'delivery_status', 'voice_call', 'registration_status', 'unknown')),
  provider_event_ref text,
  idempotency_key text not null,
  processed_status text not null default 'received'
    check (processed_status in ('received', 'processed', 'duplicate', 'failed', 'ignored')),
  safe_error_message text,
  payload_redacted_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key, idempotency_key)
);

create table if not exists public.messaging_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_channel text not null
    check (contact_channel in ('sms', 'mms', 'email', 'phone', 'app_push')),
  contact_value text not null,
  status text not null default 'unknown'
    check (status in ('unknown', 'granted', 'revoked')),
  source text not null default 'manual',
  proof_json jsonb not null default '{}'::jsonb,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contact_channel, contact_value)
);

create table if not exists public.messaging_opt_outs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_channel text not null
    check (contact_channel in ('sms', 'mms', 'email', 'phone', 'app_push')),
  contact_value text not null,
  opt_out_keyword text,
  source_provider_key text,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contact_channel, contact_value)
);

create table if not exists public.messaging_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  channel text not null,
  direction text not null
    check (direction in ('inbound', 'outbound')),
  unit_type text not null
    check (unit_type in ('message', 'mms', 'email', 'voice_minute', 'phone_number_month', 'registration_fee')),
  unit_count numeric not null default 1 check (unit_count >= 0),
  provider_cost_cents integer not null default 0 check (provider_cost_cents >= 0),
  customer_charge_cents integer not null default 0 check (customer_charge_cents >= 0),
  message_id uuid references public.messages(id) on delete set null,
  billing_status text not null default 'unbilled'
    check (billing_status in ('included', 'unbilled', 'pending_review', 'approved', 'queued_for_invoice', 'invoiced', 'void')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.messaging_provider_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  route_name text not null,
  safe_error_category text not null default 'provider_error',
  safe_error_message text not null,
  retryable boolean not null default false,
  correlation_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messaging_providers_tenant_idx on public.messaging_providers(tenant_id, provider_key, status);
create index if not exists tenant_messaging_accounts_tenant_idx on public.tenant_messaging_accounts(tenant_id, provider_key, connection_status);
create index if not exists tenant_phone_numbers_tenant_idx on public.tenant_phone_numbers(tenant_id, provider_key, status);
create index if not exists messaging_registrations_tenant_idx on public.messaging_registrations(tenant_id, provider_key, status);
create index if not exists messaging_conversations_tenant_idx on public.messaging_conversations(tenant_id, status, last_message_at desc nulls last);
create index if not exists conversation_participants_conversation_idx on public.conversation_participants(tenant_id, conversation_id);
create index if not exists messages_tenant_idx on public.messages(tenant_id, channel, status, created_at desc);
create index if not exists message_delivery_events_tenant_idx on public.message_delivery_events(tenant_id, provider_key, created_at desc);
create index if not exists messaging_usage_tenant_idx on public.messaging_usage(tenant_id, provider_key, created_at desc);
create index if not exists messaging_provider_failures_tenant_idx on public.messaging_provider_failures(tenant_id, provider_key, created_at desc);

alter table public.messaging_providers enable row level security;
alter table public.tenant_messaging_accounts enable row level security;
alter table public.tenant_phone_numbers enable row level security;
alter table public.messaging_registrations enable row level security;
alter table public.messaging_conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_delivery_events enable row level security;
alter table public.message_webhook_events enable row level security;
alter table public.messaging_consents enable row level security;
alter table public.messaging_opt_outs enable row level security;
alter table public.messaging_usage enable row level security;
alter table public.messaging_provider_failures enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'messaging_providers',
    'tenant_messaging_accounts',
    'tenant_phone_numbers',
    'messaging_registrations',
    'messaging_conversations',
    'conversation_participants',
    'messages',
    'message_attachments',
    'message_delivery_events',
    'message_webhook_events',
    'messaging_consents',
    'messaging_opt_outs',
    'messaging_usage',
    'messaging_provider_failures'
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

insert into public.messaging_providers (
  tenant_id, provider_key, display_name, provider_family, status,
  supports_sms, supports_mms, supports_email, supports_voice, supports_manual_send,
  supports_inbound_webhook, supports_delivery_webhook, requires_registration, metadata_json
)
select
  t.id,
  provider.provider_key,
  provider.display_name,
  provider.provider_family,
  provider.status,
  provider.supports_sms,
  provider.supports_mms,
  provider.supports_email,
  provider.supports_voice,
  provider.supports_manual_send,
  provider.supports_inbound_webhook,
  provider.supports_delivery_webhook,
  provider.requires_registration,
  provider.metadata_json
from public.tenants t
cross join (
  values
    ('manual_sms', 'Manual phone SMS', 'manual', 'available', true, false, false, false, true, false, false, false, '{"purpose":"Open the owner phone SMS app with message prefilled."}'::jsonb),
    ('resend_email', 'Resend Email', 'email', 'available', false, false, true, false, false, true, true, false, '{"purpose":"First shared/managed email provider."}'::jsonb),
    ('twilio_sms', 'Twilio SMS/MMS', 'sms', 'planned', true, true, false, false, false, true, true, true, '{"purpose":"First production automated SMS/MMS provider."}'::jsonb),
    ('twilio_voice', 'Twilio Voice', 'voice', 'planned', false, false, false, true, false, true, true, true, '{"purpose":"First production telephony provider for calls and AI receptionist routing."}'::jsonb),
    ('sendblue', 'Sendblue', 'sms', 'planned', true, true, false, false, false, true, true, true, '{"futureProvider":true}'::jsonb),
    ('telnyx', 'Telnyx', 'multi_channel', 'planned', true, true, false, true, false, true, true, true, '{"futureProvider":true}'::jsonb),
    ('sentdm', 'Sent.dm', 'sms', 'planned', true, true, false, false, false, true, true, true, '{"futureProvider":true}'::jsonb),
    ('google_voice_manual', 'Google Voice assisted', 'manual', 'planned', true, false, false, true, true, false, false, false, '{"futureProvider":true,"note":"Browser/app assisted where technically possible."}'::jsonb)
) as provider(
  provider_key, display_name, provider_family, status, supports_sms, supports_mms, supports_email,
  supports_voice, supports_manual_send, supports_inbound_webhook, supports_delivery_webhook,
  requires_registration, metadata_json
)
where t.status <> 'archived'
on conflict (tenant_id, provider_key) do update set
  display_name = excluded.display_name,
  provider_family = excluded.provider_family,
  supports_sms = excluded.supports_sms,
  supports_mms = excluded.supports_mms,
  supports_email = excluded.supports_email,
  supports_voice = excluded.supports_voice,
  supports_manual_send = excluded.supports_manual_send,
  supports_inbound_webhook = excluded.supports_inbound_webhook,
  supports_delivery_webhook = excluded.supports_delivery_webhook,
  requires_registration = excluded.requires_registration,
  metadata_json = public.messaging_providers.metadata_json || excluded.metadata_json,
  updated_at = now();

insert into public.tenant_messaging_accounts (
  tenant_id, provider_key, ownership_mode, account_label, connection_status, credentials_status,
  live_sending_enabled, inbound_enabled, outbound_enabled, default_channel, metadata_json
)
select t.id, account.provider_key, account.ownership_mode, account.account_label, account.connection_status,
       account.credentials_status, false, account.inbound_enabled, account.outbound_enabled, account.default_channel,
       account.metadata_json
from public.tenants t
cross join (
  values
    ('manual_sms', 'manual_assisted', 'Manual SMS from owner phone', 'active', 'not_required', false, true, 'manual_sms', '{"noProviderCost":true}'::jsonb),
    ('resend_email', 'ferocity_managed', 'Ferocity managed email', 'not_connected', 'not_configured', true, true, 'email', '{"requiresSenderVerification":true}'::jsonb),
    ('twilio_sms', 'customer_owned', 'Customer Twilio SMS', 'not_connected', 'not_configured', true, true, 'sms', '{"requiresA2P":true}'::jsonb),
    ('twilio_sms', 'ferocity_managed', 'Ferocity managed Twilio SMS', 'not_connected', 'not_configured', true, true, 'sms', '{"requiresA2P":true,"requiresBudgetControls":true}'::jsonb),
    ('twilio_voice', 'ferocity_managed', 'Ferocity managed voice', 'not_connected', 'not_configured', true, true, 'phone', '{"requiresCallConsent":true,"requiresBudgetControls":true}'::jsonb)
) as account(provider_key, ownership_mode, account_label, connection_status, credentials_status, inbound_enabled, outbound_enabled, default_channel, metadata_json)
where t.status <> 'archived'
on conflict (tenant_id, provider_key, ownership_mode) do nothing;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'messaging_engine',
  'enabled',
  500,
  'monthly',
  '{"category":"Messaging","description":"Provider-independent messaging for SMS, email, manual sends, voice-ready workflows, consent, delivery history, and usage tracking.","approvalMode":"review_required","plainRule":"Draft and route messages through Ferocity. Live provider sends require consent, approval, credentials, and limits.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  status = excluded.status,
  usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
  usage_period = coalesce(public.workspace_feature_entitlements.usage_period, excluded.usage_period),
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
