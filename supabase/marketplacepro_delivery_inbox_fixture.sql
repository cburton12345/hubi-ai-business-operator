-- Local/synthetic verification fixture for migration 269.
-- Run only against a disposable local Supabase/Postgres database after all
-- migrations are applied. Every data change is rolled back.
\set ON_ERROR_STOP on

begin;

do $fixture_preflight$
begin
  if to_regclass('public.marketplacepro_delivery_inbox') is null then
    raise exception 'migration 269 is not applied in this local database';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'marketplacepro_delivery_inbox'
      and c.relrowsecurity
  ) then
    raise exception 'marketplacepro_delivery_inbox RLS is not enabled';
  end if;
  if to_regclass('public.marketplacepro_owner_pilot_enrollments') is null then
    raise exception 'owner-pilot enrollment table is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'marketplacepro_owner_pilot_enrollments'
      and c.relrowsecurity
  ) then
    raise exception 'owner-pilot enrollment RLS is not enabled';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('marketplacepro_delivery_inbox', 'marketplacepro_owner_pilot_enrollments')
  ) then
    raise exception 'server-only MarketplacePro tables must not expose browser RLS policies';
  end if;
  if has_table_privilege('authenticated', 'public.marketplacepro_delivery_inbox', 'select')
     or has_table_privilege('anon', 'public.marketplacepro_delivery_inbox', 'select') then
    raise exception 'delivery inbox must remain outside browser Data API roles';
  end if;
  if not has_table_privilege('service_role', 'public.marketplacepro_delivery_inbox', 'select,insert,update,delete') then
    raise exception 'service_role delivery inbox privileges are incomplete';
  end if;
  if not has_table_privilege('service_role', 'public.marketplacepro_owner_pilot_enrollments', 'select,insert,update,delete') then
    raise exception 'service_role enrollment privileges are incomplete';
  end if;
end;
$fixture_preflight$;

insert into public.users (id, auth_user_id, email, name)
values
  ('26900000-0000-4000-8000-000000000001', '26900000-0000-4000-8000-000000000101', 'mpp-fixture-owner-a@example.invalid', 'MPP Fixture Owner A'),
  ('26900000-0000-4000-8000-000000000002', '26900000-0000-4000-8000-000000000102', 'mpp-fixture-owner-b@example.invalid', 'MPP Fixture Owner B');

insert into public.tenants (id, name, slug, owner_user_id)
values
  ('26900000-0000-4000-8000-000000000011', 'MPP Fixture Tenant A', 'mpp-fixture-tenant-a', '26900000-0000-4000-8000-000000000001'),
  ('26900000-0000-4000-8000-000000000012', 'MPP Fixture Tenant B', 'mpp-fixture-tenant-b', '26900000-0000-4000-8000-000000000002');

