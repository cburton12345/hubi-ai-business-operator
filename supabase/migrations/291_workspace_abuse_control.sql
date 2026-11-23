create table if not exists public.workspace_abuse_controls (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  surface_key text not null check (surface_key ~ '^[a-z0-9_]{2,80}$'),
  status text not null default 'active' check (status in ('active', 'paused')),
  hourly_limit integer not null check (hourly_limit between 1 and 1000000),
  daily_limit integer not null check (daily_limit between 1 and 10000000),
  hour_started_at timestamptz not null default date_trunc('hour', now()),
  hourly_count integer not null default 0 check (hourly_count >= 0),
  day_started_at timestamptz not null default date_trunc('day', now()),
  daily_count integer not null default 0 check (daily_count >= 0),
  tripped_until timestamptz,
  trip_reason text,
  last_allowed_at timestamptz,
  last_blocked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, surface_key)
);

create table if not exists public.workspace_abuse_event_rollups (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  surface_key text not null check (surface_key ~ '^[a-z0-9_]{2,80}$'),
  event_type text not null check (event_type in ('allowed', 'rate_limited', 'temporarily_tripped', 'manually_paused', 'unavailable')),
  window_started_at timestamptz not null,
  event_count integer not null default 0 check (event_count >= 0),
  last_event_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (tenant_id, surface_key, event_type, window_started_at)
);

create index if not exists workspace_abuse_controls_attention_idx
  on public.workspace_abuse_controls (tenant_id, status, tripped_until, updated_at desc);

create index if not exists workspace_abuse_rollups_recent_idx
  on public.workspace_abuse_event_rollups (tenant_id, window_started_at desc, surface_key, event_type);

alter table public.workspace_abuse_controls enable row level security;
alter table public.workspace_abuse_event_rollups enable row level security;

revoke all on table public.workspace_abuse_controls from public, anon, authenticated, service_role;
revoke all on table public.workspace_abuse_event_rollups from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.workspace_abuse_controls to service_role;
grant select, insert, update, delete on table public.workspace_abuse_event_rollups to service_role;

insert into public.workspace_abuse_controls (tenant_id, surface_key, hourly_limit, daily_limit, metadata_json)
select t.id, defaults.surface_key, defaults.hourly_limit, defaults.daily_limit,
  jsonb_build_object('seededBy', 'workspace_abuse_control_v1', 'containsPii', false)
from public.tenants t
cross join (
  values
    ('public_lead_intake', 120, 1000),
    ('public_chat_ai', 600, 5000),
    ('public_support_intake', 50, 250)
) as defaults(surface_key, hourly_limit, daily_limit)
where t.status <> 'archived'
on conflict (tenant_id, surface_key) do nothing;

