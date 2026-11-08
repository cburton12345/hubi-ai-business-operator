-- Accounting, usage, and quota records are written through Ferocity's
-- privileged server query path. Migration 266 derived browser grants from RLS
-- policy presence, so the historical FOR ALL policies accidentally exposed
-- raw browser mutations. Keep the existing read visibility while restoring
-- the server-owned write boundary.

-- Validate the source-defined policies before changing them. A live/custom
-- policy that reuses a historical name may have a consumer that is absent from
-- source; stop before any DDL rather than silently replacing that contract.
do $validate_canonical_accounting_policies$
declare
  expected record;
  actual record;
  normalized_qual text;
  normalized_check text;
  expected_qual text;
  expected_check text;
  known_storage_signature regprocedure;
begin
  for expected in
    select * from (values
      ('usage_meter_events', 'usage_meter_events_tenant_operator', 'tenant_operator'),
      ('storage_usage_events', 'storage_usage_events_tenant_operator', 'tenant_operator'),
      ('storage_quota_policies', 'storage_quota_policies_tenant_operator', 'tenant_operator'),
      ('billing_usage_charges', 'billing_usage_charges_tenant_admin', 'tenant_admin'),
      ('usage_bundle_purchases', 'usage_bundle_purchases_tenant_operator', 'tenant_operator'),
      ('usage_allowance_policies', 'usage_allowance_policies_tenant_operator', 'allowance'),
      ('spend_limits', 'spend_limits_tenant_operator', 'tenant_operator')
    ) as policies(table_name, policy_name, policy_shape)
  loop
    select p.* into actual
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = expected.table_name
      and p.policyname = expected.policy_name;

    if actual.policyname is null
      or actual.cmd <> 'ALL'
      or actual.permissive <> 'PERMISSIVE'
      or actual.roles <> array['public']::name[]
    then
      raise exception 'Accounting permission hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 270.', expected.table_name, expected.policy_name;
    end if;

    normalized_qual := regexp_replace(
      replace(replace(lower(coalesce(actual.qual, '')), '::text', ''), 'public.', ''),
      '[[:space:]()]', '', 'g'
    );
    normalized_check := regexp_replace(
      replace(replace(lower(coalesce(actual.with_check, '')), '::text', ''), 'public.', ''),
      '[[:space:]()]', '', 'g'
    );

    if expected.policy_shape = 'tenant_admin' then
      expected_qual := 'has_tenant_roletenant_id,array[''owner'',''admin'']';
      expected_check := expected_qual;
    elsif expected.policy_shape = 'allowance' then
      expected_qual := 'tenant_idisnullorhas_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check := 'tenant_idisnotnullandhas_tenant_roletenant_id,array[''owner'',''admin'']';
    else
      expected_qual := 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check := expected_qual;
    end if;

    if normalized_qual <> expected_qual or normalized_check <> expected_check then
      raise exception 'Accounting permission hardening found noncanonical USING/WITH CHECK semantics for public.%.%; inventory its consumer before applying migration 270.', expected.table_name, expected.policy_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array[
        'usage_meter_events', 'storage_usage_events', 'storage_quota_policies',
        'billing_usage_charges', 'usage_bundle_purchases',
        'usage_allowance_policies', 'spend_limits'
      ])
      and p.cmd <> 'SELECT'
      and p.policyname <> all(array[
        'usage_meter_events_tenant_operator',
        'storage_usage_events_tenant_operator',
        'storage_quota_policies_tenant_operator',
        'billing_usage_charges_tenant_admin',
        'usage_bundle_purchases_tenant_operator',
        'usage_allowance_policies_tenant_operator',
        'spend_limits_tenant_operator'
      ])
  ) then
    raise exception 'Accounting permission hardening found an unreviewed mutation RLS policy; inventory its consumer before applying migration 270.';
  end if;

  known_storage_signature := to_regprocedure(
    'public.reserve_storage_usage(uuid,text,text,text,text,bigint,text,jsonb)'
  );
  if known_storage_signature is null or (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reserve_storage_usage'
  ) <> 1 then
    raise exception 'Accounting permission hardening found an unknown reserve_storage_usage overload; inventory its consumer before applying migration 270.';
  end if;
end;
$validate_canonical_accounting_policies$;

revoke insert, update, delete, truncate, references, trigger on table
  public.usage_meter_events,
  public.storage_usage_events,
  public.storage_quota_policies,
  public.billing_usage_charges,
  public.usage_bundle_purchases,
  public.usage_allowance_policies,
  public.spend_limits
from public, anon, authenticated;

-- Table-level revocation does not remove historical column-level grants.
-- Revoke every mutation-capable column privilege explicitly as well.
do $revoke_accounting_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array[
    'usage_meter_events',
    'storage_usage_events',
    'storage_quota_policies',
    'billing_usage_charges',
    'usage_bundle_purchases',
    'usage_allowance_policies',
    'spend_limits'
  ]
  loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into column_list
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and a.attnum > 0
      and not a.attisdropped;

    if column_list is not null then
      execute format(
        'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from public, anon, authenticated',
        column_list,
        table_name
      );
    end if;
  end loop;
end;
$revoke_accounting_column_writes$;