insert into public.tenant_users (tenant_id, user_id, role, status)
values
  ('26900000-0000-4000-8000-000000000011', '26900000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('26900000-0000-4000-8000-000000000012', '26900000-0000-4000-8000-000000000002', 'owner', 'active');

insert into public.brands (id, tenant_id, name, slug, business_model)
values
  ('26900000-0000-4000-8000-000000000021', '26900000-0000-4000-8000-000000000011', 'MPP Fixture Brand A', 'mpp-fixture-brand-a', 'marketplace'),
  ('26900000-0000-4000-8000-000000000022', '26900000-0000-4000-8000-000000000012', 'MPP Fixture Brand B', 'mpp-fixture-brand-b', 'marketplace');

insert into public.marketplacepro_connections (
  id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
)
values
  ('26900000-0000-4000-8000-000000000031', '26900000-0000-4000-8000-000000000011', '26900000-0000-4000-8000-000000000021', 'fixture-account-a', 'ferocity_connected', 'connected', 'ready'),
  ('26900000-0000-4000-8000-000000000032', '26900000-0000-4000-8000-000000000012', '26900000-0000-4000-8000-000000000022', 'fixture-account-b', 'ferocity_connected', 'revoked', 'paused'),
  ('26900000-0000-4000-8000-000000000033', '26900000-0000-4000-8000-000000000011', '26900000-0000-4000-8000-000000000021', 'fixture-account-c', 'ferocity_connected', 'connected', 'ready');

do $fixture_foreign_brand_boundary$
begin
  begin
    insert into public.marketplacepro_connections (
      id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
    ) values (
      '26900000-0000-4000-8000-000000000034',
      '26900000-0000-4000-8000-000000000011',
      '26900000-0000-4000-8000-000000000022',
      'fixture-foreign-brand-account', 'ferocity_connected', 'connected', 'ready'
    );
    raise exception 'cross-tenant MarketplacePro brand mapping unexpectedly inserted';
  exception
    when foreign_key_violation then null;
  end;
end;
$fixture_foreign_brand_boundary$;

insert into public.marketplacepro_owner_pilot_enrollments (
  connection_id, tenant_id, source_account_id, enabled, contract_version,
  credential_label, configured_by_user_id, configured_at
)
values
  ('26900000-0000-4000-8000-000000000031', '26900000-0000-4000-8000-000000000011', 'fixture-account-a', true, '2026-10-22.v1', 'fixture-signing-a', '26900000-0000-4000-8000-000000000001', now()),
  ('26900000-0000-4000-8000-000000000032', '26900000-0000-4000-8000-000000000012', 'fixture-account-b', true, '2026-10-22.v1', 'fixture-signing-b', '26900000-0000-4000-8000-000000000002', now());

insert into public.marketplacepro_delivery_inbox (
  tenant_id, connection_id, source_account_id, delivery_id, contract_version,
  delivery_kind, occurred_at, payload_digest, processing_status
)
values
  ('26900000-0000-4000-8000-000000000011', '26900000-0000-4000-8000-000000000031', 'fixture-account-a', 'fixture-shared-delivery', '2026-10-22.v1', 'event', now(), repeat('a', 64), 'processed'),
  ('26900000-0000-4000-8000-000000000012', '26900000-0000-4000-8000-000000000032', 'fixture-account-b', 'fixture-shared-delivery', '2026-10-22.v1', 'event', now(), repeat('b', 64), 'failed');

do $fixture_assertions$
begin
  if (select count(*) from public.marketplacepro_delivery_inbox where delivery_id = 'fixture-shared-delivery') <> 2 then
    raise exception 'the same delivery ID must remain isolated by connection';
  end if;
  begin
    insert into public.marketplacepro_owner_pilot_enrollments (
      connection_id, tenant_id, source_account_id, enabled, contract_version, credential_label, configured_at
    ) values (
      '26900000-0000-4000-8000-000000000033', '26900000-0000-4000-8000-000000000011',
      'fixture-account-c', true, '2026-10-22.v1', 'fixture-signing-c', now()
    );
    raise exception 'a second owner-pilot account unexpectedly enrolled for one tenant';
  exception
    when unique_violation then null;
  end;
  begin
    insert into public.marketplacepro_delivery_inbox (
      tenant_id, connection_id, source_account_id, delivery_id, contract_version,
      delivery_kind, occurred_at, payload_digest
    ) values (
      '26900000-0000-4000-8000-000000000011', '26900000-0000-4000-8000-000000000031',
      'fixture-account-a', 'fixture-shared-delivery', '2026-10-22.v1', 'event', now(), repeat('c', 64)
    );
    raise exception 'duplicate delivery unexpectedly inserted';
  exception
    when unique_violation then null;
  end;
end;
$fixture_assertions$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '26900000-0000-4000-8000-000000000101', true);

do $fixture_browser_boundary$
begin
  begin
    perform count(*) from public.marketplacepro_delivery_inbox;
    raise exception 'authenticated browser role unexpectedly read server-only inbox';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.marketplacepro_owner_pilot_enrollments;
    raise exception 'authenticated browser role unexpectedly read server-only enrollment';
  exception
    when insufficient_privilege then null;
  end;
end;
$fixture_browser_boundary$;

reset role;
rollback;
