-- Customer-visible logical authority is narrower than a provider's technical OAuth scope.
-- Connecting an account grants read/monitor only; write, send, publish, spend, and money movement
-- remain denied until a separate, explicit customer decision is recorded.

create table if not exists public.integration_authority_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  capability text not null check (capability in ('read','monitor','draft','write','communicate','publish','spend','move_money')),
  decision text not null check (decision in ('granted_once','granted_until_revoked','denied','revoked')),
  technical_scopes_json jsonb not null default '[]'::jsonb,
  explanation text not null,
  source text not null default 'oauth_connection',
  actor_key text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,provider_key,capability)
);

create index if not exists integration_authority_grants_tenant_idx
  on public.integration_authority_grants(tenant_id,provider_key,capability,decision);

alter table public.integration_authority_grants enable row level security;
drop policy if exists integration_authority_grants_tenant_manage on public.integration_authority_grants;
create policy integration_authority_grants_tenant_manage on public.integration_authority_grants for all
using (public.has_tenant_role(tenant_id,array['owner','admin']))
with check (public.has_tenant_role(tenant_id,array['owner','admin']));

revoke all on table public.integration_authority_grants
from public, anon, authenticated, service_role;
grant select, insert, update on table public.integration_authority_grants
to authenticated;
grant select, insert, update, delete on table public.integration_authority_grants
to service_role;

comment on table public.integration_authority_grants is
  'Plain-language customer authority receipts. OAuth technical scopes never imply permission for consequential actions.';