-- Supabase service-role access and direct privileged database callers remain
-- the supported mutation paths. Do not grant TRUNCATE, TRIGGER, or REFERENCES.
grant select, insert, update, delete on table
  public.usage_meter_events,
  public.storage_usage_events,
  public.storage_quota_policies,
  public.billing_usage_charges,
  public.usage_bundle_purchases,
  public.usage_allowance_policies,
  public.spend_limits
to service_role;

drop policy if exists usage_meter_events_tenant_operator on public.usage_meter_events;
create policy usage_meter_events_tenant_operator
on public.usage_meter_events
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists storage_usage_events_tenant_operator on public.storage_usage_events;
create policy storage_usage_events_tenant_operator
on public.storage_usage_events
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists storage_quota_policies_tenant_operator on public.storage_quota_policies;
create policy storage_quota_policies_tenant_operator
on public.storage_quota_policies
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists billing_usage_charges_tenant_admin on public.billing_usage_charges;
create policy billing_usage_charges_tenant_admin
on public.billing_usage_charges
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists usage_bundle_purchases_tenant_operator on public.usage_bundle_purchases;
create policy usage_bundle_purchases_tenant_operator
on public.usage_bundle_purchases
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists usage_allowance_policies_tenant_operator on public.usage_allowance_policies;
create policy usage_allowance_policies_tenant_operator
on public.usage_allowance_policies
for select
using (
  tenant_id is null
  or public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator'])
);

drop policy if exists spend_limits_tenant_operator on public.spend_limits;
create policy spend_limits_tenant_operator
on public.spend_limits
for select
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

-- Storage reservation is the one target-table SECURITY DEFINER writer. It is
-- server-only; direct PostgreSQL callers continue to work as the function owner.
revoke all on function public.reserve_storage_usage(uuid, text, text, text, text, bigint, text, jsonb)
from public, anon, authenticated;
grant execute on function public.reserve_storage_usage(uuid, text, text, text, text, bigint, text, jsonb)
to service_role;

-- Unknown live/custom mutation policies or inherited role grants require an
-- explicit pre-apply inventory. Abort transactionally instead of guessing at
-- their consumers or silently weakening this boundary.
do $assert_accounting_browser_read_only$
declare
  table_name text;
  role_name text;
  relation_oid oid;
  has_column_write boolean;
begin
  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array[
        'usage_meter_events',
        'storage_usage_events',
        'storage_quota_policies',
        'billing_usage_charges',
        'usage_bundle_purchases',
        'usage_allowance_policies',
        'spend_limits'
      ])
      and p.cmd <> 'SELECT'
  ) then
    raise exception 'Accounting permission hardening found an unreviewed mutation RLS policy; inventory its consumer before applying migration 270.';
  end if;

  foreach table_name in array array[
    'usage_meter_events',
    'storage_usage_events',
    'storage_quota_policies',
    'billing_usage_charges',
    'usage_bundle_purchases',
    'usage_allowance_policies',
    'spend_limits'
  ]
  loop
    relation_oid := format('public.%I', table_name)::regclass;
    foreach role_name in array array['anon', 'authenticated']
    loop
      if pg_catalog.has_table_privilege(role_name, relation_oid, 'INSERT')
        or pg_catalog.has_table_privilege(role_name, relation_oid, 'UPDATE')
        or pg_catalog.has_table_privilege(role_name, relation_oid, 'DELETE')
        or pg_catalog.has_table_privilege(role_name, relation_oid, 'TRUNCATE')
        or pg_catalog.has_table_privilege(role_name, relation_oid, 'REFERENCES')
        or pg_catalog.has_table_privilege(role_name, relation_oid, 'TRIGGER')
      then
        raise exception 'Accounting permission hardening found inherited table write privilege for role % on public.%; inventory role memberships before applying migration 270.', role_name, table_name;
      end if;

      select exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = relation_oid
          and a.attnum > 0
          and not a.attisdropped
          and (
            pg_catalog.has_column_privilege(role_name, relation_oid, a.attnum, 'INSERT')
            or pg_catalog.has_column_privilege(role_name, relation_oid, a.attnum, 'UPDATE')
            or pg_catalog.has_column_privilege(role_name, relation_oid, a.attnum, 'REFERENCES')
          )
      ) into has_column_write;

      if has_column_write then
        raise exception 'Accounting permission hardening found inherited column write privilege for role % on public.%; inventory role memberships before applying migration 270.', role_name, table_name;
      end if;
    end loop;
  end loop;

  foreach role_name in array array['anon', 'authenticated']
  loop
    if pg_catalog.has_function_privilege(
      role_name,
      'public.reserve_storage_usage(uuid,text,text,text,text,bigint,text,jsonb)',
      'EXECUTE'
    ) then
      raise exception 'Accounting permission hardening found inherited storage reservation execute privilege for role %; inventory role memberships before applying migration 270.', role_name;
    end if;
  end loop;
end;
$assert_accounting_browser_read_only$;

comment on table public.usage_allowance_policies is
  'Platform-owned usage pricing and allowance policy. Browser roles may read visible rows but all mutations use privileged, audited server paths.';
