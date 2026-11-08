-- Approval, authority, queue, and execution-evidence records are mutated only
-- by Ferocity's permission-checked server workflows. Migration 266 derived raw
-- browser grants from RLS policy presence; restore the intended read-only
-- browser boundary without changing tenant visibility.

do $validate_authority_evidence_policies$
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
      ('approvals', 'approvals_read_by_tenant_member', 'SELECT', 'tenant_member'),
      ('approvals', 'approvals_write_by_tenant_operator', 'ALL', 'tenant_operator'),
      ('activity_logs', 'activity_logs_read_by_tenant_member', 'SELECT', 'tenant_member'),
      ('activity_logs', 'activity_logs_write_by_tenant_operator', 'ALL', 'tenant_operator'),
      ('approval_audit_events', 'approval_audit_events_tenant_operator', 'ALL', 'tenant_operator'),
      ('live_action_policies', 'live_action_policies_tenant_operator', 'ALL', 'tenant_operator'),
      ('outbound_action_queue', 'outbound_action_queue_tenant_operator', 'ALL', 'tenant_operator'),
      ('outbound_delivery_events', 'outbound_delivery_events_tenant_operator', 'ALL', 'tenant_operator'),
      ('capability_execution_audits', 'capability_execution_audits_tenant_operator', 'ALL', 'tenant_admin_write'),
      ('paid_media_action_audit', 'paid_media_action_audit_tenant_operator', 'ALL', 'tenant_operator'),
      ('integration_jobs', 'integration_jobs_tenant_operator', 'ALL', 'tenant_operator')
    ) as policies(table_name, policy_name, policy_command, policy_shape)
  loop
    select p.* into actual
    from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=expected.table_name
      and p.policyname=expected.policy_name;

    if actual.policyname is null
      or actual.cmd <> expected.policy_command
      or actual.permissive <> 'PERMISSIVE'
      or actual.roles <> array['public']::name[]
    then
      raise exception 'Authority/evidence hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 273.', expected.table_name, expected.policy_name;
    end if;

    normalized_qual := regexp_replace(
      replace(replace(lower(coalesce(actual.qual,'')), '::text', ''), 'public.', ''),
      '[[:space:]()]', '', 'g'
    );
    normalized_check := regexp_replace(
      replace(replace(lower(coalesce(actual.with_check,'')), '::text', ''), 'public.', ''),
      '[[:space:]()]', '', 'g'
    );

    if expected.policy_shape='tenant_member' then
      expected_qual := 'has_tenant_accesstenant_id';
      expected_check := '';
    elsif expected.policy_shape='tenant_admin_write' then
      expected_qual := 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check := 'has_tenant_roletenant_id,array[''owner'',''admin'']';
    else
      expected_qual := 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check := expected_qual;
    end if;

    if normalized_qual <> expected_qual or normalized_check <> expected_check then
      raise exception 'Authority/evidence hardening found noncanonical USING/WITH CHECK semantics for public.%.%; inventory its consumer before applying migration 273.', expected.table_name, expected.policy_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array[
        'approvals','live_action_policies','outbound_action_queue',
        'approval_audit_events','activity_logs','outbound_delivery_events',
        'capability_execution_audits','paid_media_action_audit','integration_jobs'
      ])
      and (p.tablename || ':' || p.policyname) <> all(array[
        'approvals:approvals_read_by_tenant_member',
        'approvals:approvals_write_by_tenant_operator',
        'activity_logs:activity_logs_read_by_tenant_member',
        'activity_logs:activity_logs_write_by_tenant_operator',
        'approval_audit_events:approval_audit_events_tenant_operator',
        'live_action_policies:live_action_policies_tenant_operator',
        'outbound_action_queue:outbound_action_queue_tenant_operator',
        'outbound_delivery_events:outbound_delivery_events_tenant_operator',
        'capability_execution_audits:capability_execution_audits_tenant_operator',
        'paid_media_action_audit:paid_media_action_audit_tenant_operator',
        'integration_jobs:integration_jobs_tenant_operator'
      ])
  ) then
    raise exception 'Authority/evidence hardening found an unreviewed RLS policy; inventory its consumer before applying migration 273.';
  end if;
end;
$validate_authority_evidence_policies$;

