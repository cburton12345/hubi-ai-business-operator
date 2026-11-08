-- AI budget policy and usage evidence are evaluated and recorded only by
-- Ferocity's trusted server runtime. Migration 266 derived raw browser write
-- grants from policy presence; restore a read-only browser boundary without
-- changing the existing (including global-policy) read predicates.

do $validate_ai_budget_usage_policies$
declare
  expected record;
  actual record;
  normalized_qual text;
  normalized_check text;
begin
  for expected in
    select * from (values
      ('ai_usage_events','ai_usage_events_tenant_operator','ALL'),
      ('ai_budget_policies','ai_budget_policies_tenant_operator','ALL')
    ) as policies(table_name,policy_name,policy_command)
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
      raise exception 'AI budget/usage hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 276.',expected.table_name,expected.policy_name;
    end if;

    normalized_qual:=regexp_replace(
      replace(replace(lower(coalesce(actual.qual,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );
    normalized_check:=regexp_replace(
      replace(replace(lower(coalesce(actual.with_check,'')),'::text',''),'public.',''),
      '[[:space:]()]','','g'
    );

    if expected.table_name='ai_usage_events' then
      if normalized_qual<>'existsselect1fromtenant_userstuwheretu.tenant_id=ai_usage_events.tenant_idandtu.user_id=auth.uidandtu.status=''active'''
        or normalized_check<>normalized_qual
      then
        raise exception 'AI budget/usage hardening found noncanonical USING/WITH CHECK semantics for public.%; inventory its consumer before applying migration 276.',expected.table_name;
      end if;
    else
      if normalized_qual<>'tenant_idisnullorexistsselect1fromtenant_userstuwheretu.tenant_id=ai_budget_policies.tenant_idandtu.user_id=auth.uidandtu.status=''active'''
        or normalized_check<>normalized_qual
      then
        raise exception 'AI budget/usage hardening found noncanonical USING/WITH CHECK semantics for public.%; inventory its consumer before applying migration 276.',expected.table_name;
      end if;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array['ai_usage_events','ai_budget_policies'])
      and (p.tablename || ':' || p.policyname)<>all(array[
        'ai_usage_events:ai_usage_events_tenant_operator',
        'ai_budget_policies:ai_budget_policies_tenant_operator'
      ])
  ) then
    raise exception 'AI budget/usage hardening found an unreviewed RLS policy; inventory its consumer before applying migration 276.';
  end if;
end;
$validate_ai_budget_usage_policies$;

revoke insert,update,delete,truncate,references,trigger on table
  public.ai_usage_events,
  public.ai_budget_policies
from public,anon,authenticated;

do $revoke_ai_budget_usage_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array['ai_usage_events','ai_budget_policies'] loop
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
$revoke_ai_budget_usage_column_writes$;

-- Preserve the exact pre-migration Data API read grants. RLS remains the
-- authority for tenant/global row visibility; this migration intentionally
-- does not repair the historical auth.uid()/public.users identity mismatch.
grant select on table public.ai_usage_events,public.ai_budget_policies to anon,authenticated;

grant select,insert,update,delete on table
  public.ai_usage_events,
  public.ai_budget_policies
to service_role;

drop policy ai_usage_events_tenant_operator on public.ai_usage_events;
create policy ai_usage_events_tenant_operator on public.ai_usage_events
for select using (
  exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id=ai_usage_events.tenant_id
      and tu.user_id=auth.uid()
      and tu.status='active'
  )
);

drop policy ai_budget_policies_tenant_operator on public.ai_budget_policies;
create policy ai_budget_policies_tenant_operator on public.ai_budget_policies
for select using (
  tenant_id is null
  or exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id=ai_budget_policies.tenant_id
      and tu.user_id=auth.uid()
      and tu.status='active'
  )
);

do $assert_ai_budget_usage_browser_read_only$
declare
  table_name text;
  role_name text;
  relation_oid oid;
  has_column_write boolean;
begin
  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array['ai_usage_events','ai_budget_policies'])
      and p.cmd<>'SELECT'
  ) then
    raise exception 'AI budget/usage hardening left a browser mutation RLS policy.';
  end if;

  foreach table_name in array array['ai_usage_events','ai_budget_policies'] loop
    relation_oid:=format('public.%I',table_name)::regclass;
    foreach role_name in array array['public','anon','authenticated'] loop
      if pg_catalog.has_table_privilege(role_name,relation_oid,'INSERT')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'UPDATE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'DELETE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'TRUNCATE')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'REFERENCES')
        or pg_catalog.has_table_privilege(role_name,relation_oid,'TRIGGER')
      then
        raise exception 'AI budget/usage hardening found inherited table mutation privilege for role % on public.%; inventory role memberships before applying migration 276.',role_name,table_name;
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
        raise exception 'AI budget/usage hardening found inherited column mutation privilege for role % on public.%; inventory role memberships before applying migration 276.',role_name,table_name;
      end if;
    end loop;

    if not pg_catalog.has_table_privilege('anon',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('authenticated',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'INSERT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'UPDATE')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    then
      raise exception 'AI budget/usage hardening did not preserve existing browser reads and trusted service writes on public.%.',table_name;
    end if;
  end loop;
end;
$assert_ai_budget_usage_browser_read_only$;

comment on table public.ai_usage_events is
  'Tenant-readable AI provider usage and cost evidence. All mutations are written by trusted Ferocity server runtimes.';
comment on table public.ai_budget_policies is
  'RLS-readable AI budget policy state. All mutations use trusted Ferocity server workflows; global defaults remain platform-owned.';
