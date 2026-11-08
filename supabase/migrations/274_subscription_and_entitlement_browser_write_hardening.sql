-- Subscription state and feature entitlements are reconciled by Ferocity's
-- permission-checked server workflows and verified billing callbacks. Pricing
-- and feature catalogs remain readable, but browser roles must not mutate any
-- of these authoritative records.

do $validate_subscription_entitlement_policies$
declare
  expected record;
  actual record;
  normalized_qual text;
  normalized_check text;
  expected_qual text;
  expected_check text;
begin
  for expected in
    select * from (values
      ('billing_plans','billing_plans_readable','SELECT','public_catalog'),
      ('billing_subscriptions','billing_subscriptions_tenant_admin','ALL','tenant_admin'),
      ('workspace_feature_entitlements','workspace_feature_entitlements_tenant_admin','ALL','tenant_admin'),
      ('plan_feature_matrix','plan_feature_matrix_readable','SELECT','public_catalog')
    ) as policies(table_name,policy_name,policy_command,policy_shape)
  loop
    select p.* into actual
    from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.table_name
      and p.policyname=expected.policy_name;

    if actual.policyname is null
      or actual.cmd<>expected.policy_command
      or actual.permissive<>'PERMISSIVE'
      or actual.roles<>array['public']::name[]
    then
      raise exception 'Subscription/entitlement hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 274.',expected.table_name,expected.policy_name;
    end if;

    normalized_qual:=regexp_replace(
      replace(replace(lower(coalesce(actual.qual,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );
    normalized_check:=regexp_replace(
      replace(replace(lower(coalesce(actual.with_check,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );

    if expected.policy_shape='public_catalog' then
      expected_qual:='true';
      expected_check:='';
    else
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'']';
      expected_check:=expected_qual;
    end if;

    if normalized_qual<>expected_qual or normalized_check<>expected_check then
      raise exception 'Subscription/entitlement hardening found noncanonical USING/WITH CHECK semantics for public.%.%; inventory its consumer before applying migration 274.',expected.table_name,expected.policy_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array[
        'billing_plans','billing_subscriptions',
        'workspace_feature_entitlements','plan_feature_matrix'
      ])
      and (p.tablename || ':' || p.policyname)<>all(array[
        'billing_plans:billing_plans_readable',
        'billing_subscriptions:billing_subscriptions_tenant_admin',
        'workspace_feature_entitlements:workspace_feature_entitlements_tenant_admin',
        'plan_feature_matrix:plan_feature_matrix_readable'
      ])
  ) then
    raise exception 'Subscription/entitlement hardening found an unreviewed RLS policy; inventory its consumer before applying migration 274.';
  end if;
end;
$validate_subscription_entitlement_policies$;

revoke insert,update,delete,truncate,references,trigger on table
  public.billing_plans,
  public.billing_subscriptions,
  public.workspace_feature_entitlements,
  public.plan_feature_matrix
from public,anon,authenticated;

do $revoke_subscription_entitlement_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array[
    'billing_plans','billing_subscriptions',
    'workspace_feature_entitlements','plan_feature_matrix'
  ] loop
    select string_agg(format('%I',a.attname),', ' order by a.attnum)
      into column_list
    from pg_catalog.pg_attribute a
    where a.attrelid=format('public.%I',table_name)::regclass
      and a.attnum>0 and not a.attisdropped;
    if column_list is not null then
      execute format(
        'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from public, anon, authenticated',
        column_list,table_name
      );
    end if;
  end loop;
end;
$revoke_subscription_entitlement_column_writes$;

-- Keep public pricing/feature discovery and authenticated tenant reads intact.
grant select on table public.billing_plans,public.plan_feature_matrix to anon,authenticated;
grant select on table public.billing_subscriptions,public.workspace_feature_entitlements to authenticated;

grant select,insert,update,delete on table
  public.billing_plans,
  public.billing_subscriptions,
  public.workspace_feature_entitlements,
  public.plan_feature_matrix
to service_role;

drop policy billing_subscriptions_tenant_admin on public.billing_subscriptions;
create policy billing_subscriptions_tenant_admin on public.billing_subscriptions
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy workspace_feature_entitlements_tenant_admin on public.workspace_feature_entitlements;
create policy workspace_feature_entitlements_tenant_admin on public.workspace_feature_entitlements
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

do $assert_subscription_entitlement_browser_read_only$
declare
  table_name text;
  role_name text;
  relation_oid oid;
  has_column_write boolean;
begin
  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array[
        'billing_plans','billing_subscriptions',
        'workspace_feature_entitlements','plan_feature_matrix'
      ])
      and p.cmd<>'SELECT'
  ) then
    raise exception 'Subscription/entitlement hardening left a browser mutation RLS policy.';
  end if;

  foreach table_name in array array[
    'billing_plans','billing_subscriptions',
    'workspace_feature_entitlements','plan_feature_matrix'
  ] loop
    relation_oid:=format('public.%I',table_name)::regclass;
    foreach role_name in array array['public','anon','authenticated'] loop
      if pg_catalog.has_table_privilege(role_name,relation_oid,'INSERT')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'UPDATE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'DELETE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'TRUNCATE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'REFERENCES')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'TRIGGER')
      then
        raise exception 'Subscription/entitlement hardening found inherited table mutation privilege for role % on public.%; inventory role memberships before applying migration 274.',role_name,table_name;
      end if;

      select exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid=relation_oid and a.attnum>0 and not a.attisdropped
          and (
            pg_catalog.has_column_privilege(role_name,relation_oid,a.attnum,'INSERT')
            or pg_catalog.has_column_privilege(role_name,relation_oid,a.attnum,'UPDATE')
            or pg_catalog.has_column_privilege(role_name,relation_oid,a.attnum,'REFERENCES')
          )
      ) into has_column_write;
      if has_column_write then
        raise exception 'Subscription/entitlement hardening found inherited column mutation privilege for role % on public.%; inventory role memberships before applying migration 274.',role_name,table_name;
      end if;
    end loop;

    if not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'INSERT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'UPDATE')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    then
      raise exception 'Subscription/entitlement hardening did not preserve trusted service writes on public.%.',table_name;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege('anon','public.billing_plans','SELECT')
    or not pg_catalog.has_table_privilege('authenticated','public.billing_plans','SELECT')
    or not pg_catalog.has_table_privilege('anon','public.plan_feature_matrix','SELECT')
    or not pg_catalog.has_table_privilege('authenticated','public.plan_feature_matrix','SELECT')
    or not pg_catalog.has_table_privilege('authenticated','public.billing_subscriptions','SELECT')
    or not pg_catalog.has_table_privilege('authenticated','public.workspace_feature_entitlements','SELECT')
  then
    raise exception 'Subscription/entitlement hardening did not preserve intended catalog or tenant read privileges.';
  end if;
end;
$assert_subscription_entitlement_browser_read_only$;

comment on table public.billing_subscriptions is
  'Tenant-readable subscription truth reconciled only by privileged Ferocity billing workflows.';
comment on table public.workspace_feature_entitlements is
  'Tenant-readable feature entitlement truth reconciled only by privileged plan and service-control workflows.';
