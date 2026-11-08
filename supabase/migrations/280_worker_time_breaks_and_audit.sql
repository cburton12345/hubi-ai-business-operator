-- Unapplied: persisted worker breaks, immutable time-clock evidence, and server-only writes.

alter table public.operations_time_entries
  add column if not exists break_started_at timestamptz,
  add column if not exists break_seconds integer not null default 0 check (break_seconds >= 0);

create table if not exists public.operations_time_entry_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  time_entry_id uuid not null references public.operations_time_entries(id) on delete restrict,
  worker_id uuid references public.operations_workers(id) on delete set null,
  event_type text not null check (event_type in (
    'clock_in','break_started','break_ended','clock_out','time_corrected'
  )),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_worker_id uuid references public.operations_workers(id) on delete set null,
  reason text,
  previous_state_json jsonb not null default '{}'::jsonb,
  new_state_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $bind_time_event_identity$
begin
  if exists (
    select 1 from public.operations_time_entry_events event
    join public.operations_time_entries entry on entry.id=event.time_entry_id
    where event.tenant_id<>entry.tenant_id or event.worker_id is distinct from entry.worker_id
  ) then
    raise exception 'Time-event evidence has a tenant/worker mismatch; inventory and correct it before applying migration 280.';
  end if;
  if not exists (select 1 from pg_constraint where conname='operations_time_entries_tenant_id_id_worker_id_key' and conrelid='public.operations_time_entries'::regclass) then
    alter table public.operations_time_entries add constraint operations_time_entries_tenant_id_id_worker_id_key unique (tenant_id,id,worker_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='operations_time_entries_tenant_id_id_key' and conrelid='public.operations_time_entries'::regclass) then
    alter table public.operations_time_entries add constraint operations_time_entries_tenant_id_id_key unique (tenant_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='operations_time_entry_events_tenant_entry_fkey' and conrelid='public.operations_time_entry_events'::regclass) then
    alter table public.operations_time_entry_events add constraint operations_time_entry_events_tenant_entry_fkey
      foreign key (tenant_id,time_entry_id)
      references public.operations_time_entries(tenant_id,id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='operations_time_entry_events_entry_identity_fkey' and conrelid='public.operations_time_entry_events'::regclass) then
    alter table public.operations_time_entry_events add constraint operations_time_entry_events_entry_identity_fkey
      foreign key (tenant_id,time_entry_id,worker_id)
      references public.operations_time_entries(tenant_id,id,worker_id) on delete restrict;
  end if;
end
$bind_time_event_identity$;

create unique index if not exists uniq_operations_time_entry_event_idempotency
  on public.operations_time_entry_events(tenant_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_operations_time_entry_events_entry
  on public.operations_time_entry_events(tenant_id,time_entry_id,occurred_at,id);

alter table public.operations_time_entry_events enable row level security;

do $validate_operations_time_entries_tenant$
declare actual record; normalized_qual text; normalized_check text;
begin
  select p.* into actual from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename='operations_time_entries'
    and p.policyname='operations_time_entries_tenant';
  if actual.policyname is null or actual.cmd<>'ALL' or actual.permissive<>'PERMISSIVE'
    or actual.roles<>array['public']::name[] then
    raise exception 'Time-entry hardening found a noncanonical operations_time_entries_tenant policy; inventory its consumer before applying migration 280.';
  end if;
  normalized_qual := regexp_replace(replace(replace(lower(coalesce(actual.qual,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  normalized_check := regexp_replace(replace(replace(lower(coalesce(actual.with_check,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  if normalized_qual<> 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']'
    or normalized_check<> 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']' then
    raise exception 'Time-entry hardening found customized operations_time_entries_tenant semantics; inventory its consumer before applying migration 280.';
  end if;
end
$validate_operations_time_entries_tenant$;

drop policy if exists operations_time_entries_tenant on public.operations_time_entries;
drop policy if exists operations_time_entries_tenant_read on public.operations_time_entries;
create policy operations_time_entries_tenant_read on public.operations_time_entries for select
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists operations_time_entry_events_tenant_read on public.operations_time_entry_events;
create policy operations_time_entry_events_tenant_read on public.operations_time_entry_events for select
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

revoke insert,update,delete,truncate,references,trigger
  on public.operations_time_entries,public.operations_time_entry_events
  from public,anon,authenticated;

revoke all privileges on public.operations_time_entry_events from public,anon,authenticated;
grant select on public.operations_time_entry_events to authenticated;

do $$
declare target text;
declare columns_sql text;
begin
  foreach target in array array['operations_time_entries','operations_time_entry_events'] loop
    select string_agg(format('%I',a.attname),', ' order by a.attnum)
      into columns_sql
    from pg_attribute a
    where a.attrelid=format('public.%I',target)::regclass
      and a.attnum > 0 and not a.attisdropped;
    execute format(
      'revoke insert (%s), update (%s) on public.%I from public,anon,authenticated',
      columns_sql,columns_sql,target
    );
  end loop;
end $$;

comment on column public.operations_time_entries.break_started_at is
  'Current persisted break start, null while actively working or after clock-out.';
comment on column public.operations_time_entries.break_seconds is
  'Accumulated persisted break duration. break_minutes remains a rounded compatibility value.';
comment on table public.operations_time_entry_events is
  'Append-only actor and correction evidence for clock-in, breaks, clock-out, and reviewed time corrections.';
