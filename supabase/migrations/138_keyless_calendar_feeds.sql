-- Keyless calendar subscriptions. Raw feed tokens are shown once and only
-- their hashes are stored. Provider OAuth remains optional.

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null default 'Ferocity schedule',
  token_hash text not null unique,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists calendar_feed_tokens_tenant_status_idx
  on public.calendar_feed_tokens(tenant_id, status, created_at desc);

alter table public.calendar_feed_tokens enable row level security;

drop policy if exists calendar_feed_tokens_tenant_operator on public.calendar_feed_tokens;
create policy calendar_feed_tokens_tenant_operator
on public.calendar_feed_tokens
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
