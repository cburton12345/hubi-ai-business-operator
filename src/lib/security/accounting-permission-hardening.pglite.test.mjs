import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Local PostgreSQL 18.6 compatibility coverage using @electric-sql/pglite 0.5.10.
// CI intentionally skips this suite unless the dependency is already available;
// set PGLITE_DIST_PATH to exercise it on another workstation without installing.
const suppliedPglitePath = "C:/Users/schem/Documents/Codex/2026-07-05/homes4rent-netlify-oauth-check-it-out/work/lease-tools/node_modules/@electric-sql/pglite/dist/index.js";
const pglitePath = process.env.PGLITE_DIST_PATH || suppliedPglitePath;
const hasPglite = fs.existsSync(pglitePath);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/270_accounting_browser_write_hardening.sql"),
  "utf8"
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

const tenantOne = "00000000-0000-0000-0000-000000000001";
const tenantTwo = "00000000-0000-0000-0000-000000000002";
const targetTables = [
  "usage_meter_events",
  "storage_usage_events",
  "storage_quota_policies",
  "billing_usage_charges",
  "usage_bundle_purchases",
  "usage_allowance_policies",
  "spend_limits"
];

async function installCanonicalFixture(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;

    create function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
    returns boolean language sql stable as $$
      select p_tenant_id::text = current_setting('app.tenant_id', true)
        and current_setting('app.tenant_role', true) = any(p_roles)
    $$;

    create table public.usage_meter_events (
      id text primary key,
      tenant_id uuid not null,
      status text not null default 'unbilled',
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.storage_usage_events (
      id text primary key,
      tenant_id uuid not null,
      status text not null default 'reserved',
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.storage_quota_policies (
      id text primary key,
      tenant_id uuid not null,
      max_bytes bigint not null default 1000,
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.billing_usage_charges (
      id text primary key,
      tenant_id uuid not null,
      status text not null default 'pending_review',
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.usage_bundle_purchases (
      id text primary key,
      tenant_id uuid not null,
      status text not null default 'active',
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.usage_allowance_policies (
      id text primary key,
      tenant_id uuid,
      plan_key text,
      metadata_json jsonb not null default '{}'::jsonb
    );
    create table public.spend_limits (
      id text primary key,
      tenant_id uuid,
      scope_type text not null default 'tenant',
      scope_key text,
      monthly_customer_charge_cap_cents numeric,
      metadata_json jsonb not null default '{}'::jsonb
    );

    alter table public.usage_meter_events enable row level security;
    alter table public.storage_usage_events enable row level security;
    alter table public.storage_quota_policies enable row level security;
    alter table public.billing_usage_charges enable row level security;
    alter table public.usage_bundle_purchases enable row level security;
    alter table public.usage_allowance_policies enable row level security;
    alter table public.spend_limits enable row level security;

    create policy usage_meter_events_tenant_operator on public.usage_meter_events for all
      using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
    create policy storage_usage_events_tenant_operator on public.storage_usage_events for all
      using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
    create policy storage_quota_policies_tenant_operator on public.storage_quota_policies for all
      using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
    create policy billing_usage_charges_tenant_admin on public.billing_usage_charges for all
      using (public.has_tenant_role(tenant_id, array['owner','admin']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin']));
    create policy usage_bundle_purchases_tenant_operator on public.usage_bundle_purchases for all
      using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
    create policy usage_allowance_policies_tenant_operator on public.usage_allowance_policies for all
      using (tenant_id is null or public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner','admin']));
    create policy spend_limits_tenant_operator on public.spend_limits for all
      using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

    grant select, insert, update, delete on table
      public.usage_meter_events, public.storage_usage_events,
      public.storage_quota_policies, public.billing_usage_charges,
      public.usage_bundle_purchases, public.usage_allowance_policies,
      public.spend_limits to anon, authenticated;
    grant insert, update, delete, truncate, references, trigger on public.usage_meter_events to public;
    grant update (metadata_json) on public.usage_meter_events to public, anon, authenticated;
    grant truncate, references, trigger on public.usage_meter_events to anon, authenticated;

    create function public.reserve_storage_usage(
      p_tenant_id uuid, p_bucket text, p_storage_key text, p_source_type text,
      p_source_id text, p_byte_count bigint, p_idempotency_key text,
      p_metadata_json jsonb default '{}'::jsonb
    ) returns uuid language plpgsql security definer set search_path = public as $$
    begin
      insert into public.storage_usage_events (id, tenant_id, status, metadata_json)
      values (p_idempotency_key, p_tenant_id, 'reserved', p_metadata_json);
      return p_tenant_id;
    end;
    $$;

    insert into public.usage_meter_events values
      ('usage-own', '${tenantOne}', 'unbilled', '{}'),
      ('usage-foreign', '${tenantTwo}', 'unbilled', '{}');
    insert into public.storage_usage_events values
      ('storage-own', '${tenantOne}', 'active', '{}'),
      ('storage-foreign', '${tenantTwo}', 'active', '{}');
    insert into public.storage_quota_policies values
      ('quota-own', '${tenantOne}', 1000, '{}'),
      ('quota-foreign', '${tenantTwo}', 1000, '{}');
    insert into public.billing_usage_charges values
      ('charge-own', '${tenantOne}', 'pending_review', '{}'),
      ('charge-foreign', '${tenantTwo}', 'pending_review', '{}');
    insert into public.usage_bundle_purchases values
      ('bundle-own', '${tenantOne}', 'active', '{}'),
      ('bundle-foreign', '${tenantTwo}', 'active', '{}');
    insert into public.usage_allowance_policies values
      ('price-global', null, 'starter', '{}'),
      ('price-own', '${tenantOne}', null, '{}'),
      ('price-foreign', '${tenantTwo}', null, '{}');
    insert into public.spend_limits values
      ('limit-own', '${tenantOne}', 'feature', 'ai_receptionist', null, '{}'),
      ('limit-foreign', '${tenantTwo}', 'feature', 'ai_receptionist', null, '{}');
  `);
}

async function setBrowserContext(db, role, tenantRole = "") {
  await db.exec(`set role ${role}; set app.tenant_id = '${tenantOne}'; set app.tenant_role = '${tenantRole}';`);
}

async function resetRole(db) {
  await db.exec("reset role");
}

async function applyMigration(db) {
  try {
    await db.exec(`begin; ${migration}; commit;`);
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

async function expectCanonicalFixtureIntact(db) {
  const evidence = await db.query(`select
    (select count(*)::int from pg_catalog.pg_policies
      where schemaname='public' and cmd='ALL'
        and tablename=any(array['usage_meter_events','storage_usage_events','storage_quota_policies','billing_usage_charges','usage_bundle_purchases','usage_allowance_policies','spend_limits'])) policy_count,
    has_table_privilege('anon','public.usage_meter_events','insert') anon_insert,
    has_function_privilege('anon','public.reserve_storage_usage(uuid,text,text,text,text,bigint,text,jsonb)','execute') anon_rpc,
    (select count(*)::int from public.usage_meter_events) usage_rows`);
  expect(evidence.rows[0]).toEqual({ policy_count: 7, anon_insert: true, anon_rpc: true, usage_rows: 2 });
}

describe.runIf(hasPglite)("migration 270 accounting role boundary (PGlite 0.5.10 / PostgreSQL 18.6)", () => {
  it("keeps anonymous global pricing reads but removes every browser mutation privilege", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await applyMigration(db);
    await setBrowserContext(db, "anon");

    const visible = await db.query("select id from public.usage_allowance_policies order by id");
    expect(visible.rows).toEqual([{ id: "price-global" }]);

    for (const role of ["anon", "authenticated"]) {
      for (const table of targetTables) {
        const privileges = await db.query(
          `select
            has_table_privilege('${role}', 'public.${table}', 'insert') as insert_allowed,
            has_table_privilege('${role}', 'public.${table}', 'update') as update_allowed,
            has_table_privilege('${role}', 'public.${table}', 'delete') as delete_allowed,
            has_table_privilege('${role}', 'public.${table}', 'truncate') as truncate_allowed,
            has_table_privilege('${role}', 'public.${table}', 'references') as references_allowed,
            has_table_privilege('${role}', 'public.${table}', 'trigger') as trigger_allowed`
        );
        expect(privileges.rows[0]).toEqual({
          insert_allowed: false,
          update_allowed: false,
          delete_allowed: false,
          truncate_allowed: false,
          references_allowed: false,
          trigger_allowed: false
        });
      }
    }
    await expect(db.exec("delete from public.usage_allowance_policies where id='price-global'"))
      .rejects.toThrow(/permission denied/i);

    await resetRole(db);
    const publicAcl = await db.query(`select count(*)::int as count
      from information_schema.table_privileges
      where table_schema='public' and grantee='PUBLIC'
        and table_name=any(array['usage_meter_events','storage_usage_events','storage_quota_policies','billing_usage_charges','usage_bundle_purchases','usage_allowance_policies','spend_limits'])
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')`);
    expect(publicAcl.rows[0].count).toBe(0);
    const columnAcl = await db.query(`select count(*)::int as count
      from information_schema.column_privileges
      where table_schema='public' and grantee in ('PUBLIC','anon','authenticated')
        and table_name=any(array['usage_meter_events','storage_usage_events','storage_quota_policies','billing_usage_charges','usage_bundle_purchases','usage_allowance_policies','spend_limits'])
        and privilege_type in ('INSERT','UPDATE','REFERENCES')`);
    expect(columnAcl.rows[0].count).toBe(0);
    const rpcAcl = await db.query(`select p.oid::regprocedure::text as signature,
        has_function_privilege('anon',p.oid,'execute') anon_execute,
        has_function_privilege('authenticated',p.oid,'execute') authenticated_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='reserve_storage_usage'`);
    expect(rpcAcl.rows).toEqual([{
      signature: "reserve_storage_usage(uuid,text,text,text,text,bigint,text,jsonb)",
      anon_execute: false,
      authenticated_execute: false
    }]);
  });

  it("preserves role-scoped own-tenant reads and denies foreign-tenant rows", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await applyMigration(db);

    for (const tenantRole of ["owner", "admin", "operator"]) {
      await setBrowserContext(db, "authenticated", tenantRole);
      const usage = await db.query("select id from public.usage_meter_events order by id");
      const storage = await db.query("select id from public.storage_usage_events order by id");
      const quotas = await db.query("select id from public.storage_quota_policies order by id");
      const bundles = await db.query("select id from public.usage_bundle_purchases order by id");
      const policies = await db.query("select id from public.usage_allowance_policies order by id");
      const limits = await db.query("select id from public.spend_limits order by id");
      expect(usage.rows).toEqual([{ id: "usage-own" }]);
      expect(storage.rows).toEqual([{ id: "storage-own" }]);
      expect(quotas.rows).toEqual([{ id: "quota-own" }]);
      expect(bundles.rows).toEqual([{ id: "bundle-own" }]);
      expect(policies.rows).toEqual([{ id: "price-global" }, { id: "price-own" }]);
      expect(limits.rows).toEqual([{ id: "limit-own" }]);

      const charges = await db.query("select id from public.billing_usage_charges order by id");
      expect(charges.rows).toEqual(tenantRole === "operator" ? [] : [{ id: "charge-own" }]);
      await expect(db.exec("update public.spend_limits set monthly_customer_charge_cap_cents=100"))
        .rejects.toThrow(/permission denied/i);
      await resetRole(db);
    }

    await setBrowserContext(db, "authenticated", "owner");
    const insertStatements = {
      usage_meter_events: `insert into public.usage_meter_events(id,tenant_id) values ('blocked-usage','${tenantOne}')`,
      storage_usage_events: `insert into public.storage_usage_events(id,tenant_id) values ('blocked-storage','${tenantOne}')`,
      storage_quota_policies: `insert into public.storage_quota_policies(id,tenant_id) values ('blocked-quota','${tenantOne}')`,
      billing_usage_charges: `insert into public.billing_usage_charges(id,tenant_id) values ('blocked-charge','${tenantOne}')`,
      usage_bundle_purchases: `insert into public.usage_bundle_purchases(id,tenant_id) values ('blocked-bundle','${tenantOne}')`,
      usage_allowance_policies: "insert into public.usage_allowance_policies(id,tenant_id) values ('blocked-policy',null)",
      spend_limits: `insert into public.spend_limits(id,tenant_id) values ('blocked-limit','${tenantOne}')`
    };
    for (const table of targetTables) {
      await expect(db.exec(insertStatements[table])).rejects.toThrow(/permission denied/i);
      await expect(db.exec(`update public.${table} set metadata_json='{}'::jsonb`)).rejects.toThrow(/permission denied/i);
      await expect(db.exec(`delete from public.${table}`)).rejects.toThrow(/permission denied/i);
      await expect(db.exec(`truncate table public.${table}`)).rejects.toThrow(/permission denied/i);
    }
  });

  it("preserves privileged usage, storage, charge, bundle, policy, and constrained customer-action paths", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await applyMigration(db);
    await db.exec("set role service_role");

    await db.exec(`
      insert into public.usage_meter_events values ('usage-server', '${tenantOne}', 'unbilled', '{}');
      update public.usage_meter_events set status='approved' where id='usage-server';
      select public.reserve_storage_usage('${tenantOne}', 'documents', 'key', 'test', null, 1, 'storage-server', '{}');
      insert into public.billing_usage_charges values ('charge-server', '${tenantOne}', 'pending_review', '{}');
      update public.billing_usage_charges set status='approved' where id='charge-server' and status='pending_review';
      insert into public.usage_bundle_purchases values ('bundle-server', '${tenantOne}', 'active', '{}');
      insert into public.usage_allowance_policies values ('policy-server', null, 'growth', '{}');
      insert into public.storage_quota_policies values ('quota-server', '${tenantTwo}', 2000, '{}');
      update public.storage_quota_policies set max_bytes=3000 where id='quota-server';
      update public.spend_limits set monthly_customer_charge_cap_cents=5000 where id='limit-own';
    `);

    const evidence = await db.query(`select
      (select status from public.usage_meter_events where id='usage-server') usage_status,
      (select status from public.storage_usage_events where id='storage-server') storage_status,
      (select status from public.billing_usage_charges where id='charge-server') charge_status,
      (select count(*)::int from public.usage_bundle_purchases where id='bundle-server') bundle_count,
      (select count(*)::int from public.usage_allowance_policies where id='policy-server') policy_count,
      (select max_bytes::int from public.storage_quota_policies where id='quota-server') quota_bytes,
      (select monthly_customer_charge_cap_cents::int from public.spend_limits where id='limit-own') customer_cap`);
    expect(evidence.rows[0]).toEqual({
      usage_status: "approved",
      storage_status: "reserved",
      charge_status: "approved",
      bundle_count: 1,
      policy_count: 1,
      quota_bytes: 3000,
      customer_cap: 5000
    });
  });

  it("fails closed when an unknown inherited writer role needs inventory", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await db.exec(`
      create role legacy_accounting_writer;
      grant insert on public.usage_meter_events to legacy_accounting_writer;
      grant legacy_accounting_writer to anon;
    `);
    await expect(applyMigration(db)).rejects.toThrow(/inventory role memberships/i);
    await expectCanonicalFixtureIntact(db);
  });

  it("fails closed when a browser role inherits the server-only storage writer", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await db.exec(`
      create role legacy_storage_rpc_executor;
      grant execute on function public.reserve_storage_usage(uuid, text, text, text, text, bigint, text, jsonb)
        to legacy_storage_rpc_executor;
      grant legacy_storage_rpc_executor to authenticated;
    `);
    await expect(applyMigration(db)).rejects.toThrow(/storage reservation execute privilege/i);
    await expectCanonicalFixtureIntact(db);
  });

  it("fails before DDL when an unknown storage reservation overload exists", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await db.exec(`create function public.reserve_storage_usage(
      p_tenant_id uuid, p_bucket text, p_storage_key text, p_source_type text,
      p_source_id text, p_byte_count bigint, p_idempotency_key text,
      p_metadata_json jsonb, p_unknown_mode boolean
    ) returns uuid language sql as $$ select p_tenant_id $$;`);
    await expect(applyMigration(db)).rejects.toThrow(/unknown reserve_storage_usage overload/i);
    await expectCanonicalFixtureIntact(db);
    const overloads = await db.query(`select count(*)::int as count from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='reserve_storage_usage'`);
    expect(overloads.rows[0].count).toBe(2);
  });

  it("fails closed when an unknown mutation policy needs consumer inventory", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await db.exec(`
      create policy custom_usage_writer on public.usage_meter_events
      for insert to authenticated with check (true);
    `);
    await expect(applyMigration(db)).rejects.toThrow(/unreviewed mutation RLS policy/i);
    await expectCanonicalFixtureIntact(db);
    const customPolicy = await db.query("select count(*)::int as count from pg_catalog.pg_policies where policyname='custom_usage_writer'");
    expect(customPolicy.rows[0].count).toBe(1);
  });

  it("fails before DDL when a known policy name has changed semantics", async () => {
    const db = await createDatabase();
    await installCanonicalFixture(db);
    await db.exec(`
      drop policy usage_meter_events_tenant_operator on public.usage_meter_events;
      create policy usage_meter_events_tenant_operator on public.usage_meter_events
        for all using (true) with check (true);
    `);
    await expect(applyMigration(db)).rejects.toThrow(/noncanonical USING\/WITH CHECK semantics/i);
    const evidence = await db.query(`select qual,with_check from pg_catalog.pg_policies
      where schemaname='public' and tablename='usage_meter_events'
        and policyname='usage_meter_events_tenant_operator'`);
    expect(evidence.rows).toEqual([{ qual: "true", with_check: "true" }]);
    expect((await db.query("select count(*)::int as count from public.usage_meter_events")).rows[0].count).toBe(2);
    expect((await db.query("select has_table_privilege('anon','public.usage_meter_events','insert') allowed")).rows[0].allowed).toBe(true);
  });
});

