-- Supabase stops applying legacy public-schema Data API grants to newly created
-- tables on 2026-10-30. This final baseline makes historical schema rebuilds,
-- preview branches, and local resets retain the RLS-defined access boundary.
-- Future table-creating migrations must still declare their own grants and
-- revocations; the release guard enforces that requirement for migration 250+.

do $data_api_access$
declare
  table_record record;
  permits_anon boolean;
  permits_authenticated boolean;
begin
  for table_record in
    select c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  loop
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_record.table_name
    );

    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_record.table_name
    );

    select exists (
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = table_record.table_name
        and p.roles && array['public', 'anon']::name[]
    ) into permits_anon;

    select exists (
      select 1
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = table_record.table_name
        and p.roles && array['public', 'authenticated']::name[]
    ) into permits_authenticated;

    if permits_anon then
      execute format(
        'grant select, insert, update, delete on table public.%I to anon',
        table_record.table_name
      );
    end if;

    if permits_authenticated then
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        table_record.table_name
      );
    end if;
  end loop;
end;
$data_api_access$;

comment on schema public is
  'Ferocity public schema. Data API table grants are explicit and RLS remains authoritative.';
