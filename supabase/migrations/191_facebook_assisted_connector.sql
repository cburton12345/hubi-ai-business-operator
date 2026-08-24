-- One-time pairing material for the customer-owned Facebook assisted connector.
-- Codes and bearer tokens are stored as hashes only. The connector never receives
-- a Ferocity user session, provider password, or service-role credential.

create table if not exists public.growth_connector_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  identity_id uuid not null references public.growth_distribution_identities(id) on delete cascade,
  code_hash text not null unique,
  issued_by_user_id uuid references public.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists growth_connector_pairing_codes_active_idx
  on public.growth_connector_pairing_codes(identity_id, expires_at)
  where used_at is null and revoked_at is null;

alter table public.growth_connector_pairing_codes enable row level security;
-- Pairing records contain authentication material and remain server-managed.
drop policy if exists growth_connector_pairing_codes_tenant_operator on public.growth_connector_pairing_codes;

alter table public.growth_connector_sessions
  add column if not exists paired_at timestamptz,
  add column if not exists last_ip_hash text,
  add column if not exists last_user_agent_hash text;
