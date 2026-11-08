-- Consent, suppression, logical authority, external-AI credentials, and voice
-- route state are changed only by Ferocity's authenticated server workflows or
-- verified inbound provider handlers. Restore a read-only browser boundary
-- without changing the existing tenant visibility predicates or stored values.

do $validate_consent_authority_voice_policies$
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
      ('contact_consent_records','contact_consent_records_tenant_operator','ALL','tenant_operator'),
      ('contact_suppression_list','contact_suppression_list_tenant_operator','ALL','tenant_operator'),
      ('integration_authority_grants','integration_authority_grants_tenant_manage','ALL','tenant_admin'),
      ('external_ai_credentials','external_ai_credentials_tenant_admin','ALL','tenant_admin'),
      ('voice_provider_routes','voice_provider_routes_tenant_operator','ALL','tenant_admin_write')
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
      raise exception 'Consent/authority/voice hardening found a noncanonical policy identity, role, or command for public.%.%; inventory its consumer before applying migration 277.',expected.table_name,expected.policy_name;
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
    elsif expected.policy_shape='tenant_admin' then
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'']';
      expected_check:=expected_qual;
    else
      expected_qual:='has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']';
      expected_check:='has_tenant_roletenant_id,array[''owner'',''admin'']';
    end if;

    if normalized_qual<>expected_qual or normalized_check<>expected_check then
      raise exception 'Consent/authority/voice hardening found noncanonical USING/WITH CHECK semantics for public.%.%; inventory its consumer before applying migration 277.',expected.table_name,expected.policy_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename=any(array[
        'contact_consent_records','contact_suppression_list',
        'integration_authority_grants','external_ai_credentials','voice_provider_routes'
      ])
      and (p.tablename || ':' || p.policyname)<>all(array[
        'contact_consent_records:contact_consent_records_tenant_operator',
        'contact_suppression_list:contact_suppression_list_tenant_operator',
        'integration_authority_grants:integration_authority_grants_tenant_manage',
        'external_ai_credentials:external_ai_credentials_tenant_admin',
        'voice_provider_routes:voice_provider_routes_tenant_operator'
      ])
  ) then
    raise exception 'Consent/authority/voice hardening found an unreviewed RLS policy; inventory its consumer before applying migration 277.';
  end if;
end;
$validate_consent_authority_voice_policies$;

revoke insert,update,delete,truncate,references,trigger on table
  public.contact_consent_records,
  public.contact_suppression_list,
  public.integration_authority_grants,
  public.external_ai_credentials,
  public.voice_provider_routes
from public,anon,authenticated;

do $revoke_consent_authority_voice_column_writes$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array[
    'contact_consent_records','contact_suppression_list',
    'integration_authority_grants','external_ai_credentials','voice_provider_routes'
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
$revoke_consent_authority_voice_column_writes$;

grant select on table
  public.contact_consent_records,
  public.contact_suppression_list,
  public.integration_authority_grants,
  public.external_ai_credentials,
  public.voice_provider_routes
to authenticated;

grant select,insert,update,delete on table
  public.contact_consent_records,
  public.contact_suppression_list,
  public.integration_authority_grants,
  public.external_ai_credentials,
  public.voice_provider_routes
to service_role;

drop policy contact_consent_records_tenant_operator on public.contact_consent_records;
create policy contact_consent_records_tenant_operator on public.contact_consent_records
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy contact_suppression_list_tenant_operator on public.contact_suppression_list;
create policy contact_suppression_list_tenant_operator on public.contact_suppression_list
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy integration_authority_grants_tenant_manage on public.integration_authority_grants;
create policy integration_authority_grants_tenant_manage on public.integration_authority_grants
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy external_ai_credentials_tenant_admin on public.external_ai_credentials;
create policy external_ai_credentials_tenant_admin on public.external_ai_credentials
for select using (public.has_tenant_role(tenant_id,array['owner','admin']));

drop policy voice_provider_routes_tenant_operator on public.voice_provider_routes;
create policy voice_provider_routes_tenant_operator on public.voice_provider_routes
for select using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

do $assert_consent_authority_voice_browser_read_only$
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
        'contact_consent_records','contact_suppression_list',
        'integration_authority_grants','external_ai_credentials','voice_provider_routes'
      ])
      and p.cmd<>'SELECT'
  ) then
    raise exception 'Consent/authority/voice hardening left a browser mutation RLS policy.';
  end if;

  foreach table_name in array array[
    'contact_consent_records','contact_suppression_list',
    'integration_authority_grants','external_ai_credentials','voice_provider_routes'
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
        raise exception 'Consent/authority/voice hardening found inherited table mutation privilege for role % on public.%; inventory role memberships before applying migration 277.',role_name,table_name;
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
        raise exception 'Consent/authority/voice hardening found inherited column mutation privilege for role % on public.%; inventory role memberships before applying migration 277.',role_name,table_name;
      end if;
    end loop;

    if not pg_catalog.has_table_privilege('authenticated',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'SELECT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'INSERT')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'UPDATE')
      or not pg_catalog.has_table_privilege('service_role',relation_oid,'DELETE')
    then
      raise exception 'Consent/authority/voice hardening did not preserve tenant reads and trusted service writes on public.%.',table_name;
    end if;
  end loop;
end;
$assert_consent_authority_voice_browser_read_only$;

comment on table public.contact_consent_records is
  'Tenant-readable contact-consent evidence. Mutations use verified intake, provider, or permission-checked server workflows.';
comment on table public.contact_suppression_list is
  'Tenant-readable contact-suppression state. Mutations use trusted Ferocity server workflows.';
comment on table public.integration_authority_grants is
  'Tenant-readable logical authority receipts. Mutations use permission-checked server workflows and never derive authority from OAuth scope alone.';
comment on table public.external_ai_credentials is
  'Tenant-readable hashed external-AI credential metadata. Issuance, rotation, use evidence, and revocation are server controlled.';
comment on table public.voice_provider_routes is
  'Tenant-readable voice route readiness. Selection and activation use permission-checked server workflows and readiness gates.';
