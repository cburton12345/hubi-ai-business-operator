-- Provider-wide outbound voice launch reservations. These protect inbound
-- capacity and close the race between checking Retell concurrency and Retell
-- reporting a newly-created call as active.

create table if not exists public.voice_dispatch_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  provider_scope_key text not null,
  queue_id uuid references public.outbound_action_queue(id) on delete set null,
  correlation_id text,
  provider_call_id text,
  priority text not null default 'routine' check (priority in ('routine', 'high', 'urgent')),
  status text not null default 'reserved' check (status in ('reserved', 'active', 'released', 'expired')),
  provider_concurrency_at_reservation integer not null default 0,
  provider_normal_limit integer not null,
  reserved_inbound_slots integer not null,
  estimated_start_at timestamptz,
  expires_at timestamptz not null,
  activated_at timestamptz,
  released_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_dispatch_reservations_provider_call_uidx
  on public.voice_dispatch_reservations (provider_key, provider_call_id)
  where provider_call_id is not null;
create index if not exists voice_dispatch_reservations_scope_active_idx
  on public.voice_dispatch_reservations (provider_scope_key, status, expires_at)
  where status in ('reserved', 'active');
create index if not exists voice_dispatch_reservations_tenant_idx
  on public.voice_dispatch_reservations (tenant_id, created_at desc);

alter table public.voice_dispatch_reservations enable row level security;
revoke all on table public.voice_dispatch_reservations from public, anon, authenticated;

create or replace function public.reserve_voice_dispatch_capacity(
  p_tenant_id uuid,
  p_provider_key text,
  p_provider_scope_key text,
  p_provider_current_concurrency integer,
  p_provider_normal_limit integer,
  p_reserved_inbound_slots integer,
  p_queue_id uuid default null,
  p_correlation_id text default null,
  p_priority text default 'routine'
)
returns table (
  allowed boolean,
  reservation_id uuid,
  estimated_start_at timestamptz,
  outbound_soft_limit integer,
  pending_launches integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soft_limit integer;
  v_pending integer;
  v_reservation_id uuid;
  v_eta timestamptz;
  v_average_seconds integer;
begin
  if p_provider_normal_limit < 1 then
    raise exception 'provider normal concurrency limit must be positive';
  end if;

  -- One transaction at a time may inspect and reserve a launch for an account.
  perform pg_advisory_xact_lock(hashtextextended(p_provider_scope_key, 194));

  update public.voice_dispatch_reservations
  set status = 'expired', released_at = now(), updated_at = now()
  where provider_scope_key = p_provider_scope_key
    and status in ('reserved', 'active')
    and expires_at <= now();

  v_soft_limit := greatest(1, p_provider_normal_limit - greatest(0, p_reserved_inbound_slots));
  select count(*)::integer into v_pending
  from public.voice_dispatch_reservations
  where provider_scope_key = p_provider_scope_key
    and (
      (status = 'reserved' and provider_call_id is null)
      -- Retell can take a few seconds to include a newly accepted call in
      -- current_concurrency. Count that short activation window locally too.
      or (status = 'active' and activated_at > now() - interval '30 seconds')
    )
    and expires_at > now();

  if greatest(0, p_provider_current_concurrency) + v_pending >= v_soft_limit then
    select greatest(120, least(900, coalesce(avg(nullif(duration_seconds, 0)), 300)::integer))
      into v_average_seconds
    from public.receptionist_calls
    where provider_key = p_provider_key
      and direction = 'outbound'
      and status in ('completed', 'transferred')
      and created_at >= now() - interval '30 days';
    v_eta := now() + make_interval(secs => coalesce(v_average_seconds, 300));
    return query select false, null::uuid, v_eta, v_soft_limit, v_pending;
    return;
  end if;

  insert into public.voice_dispatch_reservations (
    tenant_id, provider_key, provider_scope_key, queue_id, correlation_id,
    priority, provider_concurrency_at_reservation, provider_normal_limit,
    reserved_inbound_slots, expires_at, metadata_json
  ) values (
    p_tenant_id, p_provider_key, p_provider_scope_key, p_queue_id, p_correlation_id,
    case when p_priority in ('routine', 'high', 'urgent') then p_priority else 'routine' end,
    greatest(0, p_provider_current_concurrency), p_provider_normal_limit,
    greatest(0, p_reserved_inbound_slots), now() + interval '2 minutes',
    jsonb_build_object('source', 'voice_dispatch_capacity')
  ) returning id into v_reservation_id;

  return query select true, v_reservation_id, null::timestamptz, v_soft_limit, v_pending;
end;
$$;

create or replace function public.activate_voice_dispatch_reservation(
  p_reservation_id uuid,
  p_provider_call_id text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with changed as (
    update public.voice_dispatch_reservations
    set provider_call_id = p_provider_call_id,
        status = 'active',
        activated_at = now(),
        expires_at = now() + interval '4 hours',
        updated_at = now()
    where id = p_reservation_id and status = 'reserved' and expires_at > now()
    returning 1
  ) select exists(select 1 from changed);
$$;

create or replace function public.release_voice_dispatch_reservation(
  p_provider_key text,
  p_provider_call_id text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with changed as (
    update public.voice_dispatch_reservations
    set status = 'released', released_at = now(), updated_at = now()
    where provider_key = p_provider_key
      and provider_call_id = p_provider_call_id
      and status in ('reserved', 'active')
    returning 1
  ) select exists(select 1 from changed);
$$;

revoke all on function public.reserve_voice_dispatch_capacity(uuid,text,text,integer,integer,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function public.activate_voice_dispatch_reservation(uuid,text) from public, anon, authenticated;
revoke all on function public.release_voice_dispatch_reservation(text,text) from public, anon, authenticated;

comment on table public.voice_dispatch_reservations is
  'Server-only provider-account capacity reservations for controlled outbound voice calls. Inbound calls do not reserve here.';
