-- Revocable, tenant-bound credentials and durable invocation records for the
-- external-assistant MCP adapter. Plaintext bearer tokens are never stored.

create table if not exists public.external_ai_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  authorized_user_id uuid not null references public.users(id) on delete cascade,
  provider_key text not null default 'generic_mcp',
  label text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default '{}',
  daily_request_limit integer not null default 500 check (daily_request_limit between 1 and 10000),
  daily_record_limit integer not null default 2500 check (daily_record_limit between 1 and 100000),
  consent_version text not null,
  consented_at timestamptz not null,
  consent_summary text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz,
  rotated_from_id uuid references public.external_ai_credentials(id) on delete set null,
  last_used_at timestamptz,
  last_used_user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(scopes) > 0),
  check (expires_at is null or expires_at > created_at),
  unique (tenant_id, token_prefix)
);

create table if not exists public.external_ai_tool_invocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  credential_id uuid not null references public.external_ai_credentials(id) on delete cascade,
  provider_key text not null,
  tool_name text not null,
  request_id text,
  idempotency_key text,
  input_hash text not null,
  status text not null default 'running'
    check (status in ('queued','running','completed','needs_review','failed','canceled','timed_out')),
  durable_reference_type text,
  durable_reference_id uuid,
  output_summary_json jsonb not null default '{}'::jsonb,
  returned_record_count integer not null default 0 check (returned_record_count >= 0),
  last_error text,
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_ai_tool_invocations_idempotency_idx
  on public.external_ai_tool_invocations (tenant_id, credential_id, tool_name, idempotency_key)
  where idempotency_key is not null;
create index if not exists external_ai_credentials_tenant_status_idx
  on public.external_ai_credentials (tenant_id,status,created_at desc);
create index if not exists external_ai_tool_invocations_tenant_status_idx
  on public.external_ai_tool_invocations (tenant_id,status,created_at desc);
create index if not exists external_ai_tool_invocations_credential_created_idx
  on public.external_ai_tool_invocations (credential_id,created_at desc);

alter table public.external_ai_credentials enable row level security;
alter table public.external_ai_tool_invocations enable row level security;

drop policy if exists external_ai_credentials_tenant_admin on public.external_ai_credentials;
create policy external_ai_credentials_tenant_admin on public.external_ai_credentials
for all using (public.has_tenant_role(tenant_id,array['owner','admin']))
with check (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy if exists external_ai_tool_invocations_tenant_admin on public.external_ai_tool_invocations;
create policy external_ai_tool_invocations_tenant_admin on public.external_ai_tool_invocations
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

revoke all on table public.external_ai_credentials
from public, anon, authenticated, service_role;
revoke all on table public.external_ai_tool_invocations
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.external_ai_credentials
to authenticated, service_role;
grant select on table public.external_ai_tool_invocations
to authenticated;
grant select, insert, update, delete on table public.external_ai_tool_invocations
to service_role;

comment on table public.external_ai_credentials is
  'Hashed, scoped, revocable credentials for approved external AI assistants. Plaintext tokens are shown once and never persisted.';
comment on table public.external_ai_tool_invocations is
  'Tenant-scoped MCP invocation, idempotency, provenance, durable-result, and failure evidence.';
