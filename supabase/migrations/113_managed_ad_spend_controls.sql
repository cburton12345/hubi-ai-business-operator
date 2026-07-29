create table if not exists public.managed_ad_budget_controls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  lane_key text not null default 'ferocity_managed'
    check (lane_key in ('customer_owned', 'ferocity_managed')),
  status text not null default 'not_ready'
    check (status in ('not_ready', 'needs_payment', 'ready', 'active', 'paused', 'blocked', 'archived')),
  prepaid_required boolean not null default true,
  approved_by_customer boolean not null default false,
  live_spend_enabled boolean not null default false,
  prepaid_balance_cents integer not null default 0 check (prepaid_balance_cents >= 0),
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  daily_cap_cents integer not null default 0 check (daily_cap_cents >= 0),
  monthly_cap_cents integer not null default 0 check (monthly_cap_cents >= 0),
  management_fee_bps integer not null default 0 check (management_fee_bps >= 0 and management_fee_bps <= 5000),
  stop_loss_cents integer not null default 0 check (stop_loss_cents >= 0),
  currency text not null default 'usd',
  notes text not null default '',
  last_reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key, lane_key)
);

create table if not exists public.managed_ad_spend_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  budget_control_id uuid references public.managed_ad_budget_controls(id) on delete set null,
  provider_key text not null,
  event_type text not null
    check (event_type in ('prepaid_credit', 'budget_reserved', 'spend_recorded', 'refund_recorded', 'adjustment', 'blocked_attempt')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  idempotency_key text not null,
  source_table text,
  source_id uuid,
  description text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_managed_ad_budget_controls_tenant
  on public.managed_ad_budget_controls(tenant_id, provider_key, status);

create index if not exists idx_managed_ad_spend_events_tenant
  on public.managed_ad_spend_events(tenant_id, provider_key, created_at desc);

alter table public.managed_ad_budget_controls enable row level security;
alter table public.managed_ad_spend_events enable row level security;

drop policy if exists managed_ad_budget_controls_tenant_admin on public.managed_ad_budget_controls;
create policy managed_ad_budget_controls_tenant_admin
on public.managed_ad_budget_controls
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists managed_ad_spend_events_tenant_admin on public.managed_ad_spend_events;
create policy managed_ad_spend_events_tenant_admin
on public.managed_ad_spend_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.managed_ad_budget_controls (
  tenant_id,
  provider_key,
  lane_key,
  status,
  prepaid_required,
  approved_by_customer,
  live_spend_enabled,
  daily_cap_cents,
  monthly_cap_cents,
  management_fee_bps,
  notes,
  metadata_json
)
select
  t.id,
  provider.provider_key,
  'ferocity_managed',
  'not_ready',
  true,
  false,
  false,
  0,
  0,
  provider.management_fee_bps,
  'Ferocity-managed ad spend is blocked until prepaid budget, written approval, daily/monthly caps, and provider account readiness are set.',
  provider.metadata_json
from public.tenants t
cross join (
  values
    ('google_ads', 1000, '{"capability":"google_ads","platform":"Google Ads"}'::jsonb),
    ('meta_ads', 1000, '{"capability":"meta_ads","platform":"Meta/Facebook"}'::jsonb),
    ('tiktok_ads', 1000, '{"capability":"tiktok_ads","platform":"TikTok"}'::jsonb),
    ('reddit_ads', 1000, '{"capability":"reddit_ads","platform":"Reddit"}'::jsonb),
    ('microsoft_ads', 1000, '{"capability":"microsoft_ads","platform":"Microsoft Ads"}'::jsonb)
) as provider(provider_key, management_fee_bps, metadata_json)
where t.status <> 'archived'
on conflict (tenant_id, provider_key, lane_key) do nothing;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'managed_ad_budget_controls', 'Managed Ad Budget Controls', true, 'Prepaid budget and hard caps required', 253, '{"marketingOs":true,"billing":true,"approvalRequired":true}'::jsonb),
  ('growth', 'managed_ad_budget_controls', 'Managed Ad Budget Controls', true, 'Prepaid budget, hard caps, and reporting', 253, '{"marketingOs":true,"billing":true,"approvalRequired":true}'::jsonb),
  ('operator', 'managed_ad_budget_controls', 'Managed Ad Budget Controls Plus', true, 'Multi-platform managed budget controls', 253, '{"marketingOs":true,"billing":true,"approvalRequired":true}'::jsonb)
on conflict (plan_key, feature_key) do update set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
