-- public.users is the root of Ferocity's platform and tenant authorization.
-- Browser users may read their visible row and edit only their display name.
-- Identity linkage, email, platform role, row identity, and lifecycle evidence
-- remain server-owned.

do $preflight_users_policy_contract$
declare
  policy_count integer;
  read_policy record;
  update_policy record;
  normalized_qual text;
  normalized_check text;
begin
  select count(*) into policy_count
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='users';

  if policy_count <> 2 then
    raise exception 'User identity hardening found an unexpected public.users policy count; inventory policies before applying migration 271.';
  end if;

  select * into read_policy from pg_catalog.pg_policies
  where schemaname='public' and tablename='users' and policyname='users_read_self_or_platform';
  if read_policy is null or read_policy.cmd <> 'SELECT' or read_policy.permissive <> 'PERMISSIVE'
     or read_policy.roles <> array['public']::name[] then
    raise exception 'User identity hardening found an unexpected read-policy variant; inventory it before applying migration 271.';
  end if;
  normalized_qual := regexp_replace(lower(coalesce(read_policy.qual,'')), '[[:space:]()]', '', 'g');
  if normalized_qual not in (
    'auth_user_id=auth.uidoris_platform_admin',
    'auth_user_id=auth.uidorpublic.is_platform_admin'
  ) then
    raise exception 'User identity hardening found unexpected read-policy semantics; inventory them before applying migration 271.';
  end if;

  select * into update_policy from pg_catalog.pg_policies
  where schemaname='public' and tablename='users' and policyname='users_update_self_or_platform';
  if update_policy is null or update_policy.cmd <> 'UPDATE' or update_policy.permissive <> 'PERMISSIVE'
     or update_policy.roles <> array['public']::name[] then
    raise exception 'User identity hardening found an unexpected update-policy variant; inventory it before applying migration 271.';
  end if;
  normalized_qual := regexp_replace(lower(coalesce(update_policy.qual,'')), '[[:space:]()]', '', 'g');
  normalized_check := regexp_replace(lower(coalesce(update_policy.with_check,'')), '[[:space:]()]', '', 'g');
  if normalized_qual not in (
       'auth_user_id=auth.uidoris_platform_admin',
       'auth_user_id=auth.uidorpublic.is_platform_admin'
     ) or normalized_check not in (
       'auth_user_id=auth.uidoris_platform_admin',
       'auth_user_id=auth.uidorpublic.is_platform_admin'
     ) then
    raise exception 'User identity hardening found unexpected update-policy semantics; inventory them before applying migration 271.';
  end if;
end;
$preflight_users_policy_contract$;

revoke insert, update, delete, truncate, references, trigger
on table public.users from public, anon, authenticated;

do $revoke_users_column_mutations$
declare
  column_list text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into column_list
  from pg_catalog.pg_attribute a
  where a.attrelid='public.users'::regclass and a.attnum > 0 and not a.attisdropped;
  if column_list is not null then
    execute format(
      'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.users from public, anon, authenticated',
      column_list
    );
  end if;
end;
$revoke_users_column_mutations$;

grant select, insert, update, delete on table public.users to service_role;
grant update (name) on table public.users to authenticated;

drop policy users_update_self_or_platform on public.users;
create policy users_update_own_profile_name
on public.users for update to authenticated
using (auth_user_id=auth.uid())
with check (auth_user_id=auth.uid());

create or replace function public.protect_user_identity_browser_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public,auth
as $$
declare
  execution_role text := current_user::text;
  request_role text := coalesce(auth.role()::text, '');
begin
  if execution_role in ('anon','authenticated') or request_role in ('anon','authenticated') then
    if tg_op <> 'UPDATE' then
      raise exception 'User identity rows are server controlled';
    end if;
    -- Future columns are protected by default: the browser may change only
    -- the explicitly granted display-name field.
    if (to_jsonb(new)-'name') is distinct from (to_jsonb(old)-'name') then
      raise exception 'User identity and privilege fields are server controlled';
    end if;
    if new.name is null or length(btrim(new.name)) < 1 or length(new.name) > 160 then
      raise exception 'User display name must be between 1 and 160 characters';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_user_identity_browser_mutation_trigger on public.users;
create trigger protect_user_identity_browser_mutation_trigger
before insert or update or delete on public.users
for each row execute function public.protect_user_identity_browser_mutation();

do $assert_users_browser_boundary$
declare
  role_name text;
  protected_column text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if pg_catalog.has_table_privilege(role_name,'public.users','INSERT')
       or pg_catalog.has_table_privilege(role_name,'public.users','UPDATE')
       or pg_catalog.has_table_privilege(role_name,'public.users','DELETE')
       or pg_catalog.has_table_privilege(role_name,'public.users','TRUNCATE')
       or pg_catalog.has_table_privilege(role_name,'public.users','REFERENCES')
       or pg_catalog.has_table_privilege(role_name,'public.users','TRIGGER') then
      raise exception 'User identity hardening found an inherited table mutation privilege for role %.', role_name;
    end if;
    for protected_column in
      select a.attname
      from pg_catalog.pg_attribute a
      where a.attrelid='public.users'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and a.attname <> 'name'
      order by a.attnum
    loop
      if pg_catalog.has_column_privilege(role_name,'public.users',protected_column,'INSERT')
         or pg_catalog.has_column_privilege(role_name,'public.users',protected_column,'UPDATE')
         or pg_catalog.has_column_privilege(role_name,'public.users',protected_column,'REFERENCES') then
        raise exception 'User identity hardening found an inherited protected-column privilege for role % column %.', role_name, protected_column;
      end if;
    end loop;
  end loop;
  if pg_catalog.has_column_privilege('anon','public.users','name','UPDATE')
     or not pg_catalog.has_column_privilege('authenticated','public.users','name','UPDATE') then
    raise exception 'User identity hardening found an unexpected display-name mutation boundary.';
  end if;
  if not pg_catalog.has_table_privilege('service_role','public.users','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'User identity hardening did not preserve the trusted service-role path.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='users'
      and cmd <> 'SELECT' and policyname <> 'users_update_own_profile_name'
  ) then
    raise exception 'User identity hardening found an unreviewed mutation policy after hardening.';
  end if;
end;
$assert_users_browser_boundary$;

comment on column public.users.platform_role is
  'Server-owned platform privilege. Browser roles cannot insert or update this field.';
