import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "256_platform_subscription_revenue_ledger";
const TABLE = "platform_subscription_revenue_events";

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
  application_name: `ferocity_platform_revenue_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const table = await client.query("select to_regclass($1) is not null as present", [`public.${TABLE}`]);
  const applied = migration.rowCount === 1;
  const present = table.rows[0]?.present === true;

  if (phase === "pre" && !applied) {
    invariant(!present, `${TABLE} exists without its tracked migration. Stop for schema-drift review.`);
    const dependencies = await client.query(
      `select to_regclass('public.tenants') is not null as tenants,
              to_regclass('public.billing_subscriptions') is not null as billing_subscriptions,
              to_regclass('public.billing_plans') is not null as billing_plans,
              to_regclass('public.provider_webhook_events') is not null as provider_webhook_events`,
    );
    for (const [name, exists] of Object.entries(dependencies.rows[0])) {
      invariant(exists, `Required dependency is missing: ${name}`);
    }
  }

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    invariant(present, `${TABLE} is missing after migration.`);
    const shape = await client.query(
      `select c.relrowsecurity,
        (select count(*)::int from information_schema.role_table_grants
          where table_schema='public' and table_name=$1 and grantee in ('anon','authenticated','PUBLIC')) grants,
        (select count(*)::int from pg_policies where schemaname='public' and tablename=$1) policies
       from pg_class c where c.oid=$2::regclass`,
      [TABLE, `public.${TABLE}`],
    );
    invariant(shape.rows[0]?.relrowsecurity === true, "Platform revenue ledger must have RLS enabled.");
    invariant(shape.rows[0]?.grants === 0, "Platform revenue ledger must not grant browser roles direct access.");
    invariant(shape.rows[0]?.policies === 0, "Platform revenue ledger must remain server-only without tenant browser policies.");

    const integrity = await client.query(
      `select
        (select count(*) from public.platform_subscription_revenue_events e
          left join public.tenants t on t.id=e.tenant_id and t.account_type='customer'
          where t.id is null)::int orphan_or_non_customer,
        (select count(*)-count(distinct provider_event_id) from public.platform_subscription_revenue_events)::int duplicate_provider_events,
        (select count(*) from public.platform_subscription_revenue_events
          where (financial_status='collected' and (refund_amount_cents<>0 or net_amount_cents<>gross_amount_cents))
             or (financial_status='at_risk' and (refund_amount_cents<>0 or net_amount_cents<>0))
             or (financial_status='refunded' and (gross_amount_cents<>0 or net_amount_cents<>-refund_amount_cents)))::int invalid_financial_rows`,
    );
    for (const [name, count] of Object.entries(integrity.rows[0])) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
    }
  }

  await client.query("rollback");
  console.log(`Platform subscription revenue certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
