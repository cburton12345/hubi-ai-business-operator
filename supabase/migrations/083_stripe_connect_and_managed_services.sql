alter table public.service_invoice_payment_links
  add column if not exists payment_mode text not null default 'platform_direct'
    check (payment_mode in ('manual_tracking', 'platform_direct', 'stripe_connect_destination')),
  add column if not exists connected_account_id text,
  add column if not exists platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  add column if not exists processor_fee_cents integer not null default 0 check (processor_fee_cents >= 0),
  add column if not exists net_to_business_cents integer not null default 0;

alter table public.service_invoice_payments
  add column if not exists payment_mode text not null default 'manual_tracking'
    check (payment_mode in ('manual_tracking', 'platform_direct', 'stripe_connect_destination')),
  add column if not exists connected_account_id text,
  add column if not exists platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  add column if not exists processor_fee_cents integer not null default 0 check (processor_fee_cents >= 0),
  add column if not exists payout_status text not null default 'not_applicable'
    check (payout_status in ('not_applicable', 'pending', 'in_transit', 'paid', 'failed', 'reversed')),
  add column if not exists provider_charge_id text,
  add column if not exists provider_transfer_id text,
  add column if not exists provider_payout_id text;

create index if not exists idx_invoice_payment_links_connect
  on public.service_invoice_payment_links(tenant_id, connected_account_id, payment_mode, status);

create index if not exists idx_invoice_payments_connect
  on public.service_invoice_payments(tenant_id, connected_account_id, payment_mode, payout_status);

create table if not exists public.managed_service_programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  service_key text not null,
  service_name text not null,
  service_family text not null
    check (service_family in ('seo', 'ads', 'email', 'reviews', 'content', 'consulting')),
  status text not null default 'planned'
    check (status in ('planned', 'requested', 'active', 'paused', 'cancelled')),
  provider_ownership text not null default 'ferocity_managed'
    check (provider_ownership in ('customer_owned', 'ferocity_managed', 'hybrid')),
  monthly_budget_cents integer not null default 0 check (monthly_budget_cents >= 0),
  management_fee_bps integer not null default 0 check (management_fee_bps >= 0 and management_fee_bps <= 5000),
  approval_mode text not null default 'approval_required'
    check (approval_mode in ('draft_only', 'approval_required', 'auto_with_limits')),
  live_spend_enabled boolean not null default false,
  live_publishing_enabled boolean not null default false,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, service_key)
);

create table if not exists public.managed_service_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  managed_service_program_id uuid references public.managed_service_programs(id) on delete cascade,
  event_type text not null,
  event_status text not null default 'recorded'
    check (event_status in ('recorded', 'needs_approval', 'approved', 'completed', 'failed')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_managed_service_programs_tenant
  on public.managed_service_programs(tenant_id, service_family, status);

create index if not exists idx_managed_service_events_tenant
  on public.managed_service_events(tenant_id, created_at desc);

alter table public.managed_service_programs enable row level security;
alter table public.managed_service_events enable row level security;

drop policy if exists managed_service_programs_tenant_admin on public.managed_service_programs;
create policy managed_service_programs_tenant_admin
on public.managed_service_programs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists managed_service_events_tenant_admin on public.managed_service_events;
create policy managed_service_events_tenant_admin
on public.managed_service_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
