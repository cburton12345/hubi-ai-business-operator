-- Authoritative, server-only ledger for Ferocity's own subscription cash events.
-- Customer-business invoice payments remain in their tenant-scoped service ledgers.
create table if not exists public.platform_subscription_revenue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_key text not null,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_event_id text not null unique,
  provider_object_id text not null,
  external_subscription_ref text,
  external_customer_ref text,
  event_type text not null check (event_type in (
    'subscription_invoice_paid',
    'subscription_invoice_failed',
    'subscription_invoice_action_required',
    'subscription_invoice_finalization_failed',
    'subscription_refund'
  )),
  financial_status text not null check (financial_status in ('collected','at_risk','refunded')),
  gross_amount_cents integer not null default 0 check (gross_amount_cents >= 0),
  refund_amount_cents integer not null default 0 check (refund_amount_cents >= 0),
  net_amount_cents integer not null default 0,
  currency text not null default 'usd',
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  occurred_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (financial_status='collected' and refund_amount_cents=0 and net_amount_cents=gross_amount_cents)
    or (financial_status='at_risk' and refund_amount_cents=0 and net_amount_cents=0)
    or (financial_status='refunded' and gross_amount_cents=0 and net_amount_cents=-refund_amount_cents)
  )
);

create index if not exists platform_subscription_revenue_occurred_idx
  on public.platform_subscription_revenue_events(occurred_at desc);
create index if not exists platform_subscription_revenue_tenant_idx
  on public.platform_subscription_revenue_events(tenant_id,occurred_at desc);
create index if not exists platform_subscription_revenue_subscription_idx
  on public.platform_subscription_revenue_events(external_subscription_ref,occurred_at desc)
  where external_subscription_ref is not null;
create index if not exists platform_subscription_revenue_object_idx
  on public.platform_subscription_revenue_events(provider_object_id,event_type);

alter table public.platform_subscription_revenue_events enable row level security;
revoke all on table public.platform_subscription_revenue_events
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.platform_subscription_revenue_events
to service_role;

comment on table public.platform_subscription_revenue_events is
  'Server-only, idempotent ledger of Ferocity subscription collections, payment risk, and refunds from verified Stripe webhooks. It never contains customer-business invoice revenue.';