revoke insert, update, delete, truncate, references, trigger on table
  public.approvals,
  public.live_action_policies,
  public.outbound_action_queue,
  public.approval_audit_events,
  public.activity_logs,
  public.outbound_delivery_events,
  public.capability_execution_audits,
  public.paid_media_action_audit,
  public.integration_jobs
from public, anon, authenticated;

do $revoke_authority_evidence_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array[
    'approvals','live_action_policies','outbound_action_queue',
    'approval_audit_events','activity_logs','outbound_delivery_events',
    'capability_execution_audits','paid_media_action_audit','integration_jobs'
  ] loop
    select string_agg(format('%I',a.attname),', ' order by a.attnum)
      into column_list
    from pg_catalog.pg_attribute a
    where a.attrelid=format('public.%I',table_name)::regclass
      and a.attnum>0 and not a.attisdropped;
    if column_list is not null then
      execute format(
        'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from public, anon, authenticated',
        column_list, table_name
      );
    end if;
  end loop;
end;
$revoke_authority_evidence_column_writes$;

grant select on table
  public.approvals,
  public.live_action_policies,
  public.outbound_action_queue,
  public.approval_audit_events,
  public.activity_logs,
  public.outbound_delivery_events,
  public.capability_execution_audits,
  public.paid_media_action_audit,
  public.integration_jobs
to authenticated;

grant select, insert, update, delete on table
  public.approvals,
  public.live_action_policies,
  public.outbound_action_queue,
  public.approval_audit_events,
  public.activity_logs,
  public.outbound_delivery_events,
  public.capability_execution_audits,
  public.paid_media_action_audit,
  public.integration_jobs
to service_role;

drop policy approvals_write_by_tenant_operator on public.approvals;
drop policy activity_logs_write_by_tenant_operator on public.activity_logs;

drop policy approval_audit_events_tenant_operator on public.approval_audit_events;
create policy approval_audit_events_tenant_operator on public.approval_audit_events
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy live_action_policies_tenant_operator on public.live_action_policies;
create policy live_action_policies_tenant_operator on public.live_action_policies
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy outbound_action_queue_tenant_operator on public.outbound_action_queue;
create policy outbound_action_queue_tenant_operator on public.outbound_action_queue
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy outbound_delivery_events_tenant_operator on public.outbound_delivery_events;
create policy outbound_delivery_events_tenant_operator on public.outbound_delivery_events
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy capability_execution_audits_tenant_operator on public.capability_execution_audits;
create policy capability_execution_audits_tenant_operator on public.capability_execution_audits
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy paid_media_action_audit_tenant_operator on public.paid_media_action_audit;
create policy paid_media_action_audit_tenant_operator on public.paid_media_action_audit
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy integration_jobs_tenant_operator on public.integration_jobs;
create policy integration_jobs_tenant_operator on public.integration_jobs
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

do $assert_authority_evidence_browser_read_only$
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
        'approvals','live_action_policies','outbound_action_queue',
        'approval_audit_events','activity_logs','outbound_delivery_events',
        'capability_execution_audits','paid_media_action_audit','integration_jobs'
      ])
      and p.cmd<>'SELECT'
  ) then
    raise exception 'Authority/evidence hardening left a browser mutation RLS policy.';
  end if;

  foreach table_name in array array[
    'approvals','live_action_policies','outbound_action_queue',
    'approval_audit_events','activity_logs','outbound_delivery_events',
    'capability_execution_audits','paid_media_action_audit','integration_jobs'
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
        raise exception 'Authority/evidence hardening found inherited table mutation privilege for role % on public.%; inventory role memberships before applying migration 273.',role_name,table_name;
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
        raise exception 'Authority/evidence hardening found inherited column mutation privilege for role % on public.%; inventory role memberships before applying migration 273.',role_name,table_name;
      end if;
    end loop;

    if not pg_catalog.has_table_privilege('authenticated',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'INSERT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'UPDATE')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    then
      raise exception 'Authority/evidence hardening did not preserve intended authenticated reads and service writes on public.%.',table_name;
    end if;
  end loop;
end;
$assert_authority_evidence_browser_read_only$;

comment on table public.approvals is
  'Tenant-readable approval state. All creation and decisions use permission-checked privileged server workflows.';
comment on table public.capability_execution_audits is
  'Tenant-readable execution evidence. All mutations are written by privileged Ferocity runtimes.';
