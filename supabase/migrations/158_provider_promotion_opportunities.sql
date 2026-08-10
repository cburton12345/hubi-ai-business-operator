create table if not exists public.provider_promotion_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  lane_key text not null default 'customer_owned'
    check (lane_key in ('customer_owned', 'ferocity_managed')),
  budget_control_id uuid references public.managed_ad_budget_controls(id) on delete set null,
  title text not null,
  offer_source text not null default 'provider_dashboard'
    check (offer_source in ('business_profile', 'provider_dashboard', 'email', 'representative', 'other')),
  offer_url text,
  credit_cents integer not null check (credit_cents > 0),
  required_spend_cents integer not null check (required_spend_cents > 0),
  planned_spend_without_offer_cents integer not null default 0 check (planned_spend_without_offer_cents >= 0),
  qualifying_spend_recorded_cents integer not null default 0 check (qualifying_spend_recorded_cents >= 0),
  claim_deadline timestamptz,
  qualifying_period_ends_at timestamptz,
  credit_expires_at timestamptz,
  new_account_only boolean not null default false,
  terms_summary text not null default '',
  status text not null default 'captured'
    check (status in ('captured', 'recommended', 'approved', 'activated', 'qualified', 'earned', 'declined', 'expired')),
  recommendation text not null default 'review'
    check (recommendation in ('accept', 'review', 'skip')),
  recommendation_reason text not null default '',
  incremental_spend_cents integer not null default 0 check (incremental_spend_cents >= 0),
  conservative_net_value_cents integer not null default 0,
  required_daily_spend_cents integer not null default 0 check (required_daily_spend_cents >= 0),
  approved_budget_cents integer check (approved_budget_cents is null or approved_budget_cents > 0),
  approved_daily_cap_cents integer check (approved_daily_cap_cents is null or approved_daily_cap_cents > 0),
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  activated_at timestamptz,
  qualified_at timestamptz,
  earned_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_promotions_tenant_status
  on public.provider_promotion_opportunities(tenant_id, status, claim_deadline);

create table if not exists public.provider_promotion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  promotion_id uuid not null references public.provider_promotion_opportunities(id) on delete cascade,
  event_type text not null
    check (event_type in ('captured', 'analyzed', 'approved', 'activated', 'progress_recorded', 'qualified', 'earned', 'declined', 'expired')),
  actor_user_id uuid references public.users(id) on delete set null,
  amount_cents integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_promotion_events_promotion
  on public.provider_promotion_events(promotion_id, created_at desc);

alter table public.provider_promotion_opportunities enable row level security;
alter table public.provider_promotion_events enable row level security;

drop policy if exists provider_promotions_tenant_admin on public.provider_promotion_opportunities;
create policy provider_promotions_tenant_admin
on public.provider_promotion_opportunities
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists provider_promotion_events_tenant_admin on public.provider_promotion_events;
create policy provider_promotion_events_tenant_admin
on public.provider_promotion_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

comment on table public.provider_promotion_opportunities is
  'Provider promotional offers analyzed against planned spend and protected by existing managed-ad approval and cap controls. Recording or approving an offer never enables live spend.';