create or replace function public.reserve_workspace_abuse_capacity(
  p_tenant_id uuid,
  p_surface_key text,
  p_units integer default 1
)
returns table (
  allowed boolean,
  reason text,
  hourly_count integer,
  hourly_limit integer,
  daily_count integer,
  daily_limit integer,
  tripped_until timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_control public.workspace_abuse_controls%rowtype;
  v_now timestamptz := clock_timestamp();
  v_event_type text;
  v_reason text;
  v_allowed boolean := false;
  v_trip_until timestamptz;
begin
  if p_tenant_id is null
     or p_surface_key !~ '^[a-z0-9_]{2,80}$'
     or p_units is null
     or p_units < 1
     or p_units > 1000 then
    raise exception 'Invalid workspace abuse-capacity reservation.' using errcode = '22023';
  end if;

  insert into public.workspace_abuse_controls (
    tenant_id, surface_key, hourly_limit, daily_limit, metadata_json
  ) values (
    p_tenant_id,
    p_surface_key,
    case p_surface_key
      when 'public_lead_intake' then 120
      when 'public_chat_ai' then 600
      when 'public_support_intake' then 50
      else 100
    end,
    case p_surface_key
      when 'public_lead_intake' then 1000
      when 'public_chat_ai' then 5000
      when 'public_support_intake' then 250
      else 500
    end,
    jsonb_build_object('seededBy', 'workspace_abuse_control_runtime', 'containsPii', false)
  )
  on conflict (tenant_id, surface_key) do nothing;

  select * into v_control
  from public.workspace_abuse_controls
  where tenant_id = p_tenant_id and surface_key = p_surface_key
  for update;

  if v_control.hour_started_at < date_trunc('hour', v_now) then
    v_control.hour_started_at := date_trunc('hour', v_now);
    v_control.hourly_count := 0;
  end if;
  if v_control.day_started_at < date_trunc('day', v_now) then
    v_control.day_started_at := date_trunc('day', v_now);
    v_control.daily_count := 0;
  end if;

  if v_control.status = 'paused' then
    v_event_type := 'manually_paused';
    v_reason := 'This intake surface is paused by an authorized workspace operator.';
  elsif v_control.tripped_until is not null and v_control.tripped_until > v_now then
    v_event_type := 'temporarily_tripped';
    v_reason := coalesce(v_control.trip_reason, 'The workspace safety budget is temporarily tripped.');
    v_trip_until := v_control.tripped_until;
  elsif v_control.hourly_count + p_units > v_control.hourly_limit then
    v_event_type := 'rate_limited';
    v_reason := 'The workspace hourly safety budget was reached.';
    v_trip_until := date_trunc('hour', v_now) + interval '1 hour';
  elsif v_control.daily_count + p_units > v_control.daily_limit then
    v_event_type := 'rate_limited';
    v_reason := 'The workspace daily safety budget was reached.';
    v_trip_until := date_trunc('day', v_now) + interval '1 day';
  else
    v_allowed := true;
    v_event_type := 'allowed';
    v_reason := 'Workspace safety budget available.';
    v_control.hourly_count := v_control.hourly_count + p_units;
    v_control.daily_count := v_control.daily_count + p_units;
    v_control.tripped_until := null;
    v_control.trip_reason := null;
  end if;

  update public.workspace_abuse_controls
  set hour_started_at = v_control.hour_started_at,
      hourly_count = v_control.hourly_count,
      day_started_at = v_control.day_started_at,
      daily_count = v_control.daily_count,
      tripped_until = case when v_allowed then null else coalesce(v_trip_until, v_control.tripped_until) end,
      trip_reason = case when v_allowed then null else v_reason end,
      last_allowed_at = case when v_allowed then v_now else last_allowed_at end,
      last_blocked_at = case when v_allowed then last_blocked_at else v_now end,
      updated_at = v_now
  where tenant_id = p_tenant_id and surface_key = p_surface_key
  returning workspace_abuse_controls.hourly_count,
    workspace_abuse_controls.hourly_limit,
    workspace_abuse_controls.daily_count,
    workspace_abuse_controls.daily_limit,
    workspace_abuse_controls.tripped_until
  into v_control.hourly_count, v_control.hourly_limit, v_control.daily_count,
    v_control.daily_limit, v_control.tripped_until;

  insert into public.workspace_abuse_event_rollups (
    tenant_id, surface_key, event_type, window_started_at, event_count, last_event_at, metadata_json
  ) values (
    p_tenant_id, p_surface_key, v_event_type, date_trunc('hour', v_now), p_units, v_now,
    jsonb_build_object('containsPii', false)
  )
  on conflict (tenant_id, surface_key, event_type, window_started_at) do update
  set event_count = public.workspace_abuse_event_rollups.event_count + excluded.event_count,
      last_event_at = excluded.last_event_at,
      metadata_json = public.workspace_abuse_event_rollups.metadata_json || excluded.metadata_json;

  return query select v_allowed, v_reason, v_control.hourly_count, v_control.hourly_limit,
    v_control.daily_count, v_control.daily_limit, v_control.tripped_until;
end;
$$;

revoke all on function public.reserve_workspace_abuse_capacity(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_workspace_abuse_capacity(uuid, text, integer) to service_role;

comment on table public.workspace_abuse_controls is
  'Tenant-wide intake and compute budgets that stop distributed abuse beyond per-requester limits. Trips expire automatically; manual pauses require an authorized operator.';
comment on table public.workspace_abuse_event_rollups is
  'Hourly aggregate abuse-control evidence. It intentionally stores no IP address, contact value, message body, or other requester PII.';
