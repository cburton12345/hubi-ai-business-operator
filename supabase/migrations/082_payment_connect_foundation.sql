create table if not exists public.payment_fee_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  plan_key text,
  payment_mode text not null default 'customer_owned_stripe'
    check (payment_mode in ('manual_tracking', 'customer_owned_stripe', 'ferocity_managed_connect')),
  platform_fee_bps integer not null default 0
    check (platform_fee_bps >= 0 and platform_fee_bps <= 1000),
  min_platform_fee_cents integer not null default 0
    check (min_platform_fee_cents >= 0),
  max_platform_fee_cents integer
    check (max_platform_fee_cents is null or max_platform_fee_cents >= 0),
  pass_through_processor_fees boolean not null default true,
  pass_through_payout_fees boolean not null default true,
  pass_through_dispute_fees boolean not null default true,
  pass_through_refund_fees boolean not null default true,
  pass_through_bank_return_fees boolean not null default true,
  pass_through_instant_payout_fees boolean not null default true,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'retired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_fee_policies_tenant_mode
  on public.payment_fee_policies(tenant_id, payment_mode, status);

create table if not exists public.payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  provider text not null default 'stripe'
    check (provider in ('stripe')),
  payment_mode text not null default 'customer_owned_stripe'
    check (payment_mode in ('manual_tracking', 'customer_owned_stripe', 'ferocity_managed_connect')),
  ownership_label text not null default 'customer_owned'
    check (ownership_label in ('customer_owned', 'ferocity_managed')),
  provider_account_id text,
  provider_customer_id text,
  account_status text not null default 'not_connected'
    check (account_status in ('not_connected', 'onboarding_started', 'requirements_due', 'connected', 'restricted', 'paused', 'rejected')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  default_currency text not null default 'usd',
  fee_policy_id uuid references public.payment_fee_policies(id) on delete set null,
  last_provider_sync_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_provider_accounts_tenant
  on public.payment_provider_accounts(tenant_id, provider, payment_mode, account_status);

create unique index if not exists idx_payment_provider_accounts_provider_account_unique
  on public.payment_provider_accounts(provider, provider_account_id)
  where provider_account_id is not null;

create table if not exists public.payment_provider_account_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_provider_account_id uuid references public.payment_provider_accounts(id) on delete cascade,
  provider text not null default 'stripe'
    check (provider in ('stripe')),
  event_type text not null,
  event_status text not null default 'recorded'
    check (event_status in ('recorded', 'processed', 'ignored', 'failed')),
  provider_event_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_provider_account_events_tenant
  on public.payment_provider_account_events(tenant_id, created_at desc);

alter table public.payment_fee_policies enable row level security;
alter table public.payment_provider_accounts enable row level security;
alter table public.payment_provider_account_events enable row level security;

drop policy if exists payment_fee_policies_tenant_admin on public.payment_fee_policies;
create policy payment_fee_policies_tenant_admin
on public.payment_fee_policies
for all
using (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists payment_provider_accounts_tenant_admin on public.payment_provider_accounts;
create policy payment_provider_accounts_tenant_admin
on public.payment_provider_accounts
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists payment_provider_account_events_tenant_admin on public.payment_provider_account_events;
create policy payment_provider_account_events_tenant_admin
on public.payment_provider_account_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.payment_fee_policies (
  tenant_id,
  plan_key,
  payment_mode,
  platform_fee_bps,
  status,
  notes
)
values
  (null, null, 'manual_tracking', 0, 'active', 'Manual/offline payment records do not create processing fees.'),
  (null, null, 'customer_owned_stripe', 0, 'active', 'Customer-owned Stripe is the default online-payment path. Stripe/provider fees belong to the business account.'),
  (null, null, 'ferocity_managed_connect', 150, 'planned', 'Future Stripe Connect managed payments target. Must pass through provider, payout, dispute, refund, bank-return, and instant-payout fees.')
on conflict do nothing;
