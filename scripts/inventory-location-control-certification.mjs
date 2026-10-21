import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "260_inventory_location_control";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const split = line.indexOf("=");
    const key = line.slice(0, split).trim();
    if (!process.env[key]) process.env[key] = line.slice(split + 1).trim().replace(/^["']|["']$/g, "");
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));
invariant(process.env.DATABASE_URL, "DATABASE_URL is required.");
const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? "pre";
invariant(["pre", "post"].includes(phase), "Use --phase=pre or --phase=post.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  application_name: `ferocity_inventory_location_control_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const applied = migration.rowCount === 1;
  const dependencies = await client.query(
    `select
       to_regclass('public.service_inventory_items') is not null items,
       to_regclass('public.inventory_locations') is not null locations,
       to_regclass('public.inventory_transactions') is not null movements,
       to_regclass('public.inventory_reservations') is not null reservations,
       to_regclass('public.service_work_orders') is not null work_orders`,
  );
  for (const [name, exists] of Object.entries(dependencies.rows[0])) {
    invariant(exists, `Required inventory dependency is missing: ${name}`);
  }

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    const tables = await client.query(
      `select
         to_regclass('public.inventory_location_balances') is not null balances,
         to_regclass('public.inventory_stock_counts') is not null stock_counts,
         to_regclass('public.inventory_reservations_idempotency_unique') is not null reservation_idempotency,
         to_regclass('public.inventory_location_balances_lookup_idx') is not null balance_lookup`,
    );
    for (const [name, exists] of Object.entries(tables.rows[0])) {
      invariant(exists, `Required inventory-control object is missing: ${name}`);
    }
    const columns = ["location_id", "consumed_quantity", "released_quantity", "idempotency_key"];
    const shape = await client.query(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='inventory_reservations' and column_name=any($1::text[])`,
      [columns],
    );
    invariant(shape.rowCount === columns.length, `Inventory reservation schema is incomplete; found ${shape.rowCount}/${columns.length} required columns.`);
    const integrity = await client.query(
      `select
         (select count(*)::int from public.inventory_location_balances where quantity < 0) negative_balances,
         (select count(*)::int from public.inventory_reservations where consumed_quantity < 0 or released_quantity < 0 or consumed_quantity+released_quantity > quantity) invalid_reservations,
         (select count(*)::int from public.inventory_reservations where status in ('reserved','partially_consumed') and location_id is null) open_reservations_without_location,
         (select count(*)::int from public.inventory_stock_counts where adjustment_quantity <> observed_quantity-expected_quantity) invalid_counts,
         (select count(*)::int from (
           select tenant_id,idempotency_key from public.inventory_reservations where idempotency_key is not null group by tenant_id,idempotency_key having count(*)>1
         ) duplicates) duplicate_reservation_keys,
         (select count(*)::int from (
           select tenant_id,idempotency_key from public.inventory_stock_counts group by tenant_id,idempotency_key having count(*)>1
         ) duplicates) duplicate_count_keys`,
    );
    for (const [name, count] of Object.entries(integrity.rows[0])) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
    }
    const totals = await client.query(
      `select count(*)::int mismatched_item_totals
         from public.service_inventory_items i
         left join lateral (
           select coalesce(sum(b.quantity),0) total from public.inventory_location_balances b
           where b.tenant_id=i.tenant_id and b.inventory_item_id=i.id
         ) balances on true
        where i.quantity <> balances.total`,
    );
    invariant(totals.rows[0]?.mismatched_item_totals === 0, `Every item total must equal its location balances; found ${totals.rows[0]?.mismatched_item_totals} mismatches.`);
    const tenantIntegrity = await client.query(
      `select count(*)::int cross_tenant_links
         from public.inventory_location_balances b
         join public.service_inventory_items i on i.id=b.inventory_item_id
         join public.inventory_locations l on l.id=b.location_id
        where b.tenant_id<>i.tenant_id or b.tenant_id<>l.tenant_id`,
    );
    invariant(tenantIntegrity.rows[0]?.cross_tenant_links === 0, "Inventory balances must not cross tenant boundaries.");
  } else {
    const drift = await client.query(
      `select
         to_regclass('public.inventory_location_balances') is not null balances,
         to_regclass('public.inventory_stock_counts') is not null stock_counts,
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_reservations' and column_name='consumed_quantity') consumed_column`,
    );
    invariant(Object.values(drift.rows[0]).every((value) => value === false), "Inventory-control schema exists without tracked migration 260. Stop for schema-drift review.");
  }

  await client.query("rollback");
  console.log(`Inventory location-control certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
