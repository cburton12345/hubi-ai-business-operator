-- H4R -> Ferocity Connect signed bridge.
-- This only authorizes mapped H4R workspaces to enqueue through Ferocity's
-- canonical messaging engine. It does not enable any H4R production routing.

create table if not exists public.h4r_ferocity_bridge_workspaces (
  id uuid primary key default gen_random_uuid(),
  h4r_workspace_id uuid not null,
  ferocity_tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'disabled'
    check (status in ('disabled','shadow','review','active','paused','revoked')),
  reply_mode text not null default 'review'
    check (reply_mode in ('record_only','review','guarded_automatic')),
  callback_url text check (callback_url is null or callback_url ~ '^https://'),
  allowed_categories jsonb not null default '["tenant_notice","rent_reminder","payment_link","leasing_followup","showing","application"]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (h4r_workspace_id)
);

create table if not exists public.h4r_ferocity_bridge_nonces (
  nonce text primary key,
  first_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.h4r_ferocity_bridge_events (
  id uuid primary key default gen_random_uuid(),
  h4r_workspace_id uuid,
  ferocity_tenant_id uuid references public.tenants(id) on delete cascade,
  sms_outbox_id uuid,
  event_type text not null,
  external_event_id text,
  provider_message_ref text,
  status text not null default 'received'
    check (status in ('received','processed','duplicate','failed','ignored')),
  safe_error_code text,
  safe_error_message text,
  payload_redacted_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists h4r_ferocity_bridge_events_external_idx
  on public.h4r_ferocity_bridge_events(h4r_workspace_id, external_event_id)
  where external_event_id is not null;

create index if not exists h4r_ferocity_bridge_workspaces_tenant_idx
  on public.h4r_ferocity_bridge_workspaces(ferocity_tenant_id, status);

alter table public.h4r_ferocity_bridge_workspaces enable row level security;
alter table public.h4r_ferocity_bridge_nonces enable row level security;
alter table public.h4r_ferocity_bridge_events enable row level security;

revoke all on table public.h4r_ferocity_bridge_workspaces from anon, authenticated;
revoke all on table public.h4r_ferocity_bridge_nonces from anon, authenticated;
revoke all on table public.h4r_ferocity_bridge_events from anon, authenticated;
grant select on table public.h4r_ferocity_bridge_workspaces to authenticated;
grant select on table public.h4r_ferocity_bridge_events to authenticated;

drop policy if exists h4r_ferocity_bridge_workspaces_tenant_admin on public.h4r_ferocity_bridge_workspaces;
create policy h4r_ferocity_bridge_workspaces_tenant_admin on public.h4r_ferocity_bridge_workspaces
for select
using (public.has_tenant_role(ferocity_tenant_id,array['owner','admin']));

drop policy if exists h4r_ferocity_bridge_events_tenant_admin on public.h4r_ferocity_bridge_events;
create policy h4r_ferocity_bridge_events_tenant_admin on public.h4r_ferocity_bridge_events
for select
using (public.has_tenant_role(ferocity_tenant_id,array['owner','admin']));

comment on table public.h4r_ferocity_bridge_workspaces is
  'Server-side mapping from H4R workspace id to a Ferocity tenant authorized to use Ferocity Connect.';
