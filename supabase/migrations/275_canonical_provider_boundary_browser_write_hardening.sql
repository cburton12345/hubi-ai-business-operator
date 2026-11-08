-- Canonical provider, OAuth readiness, payment-account, event, and fee-policy
-- truth is written by Ferocity's permission-checked server routes, callbacks,
-- and webhooks. Preserve the existing tenant read scopes while removing raw
-- browser mutation authority introduced by migration 266's policy-derived ACLs.

do $validate_canonical_provider_policies$
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
      ('provider_accounts','provider_accounts_tenant_operator','tenant_operator'),
      ('integration_connections','integration_connections_tenant_admin','tenant_admin_write'),
      ('provider_connection_lanes','provider_connection_lanes_tenant_operator','tenant_admin_write'),
      ('payment_provider_accounts','payment_provider_accounts_tenant_admin','tenant_admin'),
      ('payment_provider_account_events','payment_provider_account_events_tenant_admin','tenant_admin'),
      ('payment_fee_policies','payment_fee_policies_tenant_admin','nonnull_tenant_admin')
    ) as policies(table_name,policy_name,policy_shape)
  loop
    select p.* into actual
    from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.table_name
      and p.policyname=expected.policy_name;

    if actual.policyname is null
      or actual.cmd<>'ALL'
      or actual.permissive<>'PERMISSIVE'
      or actual.roles<>array['public']::name[]
    then
      raise exception 'Canonical provider hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 275.',expected.table_name,expected.policy_name;
    end if;

    normalized_qual:=regexp_replace(
      replace(replace(lower(coalesce(actual.qual,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );
    normalized_check:=regexp_replace(
      replace(replace(lower(coalesce(actual.with_check,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );

    if expected.policy_shape='tenant_operator' then
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check:=expected_qual;
    elsif expected.policy_shape='tenant_admin_write' then
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check:='has_tenant_roletenant_id,array[''owner'',''admin'']';
    elsif expected.policy_shape='nonnull_tenant_admin' then
      expected_qual:='tenant_idisnotnullandhas_tenant_roletenant_id,array[''owner'',''admin'']';
      expected_check:=expected_qual;
    else
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'']';
      expected_check:=expected_qual;
    end if;

    if normalized_qual<>expected_qual or normalized_check<>expected_check then
      raise exception 'Canonical provider hardening found noncanonical USING/WITH CHECK semantics for public.%.%; inventory its consumer before applying migration 275.',expected.table_name,expected.policy_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array[
        'provider_accounts','integration_connections','provider_connection_lanes',
        'payment_provider_accounts','payment_provider_account_events','payment_fee_policies'
      ])
      and (p.tablename || ':' || p.policyname)<>all(array[
        'provider_accounts:provider_accounts_tenant_operator',
        'integration_connections:integration_connections_tenant_admin',
        'provider_connection_lanes:provider_connection_lanes_tenant_operator',
        'payment_provider_accounts:payment_provider_accounts_tenant_admin',
        'payment_provider_account_events:payment_provider_account_events_tenant_admin',
        'payment_fee_policies:payment_fee_policies_tenant_admin'
      ])
  ) then
    raise exception 'Canonical provider hardening found an unreviewed RLS policy; inventory its consumer before applying migration 275.';
  end if;
end;
$validate_canonical_provider_policies$;

revoke insert,update,delete,truncate,references,trigger on table
  public.provider_accounts,
  public.integration_connections,
  public.provider_connection_lanes,
  public.payment_provider_accounts,
  public.payment_provider_account_events,
  public.payment_fee_policies
from public,anon,authenticated;

do $revoke_canonical_provider_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array[
    'provider_accounts','integration_connections','provider_connection_lanes',
    'payment_provider_accounts','payment_provider_account_events','payment_fee_policies'
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
$revoke_canonical_provider_column_writes$;

grant select on table
  public.provider_accounts,
  public.integration_connections,
  public.provider_connection_lanes,
  public.payment_provider_accounts,
  public.payment_provider_account_events,
  public.payment_fee_policies
to authenticated;

grant select,insert,update,delete on table
  public.provider_accounts,
  public.integration_connections,
  public.provider_connection_lanes,
  public.payment_provider_accounts,
  public.payment_provider_account_events,
  public.payment_fee_policies
to service_role;

drop policy provider_accounts_tenant_operator on public.provider_accounts;
create policy provider_accounts_tenant_operator on public.provider_accounts
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy integration_connections_tenant_admin on public.integration_connections;
create policy integration_connections_tenant_admin on public.integration_connections
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy provider_connection_lanes_tenant_operator on public.provider_connection_lanes;
create policy provider_connection_lanes_tenant_operator on public.provider_connection_lanes
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy payment_provider_accounts_tenant_admin on public.payment_provider_accounts;
create policy payment_provider_accounts_tenant_admin on public.payment_provider_accounts
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy payment_provider_account_events_tenant_admin on public.payment_provider_account_events;
create policy payment_provider_account_events_tenant_admin on public.payment_provider_account_events
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy payment_fee_policies_tenant_admin on public.payment_fee_policies;
create policy payment_fee_policies_tenant_admin on public.payment_fee_policies
for select using (
  tenant_id is not null
  and public.has_tenant_role(tenant_id,array['owner','admin'])
);

do $assert_canonical_provider_browser_read_only$
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
        'provider_accounts','integration_connections','provider_connection_lanes',
        'payment_provider_accounts','payment_provider_account_events','payment_fee_policies'
      ])
      and p.cmd<>'SELECT'
  ) then
    raise exception 'Canonical provider hardening left a browser mutation RLS policy.';
  end if;

  foreach table_name in array array[
    'provider_accounts','integration_connections','provider_connection_lanes',
    'payment_provider_accounts','payment_provider_account_events','payment_fee_policies'
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
        raise exception 'Canonical provider hardening found inherited table mutation privilege for role % on public.%; inventory role memberships before applying migration 275.',role_name,table_name;
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
        raise exception 'Canonical provider hardening found inherited column mutation privilege for role % on public.%; inventory role memberships before applying migration 275.',role_name,table_name;
      end if;
    end loop;

    if not pg_catalog.has_table_privilege('authenticated',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'INSERT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'UPDATE')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    then
      raise exception 'Canonical provider hardening did not preserve tenant reads and trusted service writes on public.%.',table_name;
    end if;
  end loop;
end;
$assert_canonical_provider_browser_read_only$;

comment on table public.provider_accounts is
  'Tenant-readable provider readiness and ownership truth. All mutations use privileged Ferocity server workflows.';
comment on table public.payment_provider_accounts is
  'Tenant-readable payment-provider mapping truth. All mutations use verified privileged onboarding and webhook workflows.';
