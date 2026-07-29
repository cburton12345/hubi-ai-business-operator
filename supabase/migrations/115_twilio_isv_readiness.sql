create table if not exists public.twilio_isv_customer_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  messaging_registration_id uuid references public.messaging_registrations(id) on delete set null,
  twilio_account_mode text not null default 'subaccount_per_customer'
    check (twilio_account_mode in ('subaccount_per_customer', 'messaging_service_per_customer', 'customer_owned_twilio')),
  status text not null default 'not_started'
    check (status in ('not_started', 'collecting_info', 'ready_to_submit', 'submitted', 'approved', 'active', 'paused', 'blocked', 'rejected')),
  primary_profile_ready boolean not null default false,
  customer_subaccount_sid text,
  secondary_customer_profile_sid text,
  brand_sid text,
  campaign_sid text,
  messaging_service_sid text,
  phone_number_sid text,
  phone_number text,
  live_sending_enabled boolean not null default false,
  last_provider_status text,
  last_error text,
  submitted_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, twilio_account_mode)
);

create index if not exists twilio_isv_customer_routes_tenant_idx
  on public.twilio_isv_customer_routes(tenant_id, status, updated_at desc);

alter table public.twilio_isv_customer_routes enable row level security;

drop policy if exists twilio_isv_customer_routes_tenant_operator on public.twilio_isv_customer_routes;
create policy twilio_isv_customer_routes_tenant_operator
on public.twilio_isv_customer_routes
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.twilio_isv_customer_routes (
  tenant_id,
  messaging_registration_id,
  status,
  primary_profile_ready,
  metadata_json
)
select
  t.id,
  r.id,
  case when r.id is null then 'not_started' else 'collecting_info' end,
  false,
  jsonb_build_object(
    'recommendedArchitecture', 'subaccount_per_customer',
    'twilioDocs', jsonb_build_array(
      'https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv',
      'https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api',
      'https://www.twilio.com/docs/trust-hub/profiles'
    ),
    'liveSendDefault', false
  )
from public.tenants t
left join lateral (
  select id
  from public.messaging_registrations mr
  where mr.tenant_id = t.id and mr.provider_key = 'twilio_sms'
  order by mr.updated_at desc
  limit 1
) r on true
where t.status <> 'archived'
on conflict (tenant_id, twilio_account_mode) do nothing;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'twilio_isv_onboarding',
  'enabled',
  25,
  'monthly',
  '{"category":"Messaging","description":"Twilio ISV customer onboarding, A2P registration tracking, and customer-mapped messaging readiness.","approvalMode":"approval_required","plainRule":"Prepare each customer separately. Do not share one A2P campaign across unrelated businesses.","costed":true,"publicFacing":false}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  status = excluded.status,
  usage_limit = excluded.usage_limit,
  usage_period = excluded.usage_period,
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
