-- Workspace owners/admins retain the existing tenant-row update scope for
-- noncommercial profile fields. Commercial and ownership authority remains
-- server controlled: account_type, status, billing_status, plan_key, and
-- owner_user_id cannot be changed by browser roles.

do $preflight_tenant_policy_contract$
declare
  policy_count integer;
  read_policy record;
  update_policy record;
  normalized_qual text;
  normalized_check text;
  tenant_user_tenant_attnum smallint;
  tenant_id_attnum smallint;
  matching_fk_count integer;
  safe_fk_count integer;
begin
  select count(*) into policy_count
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='tenants';
  if policy_count<>2 then
    raise exception 'Tenant commercial-authority hardening found an unexpected public.tenants policy count; inventory policies before applying migration 278.';
  end if;

  select * into read_policy from pg_catalog.pg_policies
  where schemaname='public' and tablename='tenants' and policyname='tenants_read_by_member';
  if read_policy is null or read_policy.cmd<>'SELECT' or read_policy.permissive<>'PERMISSIVE'
     or read_policy.roles<>array['public']::name[] then
    raise exception 'Tenant commercial-authority hardening found an unexpected read-policy variant; inventory it before applying migration 278.';
  end if;
  normalized_qual:=regexp_replace(replace(lower(coalesce(read_policy.qual,'')),'public.',''),'[[:space:]()]','','g');
  if normalized_qual<>'has_tenant_accessid' then
    raise exception 'Tenant commercial-authority hardening found unexpected read-policy semantics; inventory them before applying migration 278.';
  end if;

  select * into update_policy from pg_catalog.pg_policies
  where schemaname='public' and tablename='tenants' and policyname='tenants_write_by_owner_admin';
  if update_policy is null or update_policy.cmd<>'UPDATE' or update_policy.permissive<>'PERMISSIVE'
     or update_policy.roles<>array['public']::name[] then
    raise exception 'Tenant commercial-authority hardening found an unexpected update-policy variant; inventory it before applying migration 278.';
  end if;
  normalized_qual:=regexp_replace(replace(replace(lower(coalesce(update_policy.qual,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  normalized_check:=regexp_replace(replace(replace(lower(coalesce(update_policy.with_check,'')),'::text',''),'public.',''),'[[:space:]()]','','g');
  if normalized_qual<>'has_tenant_roleid,array[''owner'',''admin'']' or normalized_check<>normalized_qual then
    raise exception 'Tenant commercial-authority hardening found unexpected update-policy semantics; inventory them before applying migration 278.';
  end if;

  select a.attnum into tenant_user_tenant_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid='public.tenant_users'::regclass
    and a.attname='tenant_id' and a.attnum>0 and not a.attisdropped;
  select a.attnum into tenant_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid='public.tenants'::regclass
    and a.attname='id' and a.attnum>0 and not a.attisdropped;

  select
    count(*),
    count(*) filter (where c.convalidated and c.confupdtype<>'c')
  into matching_fk_count,safe_fk_count
  from pg_catalog.pg_constraint c
  where c.contype='f'
    and c.conrelid='public.tenant_users'::regclass
    and c.confrelid='public.tenants'::regclass
    and c.conkey=array[tenant_user_tenant_attnum]::smallint[]
    and c.confkey=array[tenant_id_attnum]::smallint[];

  if tenant_user_tenant_attnum is null or tenant_id_attnum is null
    or matching_fk_count<>1 or safe_fk_count<>1
  then
    raise exception 'Tenant commercial-authority hardening requires exactly one validated tenant_users.tenant_id -> tenants.id foreign key whose ON UPDATE action is not CASCADE; repair or inventory the identity baseline before applying migration 278.';
  end if;
end;
$preflight_tenant_policy_contract$;

-- INSERT and DELETE never had tenant browser policies. Remove their derived
-- grants as defense in depth, then replace table-wide UPDATE with the exact
-- current noncommercial-column set. Future columns are not auto-granted.
revoke insert,update,delete,truncate,references,trigger
on table public.tenants from public,anon,authenticated;

do $replace_tenant_browser_column_privileges$
declare
  all_columns text;
  profile_columns text;
begin
  select string_agg(format('%I',a.attname),', ' order by a.attnum)
    into all_columns
  from pg_catalog.pg_attribute a
  where a.attrelid='public.tenants'::regclass and a.attnum>0 and not a.attisdropped;
  if all_columns is not null then
    execute format(
      'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.tenants from public, anon, authenticated',
      all_columns
    );
  end if;

  select string_agg(format('%I',a.attname),', ' order by a.attnum)
    into profile_columns
  from pg_catalog.pg_attribute a
  where a.attrelid='public.tenants'::regclass and a.attnum>0 and not a.attisdropped
    and a.attname<>all(array['account_type','status','billing_status','plan_key','owner_user_id']);
  if profile_columns is null then
    raise exception 'Tenant commercial-authority hardening found no existing noncommercial columns to preserve.';
  end if;
  execute format('grant update (%s) on table public.tenants to authenticated',profile_columns);
end;
$replace_tenant_browser_column_privileges$;

grant select,insert,update,delete on table public.tenants to service_role;

create or replace function public.protect_tenant_commercial_authority_browser_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public,auth
as $$
declare
  execution_role text:=current_user::text;
  request_role text:=coalesce(auth.role()::text,'');
begin
  if execution_role in ('anon','authenticated') or request_role in ('anon','authenticated') then
    if tg_op<>'UPDATE' then
      raise exception 'Tenant creation and deletion are server controlled';
    end if;
    if new.account_type is distinct from old.account_type
      or new.status is distinct from old.status
      or new.billing_status is distinct from old.billing_status
      or new.plan_key is distinct from old.plan_key
      or new.owner_user_id is distinct from old.owner_user_id
    then
      raise exception 'Tenant commercial and ownership authority fields are server controlled';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_tenant_commercial_authority_browser_mutation_trigger on public.tenants;
create trigger protect_tenant_commercial_authority_browser_mutation_trigger
before insert or update or delete on public.tenants
for each row execute function public.protect_tenant_commercial_authority_browser_mutation();

do $assert_tenant_commercial_authority_boundary$
declare
  role_name text;
  column_name text;
begin
  foreach role_name in array array['public','anon','authenticated'] loop
    if pg_catalog.has_table_privilege(role_name,'public.tenants','INSERT')
      or pg_catalog.has_table_privilege(role_name,'public.tenants','UPDATE')
      or pg_catalog.has_table_privilege(role_name,'public.tenants','DELETE')
      or pg_catalog.has_table_privilege(role_name,'public.tenants','TRUNCATE')
      or pg_catalog.has_table_privilege(role_name,'public.tenants','REFERENCES')
      or pg_catalog.has_table_privilege(role_name,'public.tenants','TRIGGER')
    then
      raise exception 'Tenant commercial-authority hardening found inherited table mutation privilege for role %.',role_name;
    end if;

    foreach column_name in array array['account_type','status','billing_status','plan_key','owner_user_id'] loop
      if pg_catalog.has_column_privilege(role_name,'public.tenants',column_name,'INSERT')
        or pg_catalog.has_column_privilege(role_name,'public.tenants',column_name,'UPDATE')
        or pg_catalog.has_column_privilege(role_name,'public.tenants',column_name,'REFERENCES')
      then
        raise exception 'Tenant commercial-authority hardening found inherited protected-column privilege for role % column %.',role_name,column_name;
      end if;
    end loop;
  end loop;

  for column_name in
    select a.attname from pg_catalog.pg_attribute a
    where a.attrelid='public.tenants'::regclass and a.attnum>0 and not a.attisdropped
      and a.attname<>all(array['account_type','status','billing_status','plan_key','owner_user_id'])
  loop
    if not pg_catalog.has_column_privilege('authenticated','public.tenants',column_name,'UPDATE') then
      raise exception 'Tenant commercial-authority hardening failed to preserve existing authenticated update scope for noncommercial column %.',column_name;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege('service_role','public.tenants','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Tenant commercial-authority hardening did not preserve the trusted service-role path.';
  end if;
  if (select count(*) from pg_catalog.pg_policies where schemaname='public' and tablename='tenants')<>2 then
    raise exception 'Tenant commercial-authority hardening changed the tenant RLS policy inventory.';
  end if;
end;
$assert_tenant_commercial_authority_boundary$;

comment on column public.tenants.account_type is 'Server-owned tenant commercial classification; browser roles cannot update it.';
comment on column public.tenants.status is 'Server-owned tenant lifecycle authority; browser roles cannot update it.';
comment on column public.tenants.billing_status is 'Server-owned billing lifecycle truth; browser roles cannot update it.';
comment on column public.tenants.plan_key is 'Server-owned plan assignment; browser roles cannot update it.';
comment on column public.tenants.owner_user_id is 'Server-owned workspace ownership linkage; browser roles cannot update it.';
