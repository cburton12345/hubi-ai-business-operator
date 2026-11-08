-- Keep account-recovery credentials distinct from workspace/employee invitations.
-- Local-password reset tokens may only update an existing credential; they cannot
-- create a membership, accept an invitation, or link a worker record.

do $preflight_password_reset_token_identity$
begin
  if to_regclass('public.password_reset_tokens') is not null then
    raise exception 'Password-reset token separation found an existing public.password_reset_tokens relation; inventory the collision before applying migration 281.';
  end if;
end;
$preflight_password_reset_token_identity$;

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','consumed','revoked','expired')),
  language text not null default 'en' check (language in ('en','es')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_active_user_idx
  on public.password_reset_tokens(user_id,expires_at desc)
  where status='pending';

create unique index password_reset_tokens_one_pending_user_idx
  on public.password_reset_tokens(user_id)
  where status='pending';

alter table public.password_reset_tokens enable row level security;

revoke all privileges on public.password_reset_tokens from public,anon,authenticated;

do $revoke_password_reset_token_columns$
declare
  column_list text;
begin
  select string_agg(format('%I',a.attname),', ' order by a.attnum) into column_list
  from pg_catalog.pg_attribute a
  where a.attrelid='public.password_reset_tokens'::regclass
    and a.attnum>0 and not a.attisdropped;
  execute format(
    'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table public.password_reset_tokens from public, anon, authenticated',
    column_list
  );
end;
$revoke_password_reset_token_columns$;

grant select,insert,update on public.password_reset_tokens to service_role;

do $assert_password_reset_token_boundary$
declare
  role_name text;
  column_name text;
  relation_oid oid := 'public.password_reset_tokens'::regclass;
  pending_index_count integer;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid=relation_oid) then
    raise exception 'Password-reset token separation failed to enable RLS.';
  end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='password_reset_tokens') then
    raise exception 'Password-reset token separation found an unexpected browser policy.';
  end if;

  foreach role_name in array array['public','anon','authenticated'] loop
    if pg_catalog.has_table_privilege(role_name,relation_oid,'SELECT')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'INSERT')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'UPDATE')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'DELETE')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'TRUNCATE')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'REFERENCES')
      or pg_catalog.has_table_privilege(role_name,relation_oid,'TRIGGER')
    then
      raise exception 'Password-reset token separation found inherited table privilege for browser role %.',role_name;
    end if;
    for column_name in
      select a.attname from pg_catalog.pg_attribute a
      where a.attrelid=relation_oid and a.attnum>0 and not a.attisdropped
    loop
      if pg_catalog.has_column_privilege(role_name,relation_oid,column_name,'SELECT')
        or pg_catalog.has_column_privilege(role_name,relation_oid,column_name,'INSERT')
        or pg_catalog.has_column_privilege(role_name,relation_oid,column_name,'UPDATE')
        or pg_catalog.has_column_privilege(role_name,relation_oid,column_name,'REFERENCES')
      then
        raise exception 'Password-reset token separation found inherited column privilege for browser role % column %.',role_name,column_name;
      end if;
    end loop;
  end loop;

  if not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT,INSERT,UPDATE')
    or pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    or pg_catalog.has_table_privilege('service_role',relation_oid,'TRUNCATE')
    or pg_catalog.has_table_privilege('service_role',relation_oid,'REFERENCES')
    or pg_catalog.has_table_privilege('service_role',relation_oid,'TRIGGER')
  then
    raise exception 'Password-reset token separation did not preserve the exact trusted service-role contract.';
  end if;

  select count(*) into pending_index_count
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid=i.indexrelid
  where i.indrelid=relation_oid and idx.relname='password_reset_tokens_one_pending_user_idx'
    and i.indisunique and pg_get_expr(i.indpred,i.indrelid)='(status = ''pending''::text)';
  if pending_index_count<>1 then
    raise exception 'Password-reset token separation did not create the canonical one-pending-token-per-user constraint.';
  end if;
end;
$assert_password_reset_token_boundary$;

comment on table public.password_reset_tokens is
  'Single-purpose, hashed, expiring local-password recovery credentials. Never accepted by invitation routes.';
