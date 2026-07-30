create table if not exists public.provider_funding_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  provider_key text not null,
  account_key text not null,
  display_name text not null,
  capability_key text not null default 'variable_cost',
  ownership_mode text not null default 'ferocity_managed'
    check (ownership_mode in ('ferocity_managed', 'customer_owned')),
  status text not null default 'needs_sync'
    check (status in ('setup_required', 'needs_sync', 'active', 'low_balance', 'critical', 'depleted', 'payment_issue', 'paused', 'closed')),
  currency text not null default 'usd',
  balance_tracking_mode text not null default 'manual'
    check (balance_tracking_mode in ('provider_api', 'provider_webhook', 'manual', 'inferred')),
  current_balance_cents numeric(14,4),
  promotional_balance_cents numeric(14,4),
  promotional_expires_at timestamptz,
  reload_enabled boolean not null default false,
  reload_trigger_balance_cents numeric(14,4),
  reload_amount_cents numeric(14,4),
  monthly_reload_limit_cents numeric(14,4),
  monthly_provider_spend_cap_cents numeric(14,4),
  low_balance_threshold_cents numeric(14,4),
  critical_balance_threshold_cents numeric(14,4),
  payment_status text not null default 'unknown'
    check (payment_status in ('unknown', 'current', 'action_required', 'failed', 'expired')),
  sync_status text not null default 'never'
    check (sync_status in ('never', 'current', 'stale', 'failed', 'unsupported')),
  last_balance_sync_at timestamptz,
  next_balance_sync_at timestamptz,
  external_account_ref text,
  notes text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_balance_cents is null or current_balance_cents >= 0),
  check (promotional_balance_cents is null or promotional_balance_cents >= 0),
  check (reload_trigger_balance_cents is null or reload_trigger_balance_cents >= 0),
  check (reload_amount_cents is null or reload_amount_cents > 0),
  check (monthly_reload_limit_cents is null or monthly_reload_limit_cents > 0),
  check (monthly_provider_spend_cap_cents is null or monthly_provider_spend_cap_cents > 0),
  check (low_balance_threshold_cents is null or low_balance_threshold_cents >= 0),
  check (critical_balance_threshold_cents is null or critical_balance_threshold_cents >= 0)
);

create unique index if not exists idx_provider_funding_accounts_scope
  on public.provider_funding_accounts (
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider_key,
    account_key
  );

create index if not exists idx_provider_funding_accounts_health
  on public.provider_funding_accounts(status, payment_status, next_balance_sync_at);

create table if not exists public.provider_funding_snapshots (
  id uuid primary key default gen_random_uuid(),
  funding_account_id uuid not null references public.provider_funding_accounts(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  balance_cents numeric(14,4),
  promotional_balance_cents numeric(14,4),
  promotional_expires_at timestamptz,
  provider_period_spend_cents numeric(14,4),
  tracked_provider_cost_cents numeric(14,4) not null default 0,
  tracked_customer_charge_cents numeric(14,4) not null default 0,
  source text not null default 'manual'
    check (source in ('provider_api', 'provider_webhook', 'manual', 'inferred', 'reconciliation')),
  sync_status text not null default 'current'
    check (sync_status in ('current', 'stale', 'failed', 'unsupported')),
  idempotency_key text not null,
  observed_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (funding_account_id, idempotency_key),
  check (balance_cents is null or balance_cents >= 0),
  check (promotional_balance_cents is null or promotional_balance_cents >= 0),
  check (provider_period_spend_cents is null or provider_period_spend_cents >= 0),
  check (tracked_provider_cost_cents >= 0),
  check (tracked_customer_charge_cents >= 0)
);

create index if not exists idx_provider_funding_snapshots_account_observed
  on public.provider_funding_snapshots(funding_account_id, observed_at desc);

create table if not exists public.provider_cost_reconciliations (
  id uuid primary key default gen_random_uuid(),
  funding_account_id uuid not null references public.provider_funding_accounts(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  provider_statement_cost_cents numeric(14,4) not null default 0,
  tracked_provider_cost_cents numeric(14,4) not null default 0,
  tracked_customer_charge_cents numeric(14,4) not null default 0,
  variance_cents numeric(14,4) not null default 0,
  status text not null default 'needs_review'
    check (status in ('matched', 'needs_review', 'adjusted', 'closed')),
  provider_statement_ref text,
  notes text not null default '',
  reconciled_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funding_account_id, period_start, period_end)
);

create table if not exists public.provider_funding_alerts (
  id uuid primary key default gen_random_uuid(),
  funding_account_id uuid not null references public.provider_funding_accounts(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  alert_key text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high')),
  status text not null default 'active'
    check (status in ('active', 'resolved')),
  title text not null,
  summary text not null,
  action_href text not null default '/app/provider-costs',
  metadata_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funding_account_id, alert_key)
);

create index if not exists idx_provider_funding_alerts_active
  on public.provider_funding_alerts(status, severity, last_seen_at desc);

alter table public.provider_funding_accounts enable row level security;
alter table public.provider_funding_snapshots enable row level security;
alter table public.provider_cost_reconciliations enable row level security;
alter table public.provider_funding_alerts enable row level security;

-- These tables contain Ferocity provider balances, internal costs, margins,
-- payment health, and reconciliations. They intentionally have no
-- client-facing RLS policies. Trusted server code guarded by platform:manage
-- is the only access path. Tenant-facing usage stays in the existing
-- tenant-safe usage and spend-limit tables.
