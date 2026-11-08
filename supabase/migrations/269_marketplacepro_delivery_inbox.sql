-- Additive only. This migration is intentionally not applied by local development.
-- MarketplacePro owner-pilot delivery remains disabled until a specific connection
-- and its connection-bound vaulted signing credential are explicitly configured.

alter table public.marketplacepro_connections
  drop constraint if exists marketplacepro_connections_connection_status_check;

alter table public.marketplacepro_connections
  add constraint marketplacepro_connections_connection_status_check
  check (connection_status in ('not_connected', 'connected', 'needs_attention', 'sync_paused', 'revoked'));

-- Do not repair or remap legacy rows implicitly. A cross-tenant brand mapping
-- blocks migration application and must be reviewed explicitly first.
do $marketplacepro_brand_tenant_preflight$
begin
  if exists (
    select 1
    from public.marketplacepro_connections connection
    join public.brands brand on brand.id = connection.brand_id
    where connection.brand_id is not null
      and brand.tenant_id <> connection.tenant_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'MarketplacePro migration 269 blocked: a connection references a brand owned by another tenant.';
  end if;
end;
$marketplacepro_brand_tenant_preflight$;

create unique index if not exists uq_brands_id_tenant_id
  on public.brands(id, tenant_id);

do $marketplacepro_brand_tenant_constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'marketplacepro_connections_brand_tenant_fk'
      and conrelid = 'public.marketplacepro_connections'::regclass
  ) then
    alter table public.marketplacepro_connections
      add constraint marketplacepro_connections_brand_tenant_fk
      foreign key (brand_id, tenant_id)
      references public.brands(id, tenant_id)
      on update restrict on delete cascade
      not valid;
  end if;
end;
$marketplacepro_brand_tenant_constraint$;

alter table public.marketplacepro_connections
  validate constraint marketplacepro_connections_brand_tenant_fk;

create unique index if not exists uq_marketplacepro_connections_bound_identity
  on public.marketplacepro_connections(id, tenant_id, marketplace_account_id);

create table if not exists public.marketplacepro_owner_pilot_enrollments (
  connection_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_account_id text not null check (length(trim(source_account_id)) between 1 and 200),
  enabled boolean not null default false,
  contract_version text not null check (contract_version = '2026-10-22.v1'),
  credential_label text not null check (length(trim(credential_label)) between 1 and 120),
  configured_by_user_id uuid references public.users(id) on delete set null,
  configured_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id),
  unique (source_account_id),
  unique (connection_id, tenant_id, source_account_id),
  constraint marketplacepro_owner_pilot_connection_identity_fk
    foreign key (connection_id, tenant_id, source_account_id)
    references public.marketplacepro_connections(id, tenant_id, marketplace_account_id)
    on update restrict on delete cascade,
  constraint marketplacepro_owner_pilot_enabled_configuration_check
    check (not enabled or configured_at is not null)
);

create table if not exists public.marketplacepro_delivery_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null,
  source_account_id text not null,
  delivery_id text not null check (length(delivery_id) between 8 and 120 and delivery_id ~ '^[A-Za-z0-9._:-]+$'),
  contract_version text not null check (contract_version = '2026-10-22.v1'),
  delivery_kind text not null check (delivery_kind in ('event', 'lead', 'lead_status')),
  occurred_at timestamptz not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, delivery_id),
  constraint marketplacepro_delivery_inbox_enrollment_identity_fk
    foreign key (connection_id, tenant_id, source_account_id)
    references public.marketplacepro_owner_pilot_enrollments(connection_id, tenant_id, source_account_id)
    on update restrict on delete restrict
);

create index if not exists idx_marketplacepro_delivery_inbox_tenant_status
  on public.marketplacepro_delivery_inbox(tenant_id, processing_status, updated_at desc);

create index if not exists idx_marketplacepro_connections_exact_source_account
  on public.marketplacepro_connections(marketplace_account_id)
  where marketplace_account_id is not null;

alter table public.marketplacepro_delivery_inbox enable row level security;
alter table public.marketplacepro_owner_pilot_enrollments enable row level security;

drop policy if exists marketplacepro_delivery_inbox_tenant_owner on public.marketplacepro_delivery_inbox;
drop policy if exists marketplacepro_owner_pilot_enrollments_tenant_owner on public.marketplacepro_owner_pilot_enrollments;

-- Enrollment and replay/audit state are server-governed. No browser RLS policy
-- is created: future accidental grants still cannot authorize a row operation.
revoke all on table public.marketplacepro_delivery_inbox
from public, anon, authenticated, service_role;

revoke all on table public.marketplacepro_owner_pilot_enrollments
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.marketplacepro_delivery_inbox
to service_role;

grant select, insert, update, delete on table public.marketplacepro_owner_pilot_enrollments
to service_role;
