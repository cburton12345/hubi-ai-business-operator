begin;

alter table public.app_sessions
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists renewed_at timestamptz,
  add column if not exists authenticated_at timestamptz not null default now(),
  add column if not exists absolute_expires_at timestamptz,
  add column if not exists device_label text,
  add column if not exists authentication_method text not null default 'password';

update public.app_sessions
set absolute_expires_at = greatest(expires_at, created_at + interval '365 days')
where absolute_expires_at is null;

alter table public.app_sessions
  alter column absolute_expires_at set default (now() + interval '365 days'),
  alter column absolute_expires_at set not null;

do $trusted_session_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_absolute_expiry_check'
  ) then
    alter table public.app_sessions
      add constraint app_sessions_absolute_expiry_check
      check (absolute_expires_at >= created_at);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_device_label_length_check'
  ) then
    alter table public.app_sessions
      add constraint app_sessions_device_label_length_check
      check (device_label is null or char_length(device_label) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_authentication_method_check'
  ) then
    alter table public.app_sessions
      add constraint app_sessions_authentication_method_check
      check (authentication_method in ('password', 'invite', 'phone_otp', 'passkey', 'recovery'));
  end if;
end
$trusted_session_constraints$;

update public.app_sessions
set expires_at = least(now() + interval '90 days', absolute_expires_at),
    renewed_at = now(),
    last_seen_at = now()
where revoked_at is null
  and expires_at > now()
  and absolute_expires_at > now();

create index if not exists idx_app_sessions_user_recent_active
  on public.app_sessions (user_id, last_seen_at desc)
  where revoked_at is null;

comment on column public.app_sessions.last_seen_at is
  'Throttled activity marker used for trusted-device visibility; not updated on every request.';
comment on column public.app_sessions.absolute_expires_at is
  'Hard one-year ceiling. Active trusted sessions may roll within this ceiling but never become permanent.';
comment on column public.app_sessions.authenticated_at is
  'Time the user last proved identity with the recorded authentication method.';

commit;
