import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Local PostgreSQL-compatible schema coverage using an already-installed
// PGlite runtime. CI skips this suite when that optional runtime is absent.
const suppliedPglitePath = "C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/work/lease-tools/node_modules/@electric-sql/pglite/dist/index.js";
const pglitePath = process.env.PGLITE_DIST_PATH || suppliedPglitePath;
const hasPglite = fs.existsSync(pglitePath);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/269_marketplacepro_delivery_inbox.sql"),
  "utf8",
);

let openDatabase;

afterEach(async () => {
  if (openDatabase) await openDatabase.close();
  openDatabase = undefined;
});

async function createDatabase() {
  const { PGlite } = await import(pathToFileURL(pglitePath).href);
  openDatabase = new PGlite();
  return openDatabase;
}

async function installBaseSchema(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;

    create table public.users (id uuid primary key);
    create table public.tenants (id uuid primary key);
    create table public.brands (
      id uuid primary key,
      tenant_id uuid not null references public.tenants(id) on delete cascade
    );
    create table public.marketplacepro_connections (
      id uuid primary key,
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      brand_id uuid references public.brands(id) on delete cascade,
      marketplace_account_id text,
      profile_mode text not null default 'lightweight'
        check (profile_mode in ('lightweight', 'ferocity_connected')),
      connection_status text not null default 'not_connected',
      sync_status text not null default 'paused'
        check (sync_status in ('paused', 'ready', 'error'))
    );
    alter table public.marketplacepro_connections
      add constraint marketplacepro_connections_connection_status_check
      check (connection_status in ('not_connected', 'connected', 'needs_attention', 'sync_paused'));

    insert into public.tenants values
      ('26900000-0000-4000-8000-000000000011'),
      ('26900000-0000-4000-8000-000000000012');
    insert into public.brands values
      ('26900000-0000-4000-8000-000000000021', '26900000-0000-4000-8000-000000000011'),
      ('26900000-0000-4000-8000-000000000022', '26900000-0000-4000-8000-000000000012');
  `);
}

async function applyMigration(db) {
  try {
    await db.exec(`begin; ${migration}; commit;`);
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

describe.runIf(hasPglite)("MarketplacePro migration 269 identity and role boundary", () => {
  it("enforces same-tenant brands, one pilot account per tenant, and server-only tables", async () => {
    const db = await createDatabase();
    await installBaseSchema(db);
    await applyMigration(db);

    await db.exec(`
      insert into public.marketplacepro_connections (
        id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
      ) values (
        '26900000-0000-4000-8000-000000000031',
        '26900000-0000-4000-8000-000000000011',
        '26900000-0000-4000-8000-000000000021',
        'fixture-account-a', 'ferocity_connected', 'connected', 'ready'
      );
      insert into public.marketplacepro_owner_pilot_enrollments (
        connection_id, tenant_id, source_account_id, enabled,
        contract_version, credential_label, configured_at
      ) values (
        '26900000-0000-4000-8000-000000000031',
        '26900000-0000-4000-8000-000000000011',
        'fixture-account-a', true, '2026-10-22.v1', 'fixture-secret', now()
      );
    `);

    await expect(db.exec(`insert into public.marketplacepro_connections (
      id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
    ) values (
      '26900000-0000-4000-8000-000000000032',
      '26900000-0000-4000-8000-000000000011',
      '26900000-0000-4000-8000-000000000022',
      'fixture-foreign-brand', 'ferocity_connected', 'connected', 'ready'
    )`)).rejects.toThrow(/marketplacepro_connections_brand_tenant_fk|foreign key/i);

    await db.exec(`insert into public.marketplacepro_connections (
      id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
    ) values (
      '26900000-0000-4000-8000-000000000033',
      '26900000-0000-4000-8000-000000000011',
      '26900000-0000-4000-8000-000000000021',
      'fixture-account-b', 'ferocity_connected', 'connected', 'ready'
    )`);
    await expect(db.exec(`insert into public.marketplacepro_owner_pilot_enrollments (
      connection_id, tenant_id, source_account_id, enabled,
      contract_version, credential_label, configured_at
    ) values (
      '26900000-0000-4000-8000-000000000033',
      '26900000-0000-4000-8000-000000000011',
      'fixture-account-b', true, '2026-10-22.v1', 'fixture-secret-b', now()
    )`)).rejects.toThrow(/unique|duplicate/i);

    const evidence = await db.query(`select
      (select convalidated from pg_catalog.pg_constraint
        where conname='marketplacepro_connections_brand_tenant_fk') brand_constraint_validated,
      (select relrowsecurity from pg_catalog.pg_class
        where oid='public.marketplacepro_delivery_inbox'::regclass) inbox_rls,
      (select count(*)::int from pg_catalog.pg_policies
        where schemaname='public' and tablename in (
          'marketplacepro_delivery_inbox','marketplacepro_owner_pilot_enrollments'
        )) browser_policy_count,
      has_table_privilege('authenticated','public.marketplacepro_delivery_inbox','select') browser_inbox_read,
      has_table_privilege('service_role','public.marketplacepro_delivery_inbox','select,insert,update,delete') service_inbox_access`);
    expect(evidence.rows[0]).toEqual({
      brand_constraint_validated: true,
      inbox_rls: true,
      browser_policy_count: 0,
      browser_inbox_read: false,
      service_inbox_access: true,
    });
  });

  it("blocks migration application when an existing connection owns a foreign tenant brand", async () => {
    const db = await createDatabase();
    await installBaseSchema(db);
    await db.exec(`insert into public.marketplacepro_connections (
      id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
    ) values (
      '26900000-0000-4000-8000-000000000034',
      '26900000-0000-4000-8000-000000000011',
      '26900000-0000-4000-8000-000000000022',
      'fixture-existing-foreign-brand', 'ferocity_connected', 'connected', 'ready'
    )`);

    await expect(applyMigration(db)).rejects.toThrow(/references a brand owned by another tenant/i);
    const unapplied = await db.query(
      "select to_regclass('public.marketplacepro_delivery_inbox') is null as inbox_absent",
    );
    expect(unapplied.rows[0]).toEqual({ inbox_absent: true });
  });
});
