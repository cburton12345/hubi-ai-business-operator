import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "259_change_order_lifecycle";

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
  application_name: `ferocity_change_order_lifecycle_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const applied = migration.rowCount === 1;
  const dependency = await client.query(
    `select
       to_regclass('public.estimate_change_orders') is not null change_orders,
       to_regclass('public.estimate_share_links') is not null estimate_links,
       to_regclass('public.service_jobs') is not null jobs,
       to_regclass('public.service_work_orders') is not null work_orders,
       to_regclass('public.service_visits') is not null visits,
       to_regclass('public.service_invoices') is not null invoices,
       to_regclass('public.invoice_line_items') is not null invoice_lines`,
  );
  for (const [name, exists] of Object.entries(dependency.rows[0])) {
    invariant(exists, `Required change-order dependency is missing: ${name}`);
  }

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    const requiredColumns = [
      "estimated_cost_cents", "schedule_impact_minutes", "idempotency_key", "sent_at", "decided_at",
      "decided_by_name", "decided_by_email", "decision_note", "decision_ip", "decision_user_agent",
      "decision_document_sha256", "applied_at", "invoice_line_item_id",
    ];
    const shape = await client.query(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='estimate_change_orders'
          and column_name=any($1::text[])`,
      [requiredColumns],
    );
    invariant(shape.rowCount === requiredColumns.length, `Change-order schema is incomplete; found ${shape.rowCount}/${requiredColumns.length} required columns.`);
    const indexes = await client.query(
      `select
         to_regclass('public.uniq_estimate_change_orders_idempotency') is not null idempotency_unique,
         to_regclass('public.uniq_estimate_change_orders_invoice_line') is not null invoice_line_unique,
         to_regclass('public.idx_estimate_change_orders_customer_decision') is not null decision_lookup`,
    );
    for (const [name, exists] of Object.entries(indexes.rows[0])) {
      invariant(exists, `Required change-order index is missing: ${name}`);
    }
    const integrity = await client.query(
      `select
         count(*) filter (where estimated_cost_cents < 0 or schedule_impact_minutes < 0)::int negative_forecasts,
         count(*) filter (
           where status in ('approved','rejected')
             and (decided_at is null or nullif(decided_by_name,'') is null or coalesce(decision_document_sha256,'') !~ '^[0-9a-f]{64}$')
         )::int decisions_without_evidence,
         count(*) filter (where status='approved' and applied_at is null)::int approved_not_applied,
         count(*) filter (where status<>'approved' and (applied_at is not null or invoice_line_item_id is not null))::int nonapproved_applied,
         count(*) filter (where status='sent_manually' and sent_at is null)::int sent_without_timestamp
       from public.estimate_change_orders`,
    );
    for (const [name, count] of Object.entries(integrity.rows[0])) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
    }
    const lineIntegrity = await client.query(
      `select count(*)::int mismatched_invoice_lines
         from public.estimate_change_orders co
         join public.invoice_line_items li on li.id=co.invoice_line_item_id
         join public.service_invoices i on i.id=li.invoice_id and i.tenant_id=li.tenant_id
        where co.invoice_line_item_id is not null
          and (li.tenant_id<>co.tenant_id or i.estimate_id is distinct from co.estimate_id)`,
    );
    invariant(lineIntegrity.rows[0]?.mismatched_invoice_lines === 0, "Change-order invoice links must remain in the same tenant and estimate.");
  } else {
    const drift = await client.query(
      `select exists(select 1 from information_schema.columns
        where table_schema='public' and table_name='estimate_change_orders' and column_name='decision_document_sha256') present`,
    );
    invariant(drift.rows[0]?.present === false, "Change-order lifecycle columns exist without tracked migration 259. Stop for schema-drift review.");
  }

  await client.query("rollback");
  console.log(`Change-order lifecycle certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
