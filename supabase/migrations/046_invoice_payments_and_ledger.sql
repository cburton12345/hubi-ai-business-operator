create table if not exists public.service_invoice_payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid not null references public.service_invoices(id) on delete cascade,
  provider text not null default 'stripe'
    check (provider in ('stripe', 'manual', 'external')),
  provider_account_id text,
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'paid', 'expired', 'canceled', 'failed')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'usd',
  payment_url text,
  expires_at timestamptz,
  requested_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid not null references public.service_invoices(id) on delete cascade,
  payment_link_id uuid references public.service_invoice_payment_links(id) on delete set null,
  provider text not null default 'manual'
    check (provider in ('stripe', 'manual', 'external')),
  provider_payment_id text,
  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'manual')),
  amount_cents integer not null check (amount_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  net_cents integer not null default 0,
  currency text not null default 'usd',
  paid_at timestamptz,
  received_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.service_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.service_invoices(id) on delete cascade,
  payment_id uuid references public.service_invoice_payments(id) on delete set null,
  entry_type text not null
    check (entry_type in ('invoice_issued', 'payment_requested', 'payment_received', 'payment_failed', 'refund', 'adjustment', 'write_off', 'fee')),
  direction text not null
    check (direction in ('debit', 'credit')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  description text,
  provider text,
  provider_event_id text,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_payment_links_invoice
  on public.service_invoice_payment_links(tenant_id, invoice_id, status, created_at desc);

create index if not exists idx_invoice_payments_invoice
  on public.service_invoice_payments(tenant_id, invoice_id, status, received_at desc);

create index if not exists idx_service_ledger_invoice
  on public.service_ledger_entries(tenant_id, invoice_id, occurred_at desc);

create unique index if not exists uniq_invoice_payment_links_stripe_session
  on public.service_invoice_payment_links(provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create unique index if not exists uniq_invoice_payments_provider_payment
  on public.service_invoice_payments(provider, provider_payment_id)
  where provider_payment_id is not null;

alter table public.service_invoice_payment_links enable row level security;
alter table public.service_invoice_payments enable row level security;
alter table public.service_ledger_entries enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_invoice_payment_links',
    'service_invoice_payments',
    'service_ledger_entries'
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

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'payment_collection',
  'limited',
  250,
  'monthly',
  '{"category":"Payments","description":"Invoice payment requests, manual payment records, Stripe checkout links, and ledger entries","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Prepare collection and ledger records. Send payment links only after review.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = coalesce(public.workspace_feature_entitlements.usage_period, excluded.usage_period),
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();

insert into public.billing_plans (plan_key, name, monthly_price_cents, included_workspaces, included_brands, included_ai_runs, metadata_json)
values
  ('free', 'Free', 0, 1, 1, 25, '{"stripeConnected": false, "leadLimit": 25, "ferocityBranding": true}'::jsonb),
  ('starter', 'Starter', 7900, 1, 2, 200, '{"stripeConnected": false}'::jsonb),
  ('growth', 'Growth', 19900, 3, 10, 1000, '{"stripeConnected": false}'::jsonb),
  ('operator', 'Operator', 39900, 10, 50, 5000, '{"stripeConnected": false}'::jsonb)
on conflict (plan_key) do update
set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  included_workspaces = excluded.included_workspaces,
  included_brands = excluded.included_brands,
  included_ai_runs = excluded.included_ai_runs,
  active = true,
  metadata_json = excluded.metadata_json || public.billing_plans.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'lead_capture', 'Lead Capture', true, '1 form and limited monthly leads', 5, '{"freeTier":true}'::jsonb),
  ('free', 'source_tracking', 'Source Tracking', true, 'Basic website/source tracking', 6, '{"freeTier":true}'::jsonb),
  ('free', 'manual_tasks', 'Manual Tasks', true, 'Manual follow-up only', 7, '{"freeTier":true}'::jsonb),
  ('operator', 'payment_collection', 'Payment Collection', true, 'Invoice payment requests and ledger tracking', 135, '{"serviceControl":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();
