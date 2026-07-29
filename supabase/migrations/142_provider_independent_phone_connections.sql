create table if not exists public.phone_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  connection_path text not null
    check (connection_path in (
      'keep_number_forwarding',
      'keep_number_full',
      'new_ferocity_number',
      'bring_own_provider'
    )),
  business_number text,
  ferocity_number text,
  phone_provider_key text,
  phone_provider_label text,
  voice_agent_provider_key text,
  current_carrier text,
  full_integration_method text
    check (full_integration_method is null or full_integration_method in (
      'number_port',
      'cloud_phone',
      'pbx',
      'carrier_connection'
    )),
  preferred_area_code text,
  intended_use text,
  human_transfer_number text,
  sms_requested boolean not null default false,
  mms_requested boolean not null default false,
  status text not null default 'started'
    check (status in (
      'started',
      'needs_number',
      'awaiting_forwarding',
      'assisted_setup',
      'provider_connection',
      'testing',
      'ready',
      'active',
      'paused',
      'needs_attention'
    )),
  capabilities_json jsonb not null default '[]'::jsonb,
  setup_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create index if not exists idx_phone_connections_tenant_status
  on public.phone_connections(tenant_id, status, connection_path);

alter table public.phone_connections enable row level security;

drop policy if exists phone_connections_tenant_operator on public.phone_connections;
create policy phone_connections_tenant_operator
on public.phone_connections
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.phone_connections (
  tenant_id,
  brand_id,
  connection_path,
  business_number,
  ferocity_number,
  phone_provider_key,
  status,
  capabilities_json,
  setup_json
)
select distinct on (n.tenant_id)
  n.tenant_id,
  n.brand_id,
  case
    when n.number_mode = 'forward_existing' then 'keep_number_forwarding'
    when n.number_mode = 'ferocity_managed' then 'new_ferocity_number'
    when n.number_mode = 'sip_trunk' then 'keep_number_full'
    else 'bring_own_provider'
  end,
  case when n.number_mode in ('forward_existing', 'customer_owned', 'byo_twilio', 'sip_trunk') then n.phone_number end,
  case when n.number_mode = 'ferocity_managed' then n.phone_number end,
  n.provider_key,
  case
    when n.status = 'active' then 'active'
    when n.status = 'forwarding_pending' then 'awaiting_forwarding'
    when n.status = 'needs_attention' then 'needs_attention'
    else 'started'
  end,
  '[]'::jsonb,
  jsonb_build_object('backfilledFrom', 'telephony_numbers', 'telephonyNumberId', n.id)
from public.telephony_numbers n
order by n.tenant_id, n.created_at desc
on conflict (tenant_id) do nothing;

insert into public.provider_accounts (
  tenant_id,
  provider_key,
  display_name,
  status,
  credentials_status,
  ownership_mode,
  live_actions_enabled,
  metadata_json
)
select
  t.id,
  provider.provider_key,
  provider.display_name,
  'planned',
  'not_configured',
  provider.ownership_mode,
  false,
  jsonb_build_object(
    'family', 'telephony',
    'adapterContract', 'ferocity_phone_provider_v1',
    'liveAdapterReady', false,
    'productDataOwnedBy', 'ferocity',
    'swappable', true,
    'supports', provider.supports
  )
from public.tenants t
cross join (
  values
    ('twilio_phone', 'Twilio phone service', 'workspace', '["phone_numbers","calls","sms","mms","sip","webhooks"]'::jsonb),
    ('telnyx_phone', 'Telnyx phone service', 'workspace', '["phone_numbers","calls","sms","mms","sip","webhooks"]'::jsonb),
    ('signalwire_phone', 'SignalWire phone service', 'workspace', '["phone_numbers","calls","sms","mms","sip","webhooks"]'::jsonb),
    ('vonage_phone', 'Vonage phone service', 'workspace', '["phone_numbers","calls","sms","mms","sip","webhooks"]'::jsonb),
    ('generic_sip', 'Existing phone system', 'workspace', '["calls","sip","call_routing","webhooks"]'::jsonb),
    ('ferocity_managed_phone', 'Ferocity-managed phone service', 'ferocity_managed', '["phone_numbers","calls","sms","mms","call_routing","webhooks"]'::jsonb)
) as provider(provider_key, display_name, ownership_mode, supports)
on conflict (tenant_id, provider_key) do update
set display_name = excluded.display_name,
    metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
    updated_at = now();
