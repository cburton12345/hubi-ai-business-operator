import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "261_inventory_cost_and_supplier_returns";

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
  application_name: `ferocity_inventory_cost_control_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const applied = migration.rowCount === 1;
  const dependencies = await client.query(
    `select
       to_regclass('public.purchase_order_receipts') is not null receipts,
       to_regclass('public.purchase_order_receipt_items') is not null receipt_items,
       to_regclass('public.purchase_orders') is not null purchase_orders,
       to_regclass('public.inventory_transactions') is not null movements,
       to_regclass('public.job_material_list_items') is not null job_materials,
       to_regclass('public.service_jobs') is not null jobs,
       to_regclass('public.customer_locations') is not null customer_locations`,
  );
  for (const [name, exists] of Object.entries(dependencies.rows[0])) invariant(exists, `Required inventory-cost dependency is missing: ${name}`);

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    const objects = await client.query(
      `select
         to_regclass('public.supplier_returns') is not null supplier_returns,
         to_regclass('public.supplier_return_items') is not null supplier_return_items,
         to_regclass('public.inventory_material_allocations') is not null allocations,
         to_regclass('public.supplier_returns_credit_idempotency_unique') is not null credit_idempotency,
         to_regclass('public.inventory_material_allocations_cancellation_unique') is not null cancellation_idempotency`,
    );
    for (const [name, exists] of Object.entries(objects.rows[0])) invariant(exists, `Required inventory-cost object is missing: ${name}`);
    const returnIntegrity = await client.query(
      `select
         count(*) filter (where sr.expected_credit_cents<>totals.extended_cost_cents)::int incorrect_expected_credit,
         count(*) filter (where sr.credit_status='confirmed' and (sr.confirmed_credit_cents is null or nullif(sr.vendor_credit_reference,'') is null or sr.credited_at is null))::int credits_without_evidence,
         count(*) filter (where sr.credit_status<>'confirmed' and sr.status='credited')::int false_credited_status
       from public.supplier_returns sr
       join lateral (select coalesce(sum(extended_cost_cents),0)::int extended_cost_cents from public.supplier_return_items where tenant_id=sr.tenant_id and supplier_return_id=sr.id) totals on true`,
    );
    for (const [name, count] of Object.entries(returnIntegrity.rows[0])) invariant(count === 0, `${name} must be zero; found ${count}.`);
    const receiptBounds = await client.query(
      `select count(*)::int over_returned_receipts from (
         select ri.tenant_id,ri.id,ri.quantity_received,coalesce(sum(sri.quantity) filter (where sr.status<>'canceled'),0) returned
           from public.purchase_order_receipt_items ri
           left join public.supplier_return_items sri on sri.tenant_id=ri.tenant_id and sri.receipt_item_id=ri.id
           left join public.supplier_returns sr on sr.tenant_id=sri.tenant_id and sr.id=sri.supplier_return_id
          group by ri.tenant_id,ri.id,ri.quantity_received
         having coalesce(sum(sri.quantity) filter (where sr.status<>'canceled'),0)>ri.quantity_received
       ) invalid`,
    );
    invariant(receiptBounds.rows[0]?.over_returned_receipts === 0, "Supplier returns must not exceed received quantity.");
    const movementIntegrity = await client.query(
      `select count(*)::int missing_or_incorrect_movements
         from public.supplier_returns sr
         join public.supplier_return_items sri on sri.tenant_id=sr.tenant_id and sri.supplier_return_id=sr.id
         left join public.inventory_transactions t on t.tenant_id=sr.tenant_id and t.supplier_return_id=sr.id
        where sr.status<>'canceled' and (
          t.id is null or t.transaction_type<>'return' or t.source<>'supplier_return' or
          t.inventory_item_id<>sri.inventory_item_id or t.quantity_delta<>sri.quantity*-1 or t.unit_cost_cents<>sri.unit_cost_cents
        )`,
    );
    invariant(movementIntegrity.rows[0]?.missing_or_incorrect_movements === 0, "Every supplier return must retain an exact inventory movement.");
    const allocationIntegrity = await client.query(
      `select count(*)::int invalid_allocations from (
         select t.tenant_id,t.id,abs(t.quantity_delta) source_quantity,round(abs(t.quantity_delta)*t.unit_cost_cents)::int source_cost,
                coalesce(sum(a.quantity) filter (where a.status='active'),0) allocated_quantity,
                coalesce(sum(a.cost_cents) filter (where a.status='active'),0)::int allocated_cost
           from public.inventory_transactions t
           join public.inventory_material_allocations a on a.tenant_id=t.tenant_id and a.source_transaction_id=t.id
          group by t.tenant_id,t.id,t.quantity_delta,t.unit_cost_cents,t.transaction_type,t.source
         having t.transaction_type<>'consume' or t.source<>'inventory_control' or t.quantity_delta>=0
            or coalesce(sum(a.quantity) filter (where a.status='active'),0)>abs(t.quantity_delta)
            or coalesce(sum(a.cost_cents) filter (where a.status='active'),0)>round(abs(t.quantity_delta)*t.unit_cost_cents)
       ) invalid`,
    );
    invariant(allocationIntegrity.rows[0]?.invalid_allocations === 0, "Material allocations must remain bounded by their source consumption.");
    const materialIntegrity = await client.query(
      `select count(*)::int mismatched_material_rows
         from public.inventory_material_allocations a
         left join public.job_material_list_items m on m.tenant_id=a.tenant_id and m.id=a.material_list_item_id
        where m.id is null or m.service_job_id is distinct from a.service_job_id or m.quantity<>a.quantity or m.actual_cost_cents<>a.cost_cents
          or (a.status='active' and m.status='cancelled') or (a.status='canceled' and m.status<>'cancelled')`,
    );
    invariant(materialIntegrity.rows[0]?.mismatched_material_rows === 0, "Allocation job-cost rows must match quantity, cost, target, and cancellation state.");
    const tenantIntegrity = await client.query(
      `select
         (select count(*)::int from public.supplier_return_items i join public.supplier_returns r on r.id=i.supplier_return_id where i.tenant_id<>r.tenant_id) return_links,
         (select count(*)::int from public.inventory_material_allocations a join public.inventory_transactions t on t.id=a.source_transaction_id where a.tenant_id<>t.tenant_id) movement_links,
         (select count(*)::int from public.inventory_material_allocations a join public.service_jobs j on j.id=a.service_job_id where a.service_job_id is not null and a.tenant_id<>j.tenant_id) job_links,
         (select count(*)::int from public.inventory_material_allocations a join public.customer_locations l on l.id=a.customer_location_id where a.customer_location_id is not null and a.tenant_id<>l.tenant_id) location_links`,
    );
    for (const [name, count] of Object.entries(tenantIntegrity.rows[0])) invariant(count === 0, `${name} cross-tenant links must be zero; found ${count}.`);
  } else {
    const drift = await client.query(
      `select
         to_regclass('public.supplier_returns') is not null supplier_returns,
         to_regclass('public.supplier_return_items') is not null supplier_return_items,
         to_regclass('public.inventory_material_allocations') is not null allocations,
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_transactions' and column_name='supplier_return_id') movement_column`,
    );
    invariant(Object.values(drift.rows[0]).every((value) => value === false), "Inventory-cost schema exists without tracked migration 261. Stop for schema-drift review.");
  }

  await client.query("rollback");
  console.log(`Inventory cost-control certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
