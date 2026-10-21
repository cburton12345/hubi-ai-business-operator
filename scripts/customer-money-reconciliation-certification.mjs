import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "257_customer_money_reconciliation";

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
  application_name: `ferocity_customer_money_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const applied = migration.rowCount === 1;
  const dependencies = await client.query(
    `select to_regclass('public.service_invoices') is not null as service_invoices,
            to_regclass('public.service_invoice_payments') is not null as service_invoice_payments,
            to_regclass('public.payment_refunds') is not null as payment_refunds,
            to_regclass('public.payment_disputes') is not null as payment_disputes,
            to_regclass('public.service_ledger_entries') is not null as service_ledger_entries`,
  );
  for (const [name, exists] of Object.entries(dependencies.rows[0])) {
    invariant(exists, `Required dependency is missing: ${name}`);
  }

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    const shape = await client.query(
      `select
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='payment_refunds' and column_name='idempotency_key') idempotency_column,
        to_regclass('public.payment_refunds_idempotency_unique') is not null idempotency_index,
        to_regclass('public.payment_refunds_provider_identity_unique') is not null refund_provider_index,
        to_regclass('public.payment_disputes_provider_identity_unique') is not null dispute_provider_index`,
    );
    for (const [name, exists] of Object.entries(shape.rows[0])) {
      invariant(exists, `Required reconciliation schema is missing: ${name}`);
    }

    const integrity = await client.query(
      `with refund_totals as (
         select tenant_id,payment_id,sum(amount_cents) filter (where status='succeeded')::bigint amount_cents
         from public.payment_refunds group by tenant_id,payment_id
       ), payment_integrity as (
         select p.id,p.amount_cents,p.refunded_amount_cents,coalesce(r.amount_cents,0) refund_rows
         from public.service_invoice_payments p
         left join refund_totals r on r.tenant_id=p.tenant_id and r.payment_id=p.id
       )
       select
         (select count(*) from public.payment_refunds where idempotency_key is null)::int refunds_without_idempotency,
         (select count(*) from payment_integrity where refund_rows>amount_cents)::int refunds_over_payment,
         (select count(*) from payment_integrity where refunded_amount_cents<>least(amount_cents,refund_rows))::int payment_refund_mismatches,
         (select count(*) from public.payment_disputes where provider_dispute_id is not null and payment_id is null)::int unbound_provider_disputes,
         (select count(*) from public.service_invoices where write_off_cents>greatest(total_cents-amount_paid_cents,0))::int excessive_write_offs,
         (select count(*) from pg_constraint where conrelid='public.service_invoices'::regclass
           and contype='c' and pg_get_constraintdef(oid) like '%written_off%')::int written_off_status_constraints`,
    );
    invariant(integrity.rows[0]?.written_off_status_constraints === 1, "Invoice status constraint must include written_off exactly once.");
    for (const [name, count] of Object.entries(integrity.rows[0]).filter(([name]) => name !== "written_off_status_constraints")) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
    }
  } else {
    const column = await client.query(
      `select exists(select 1 from information_schema.columns
        where table_schema='public' and table_name='payment_refunds' and column_name='idempotency_key') present`,
    );
    invariant(column.rows[0]?.present === false, "Refund idempotency column exists without tracked migration 257. Stop for schema-drift review.");
  }

  await client.query("rollback");
  console.log(`Customer-money reconciliation certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
