create table if not exists public.integration_object_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider_key text not null,
  object_type text not null,
  internal_table text not null,
  internal_id uuid,
  external_scope text not null default '',
  external_id text not null,
  external_version text,
  ownership_mode text not null default 'shared'
    check (ownership_mode in ('ferocity', 'provider', 'shared', 'review')),
  last_synced_hash text,
  last_synced_at timestamptz,
  provider_deleted_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, object_type, external_scope, external_id),
  unique nulls not distinct (connection_id, object_type, internal_table, internal_id, external_scope)
);

create index if not exists integration_object_mappings_internal_idx
  on public.integration_object_mappings(tenant_id, internal_table, internal_id);

create table if not exists public.integration_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  resource_type text not null,
  external_scope text not null default '',
  cursor_value text,
  window_start timestamptz,
  window_end timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started', 'syncing', 'current', 'reset_required', 'error', 'paused')),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, resource_type, external_scope)
);

create table if not exists public.calendar_sync_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null unique references public.integration_connections(id) on delete cascade,
  provider_key text not null check (provider_key in ('google_calendar', 'microsoft_calendar')),
  external_calendar_id text,
  external_calendar_name text,
  sync_direction text not null default 'inbound'
    check (sync_direction in ('inbound', 'outbound', 'two_way')),
  conflict_policy text not null default 'review'
    check (conflict_policy in ('review', 'ferocity_wins', 'provider_wins')),
  import_external_events boolean not null default true,
  outbound_writes_enabled boolean not null default false,
  sync_window_past_days integer not null default 30 check (sync_window_past_days between 0 and 365),
  sync_window_future_days integer not null default 365 check (sync_window_future_days between 30 and 730),
  status text not null default 'needs_calendar'
    check (status in ('needs_calendar', 'ready_read_only', 'ready', 'paused', 'error')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider_key text not null,
  external_calendar_id text not null,
  external_event_id text not null,
  external_version text,
  title text not null default '',
  description text not null default '',
  location_text text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  event_status text not null default 'confirmed',
  web_url text,
  attendee_emails_json jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  provider_deleted_at timestamptz,
  raw_summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_calendar_id, external_event_id)
);

create index if not exists external_calendar_events_schedule_idx
  on public.external_calendar_events(tenant_id, starts_at, ends_at)
  where provider_deleted_at is null;

create table if not exists public.integration_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  integration_job_id uuid references public.integration_jobs(id) on delete set null,
  provider_key text not null,
  operation text not null,
  object_type text,
  external_id text,
  internal_id uuid,
  error_category text not null,
  safe_error_message text not null,
  payload_summary_json jsonb not null default '{}'::jsonb,
  attempts integer not null default 1 check (attempts > 0),
  status text not null default 'open' check (status in ('open', 'retrying', 'resolved', 'discarded')),
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_dead_letters_tenant_status_idx
  on public.integration_dead_letters(tenant_id, status, created_at desc);

alter table public.integration_object_mappings enable row level security;
alter table public.integration_sync_cursors enable row level security;
alter table public.calendar_sync_settings enable row level security;
alter table public.external_calendar_events enable row level security;
alter table public.integration_dead_letters enable row level security;

drop policy if exists integration_object_mappings_tenant on public.integration_object_mappings;
create policy integration_object_mappings_tenant on public.integration_object_mappings for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists integration_sync_cursors_tenant on public.integration_sync_cursors;
create policy integration_sync_cursors_tenant on public.integration_sync_cursors for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists calendar_sync_settings_tenant on public.calendar_sync_settings;
create policy calendar_sync_settings_tenant on public.calendar_sync_settings for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists external_calendar_events_tenant on public.external_calendar_events;
create policy external_calendar_events_tenant on public.external_calendar_events for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists integration_dead_letters_tenant on public.integration_dead_letters;
create policy integration_dead_letters_tenant on public.integration_dead_letters for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.external_calendar_events is
  'Provider-owned calendar events cached for availability and conflict detection. They do not become Ferocity jobs unless explicitly adopted.';
comment on column public.calendar_sync_settings.outbound_writes_enabled is
  'Independent owner authorization for Ferocity-created calendar writes; OAuth connection alone never enables writes.';