describe("accounting customer-action source contracts", () => {
  it("keeps charge approval, void, and optional voice cap behind billing:manage and tenant constraints", () => {
    const actions = fs.readFileSync(path.join(process.cwd(), "src/app/app/billing/actions.ts"), "utf8");
    expect(actions.match(/requirePermission\("billing:manage"\)/g)).toHaveLength(3);
    expect(actions).toContain("where tenant_id = $1 and id = $2 and status = 'pending_review'");
    expect(actions).toContain("where tenant_id = $1 and id = $2 and status in ('pending_review','approved','failed')");
    expect(actions).toContain("monthly_customer_charge_cap_cents = excluded.monthly_customer_charge_cap_cents");
    expect(actions).toContain("where t.id = $1");
  });

  it("keeps target-table writes on privileged server query paths rather than browser clients", () => {
    const serverSources = [
      "src/lib/usage/managed-voice.ts",
      "src/lib/usage/storage-quota.ts",
      "src/app/app/billing/actions.ts",
      "src/app/api/billing/usage/sync/route.ts",
      "src/lib/billing/sync-matured-usage-charges.ts",
      "src/lib/ferocity-connect/pairing.ts"
    ].map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
    expect(serverSources).toContain("queryPostgres");
    expect(serverSources).toContain("withPostgresTransaction");
    expect(serverSources).not.toContain("createBrowserClient");
  });
});

