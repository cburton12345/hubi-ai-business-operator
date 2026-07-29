create table if not exists public.business_growth_baselines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  brand_scope_id uuid generated always as (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  baseline_name text not null default 'Day 1 baseline',
  baseline_type text not null default 'onboarding'
    check (baseline_type in ('pre_ferocity', 'onboarding', 'manual_update', 'provider_import')),
  baseline_date date not null default current_date,
  source text not null default 'manual'
    check (source in ('manual', 'website_grader', 'provider_import', 'setup_operator', 'admin')),
  confidence text not null default 'owner_reported'
    check (confidence in ('owner_reported', 'provider_verified', 'estimated', 'mixed')),
  monthly_revenue_cents integer not null default 0 check (monthly_revenue_cents >= 0),
  monthly_leads integer not null default 0 check (monthly_leads >= 0),
  monthly_booked_jobs integer not null default 0 check (monthly_booked_jobs >= 0),
  monthly_ad_spend_cents integer not null default 0 check (monthly_ad_spend_cents >= 0),
  average_ticket_cents integer not null default 0 check (average_ticket_cents >= 0),
  close_rate_bps integer not null default 0 check (close_rate_bps >= 0 and close_rate_bps <= 10000),
  review_count integer not null default 0 check (review_count >= 0),
  review_rating numeric(3,2) check (review_rating is null or (review_rating >= 0 and review_rating <= 5)),
  website_sessions integer not null default 0 check (website_sessions >= 0),
  organic_leads integer not null default 0 check (organic_leads >= 0),
  paid_leads integer not null default 0 check (paid_leads >= 0),
  referral_leads integer not null default 0 check (referral_leads >= 0),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_growth_baselines_tenant_date
  on public.business_growth_baselines(tenant_id, brand_id, baseline_date desc);

create unique index if not exists uniq_business_growth_baseline_day
  on public.business_growth_baselines(tenant_id, brand_scope_id, baseline_date);

create table if not exists public.business_growth_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  snapshot_month date not null,
  source text not null default 'ferocity'
    check (source in ('ferocity', 'provider_import', 'manual', 'mixed')),
  monthly_revenue_cents integer not null default 0 check (monthly_revenue_cents >= 0),
  monthly_leads integer not null default 0 check (monthly_leads >= 0),
  monthly_booked_jobs integer not null default 0 check (monthly_booked_jobs >= 0),
  monthly_ad_spend_cents integer not null default 0 check (monthly_ad_spend_cents >= 0),
  average_ticket_cents integer not null default 0 check (average_ticket_cents >= 0),
  close_rate_bps integer not null default 0 check (close_rate_bps >= 0 and close_rate_bps <= 10000),
  review_count integer not null default 0 check (review_count >= 0),
  review_rating numeric(3,2) check (review_rating is null or (review_rating >= 0 and review_rating <= 5)),
  website_sessions integer not null default 0 check (website_sessions >= 0),
  organic_leads integer not null default 0 check (organic_leads >= 0),
  paid_leads integer not null default 0 check (paid_leads >= 0),
  referral_leads integer not null default 0 check (referral_leads >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, snapshot_month)
);

create index if not exists idx_business_growth_snapshots_tenant_month
  on public.business_growth_snapshots(tenant_id, brand_id, snapshot_month desc);

alter table public.business_growth_baselines enable row level security;
alter table public.business_growth_snapshots enable row level security;

drop policy if exists business_growth_baselines_tenant_operator on public.business_growth_baselines;
create policy business_growth_baselines_tenant_operator
on public.business_growth_baselines
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists business_growth_snapshots_tenant_operator on public.business_growth_snapshots;
create policy business_growth_snapshots_tenant_operator
on public.business_growth_snapshots
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'growth_baseline_tracking',
  'enabled',
  null,
  'monthly',
  '{"category":"Reporting","description":"Track business baseline, current revenue, leads, jobs, reviews, traffic, and growth since onboarding.","approvalMode":"enabled","plainRule":"Show what changed since the business started with Ferocity, with confidence labels."}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();
