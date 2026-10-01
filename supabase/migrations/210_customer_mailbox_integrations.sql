-- Customer-owned mailbox monitoring. Connections begin read-only; sending is a
-- separate permission and is never implied by granting inbox access.

create table if not exists public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null check (provider_key in ('gmail_mailbox','microsoft_mailbox')),
  account_external_id text,
  account_email text,
  display_name text,
  status text not null default 'connected' check (status in ('connected','syncing','needs_attention','disconnected')),
  read_enabled boolean not null default true,
  send_enabled boolean not null default false,
  sync_cursor text,
  last_synced_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create table if not exists public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.mailbox_connections(id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  internet_message_id text,
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  sender_json jsonb not null default '{}'::jsonb,
  recipients_json jsonb not null default '[]'::jsonb,
  subject text,
  preview text,
  body_text text,
  received_at timestamptz not null,
  is_read boolean not null default false,
  has_attachments boolean not null default false,
  importance text,
  labels_json jsonb not null default '[]'::jsonb,
  classification text not null default 'other'
    check (classification in ('lead','customer','finance','vendor','support','urgent','other')),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  action_status text not null default 'unreviewed'
    check (action_status in ('unreviewed','needs_attention','reviewed','archived')),
  source_url text,
  raw_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_message_id)
);

create table if not exists public.mailbox_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.mailbox_connections(id) on delete cascade,
  status text not null check (status in ('running','completed','failed')),
  messages_seen integer not null default 0,
  messages_saved integer not null default 0,
  safe_error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_mailbox_messages_tenant_received
  on public.mailbox_messages(tenant_id, received_at desc);
create index if not exists idx_mailbox_messages_attention
  on public.mailbox_messages(tenant_id, action_status, received_at desc)
  where action_status = 'needs_attention';
create index if not exists idx_mailbox_sync_runs_connection
  on public.mailbox_sync_runs(connection_id, started_at desc);

alter table public.mailbox_connections enable row level security;
alter table public.mailbox_messages enable row level security;
alter table public.mailbox_sync_runs enable row level security;

create policy mailbox_connections_tenant_access on public.mailbox_connections for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));
create policy mailbox_messages_tenant_access on public.mailbox_messages for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
create policy mailbox_sync_runs_tenant_access on public.mailbox_sync_runs for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

comment on table public.mailbox_connections is 'Tenant-owned Gmail and Microsoft 365 inbox connections. Read and send authority are deliberately separate.';
comment on table public.mailbox_messages is 'Normalized, tenant-isolated mailbox messages used by Email Watch and the owner briefing.';
