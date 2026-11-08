-- Voice admission pricing must be captured by Ferocity's server, not accepted
-- from provider-echoed metadata or a browser-writable call row.

do $validate_receptionist_calls_policy$
declare
  policy_row record;
  normalized_qual text;
  normalized_check text;
begin
  select p.* into policy_row
  from pg_catalog.pg_policies p
  where p.schemaname='public'
    and p.tablename='receptionist_calls'
    and p.policyname='receptionist_calls_tenant_operator';

  normalized_qual := regexp_replace(
    replace(replace(lower(coalesce(policy_row.qual,'')), '::text', ''), 'public.', ''),
    '[[:space:]()]', '', 'g'
  );
  normalized_check := regexp_replace(
    replace(replace(lower(coalesce(policy_row.with_check,'')), '::text', ''), 'public.', ''),
    '[[:space:]()]', '', 'g'
  );

  if policy_row.policyname is null
    or policy_row.cmd <> 'ALL'
    or policy_row.permissive <> 'PERMISSIVE'
    or policy_row.roles <> array['public']::name[]
    or normalized_qual <> 'has_tenant_roletenant_id,array[''owner'',''admin'',''operator'']'
    or normalized_check <> normalized_qual
  then
    raise exception 'Voice admission hardening found a noncanonical receptionist_calls policy; inventory its consumer before applying migration 272.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public' and p.tablename='receptionist_calls'
      and p.cmd <> 'SELECT'
      and p.policyname <> 'receptionist_calls_tenant_operator'
  ) then
    raise exception 'Voice admission hardening found an unreviewed receptionist_calls mutation policy; inventory its consumer before applying migration 272.';
  end if;
end;
$validate_receptionist_calls_policy$;

alter table public.receptionist_calls
  add column if not exists admission_pricing_snapshot_json jsonb;

revoke insert, update, delete, truncate, references, trigger
on table public.receptionist_calls
from public, anon, authenticated;

do $revoke_receptionist_call_column_writes$
declare
  column_list text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into column_list
  from pg_catalog.pg_attribute a
  where a.attrelid='public.receptionist_calls'::regclass
    and a.attnum > 0 and not a.attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.receptionist_calls from public, anon, authenticated',
    column_list
  );
end;
$revoke_receptionist_call_column_writes$;

grant select, insert, update, delete on table public.receptionist_calls to service_role;

drop policy receptionist_calls_tenant_operator on public.receptionist_calls;
create policy receptionist_calls_tenant_operator
on public.receptionist_calls
for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

do $assert_receptionist_calls_server_writes$
declare
  role_name text;
  has_column_write boolean;
begin
  foreach role_name in array array['anon','authenticated'] loop
    select exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid='public.receptionist_calls'::regclass
        and a.attnum > 0 and not a.attisdropped
        and (
          pg_catalog.has_column_privilege(role_name,a.attrelid,a.attnum,'INSERT')
          or pg_catalog.has_column_privilege(role_name,a.attrelid,a.attnum,'UPDATE')
          or pg_catalog.has_column_privilege(role_name,a.attrelid,a.attnum,'REFERENCES')
        )
    ) into has_column_write;
    if pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','INSERT')
      or pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','UPDATE')
      or pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','DELETE')
      or pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','TRUNCATE')
      or pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','REFERENCES')
      or pg_catalog.has_table_privilege(role_name,'public.receptionist_calls','TRIGGER')
      or has_column_write
    then
      raise exception 'Voice admission hardening found inherited browser mutation privilege for role %; inventory role memberships before applying migration 272.', role_name;
    end if;
  end loop;
end;
$assert_receptionist_calls_server_writes$;

comment on column public.receptionist_calls.admission_pricing_snapshot_json is
  'Server-captured managed-voice pricing evidence at provider admission. Provider webhook metadata is never authoritative for this field.';
