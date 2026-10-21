import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATION = "258_customer_portal_token_security";

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
  application_name: `ferocity_customer_portal_security_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  const migration = await client.query("select version from public.schema_migrations where version=$1", [MIGRATION]);
  const applied = migration.rowCount === 1;
  const dependency = await client.query("select to_regclass('public.customer_portal_access') is not null as portal_access");
  invariant(dependency.rows[0]?.portal_access, "Required customer_portal_access table is missing.");

  if (phase === "post" || applied) {
    invariant(applied, `Postflight requires ${MIGRATION}.`);
    const shape = await client.query(
      `select
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='customer_portal_access' and column_name='token_hash' and is_nullable='NO') token_hash_required,
         to_regclass('public.customer_portal_access_token_hash_unique') is not null token_hash_unique,
         to_regclass('public.customer_portal_access_active_token_hash_idx') is not null active_lookup_index`,
    );
    for (const [name, exists] of Object.entries(shape.rows[0])) {
      invariant(exists, `Required portal security schema is missing: ${name}`);
    }
    const integrity = await client.query(
      `select
         count(*) filter (where token_hash is null or token_hash !~ '^[0-9a-f]{64}$')::int invalid_hashes,
         (count(*)-count(distinct token_hash))::int duplicate_hashes,
         count(*) filter (
           where public_token is not null
             and token_hash<>encode(digest(public_token,'sha256'),'hex')
         )::int legacy_hash_mismatches
       from public.customer_portal_access`,
    );
    for (const [name, count] of Object.entries(integrity.rows[0])) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
    }
  } else {
    const column = await client.query(
      `select exists(select 1 from information_schema.columns
        where table_schema='public' and table_name='customer_portal_access' and column_name='token_hash') present`,
    );
    invariant(column.rows[0]?.present === false, "Portal token_hash exists without tracked migration 258. Stop for schema-drift review.");
  }

  await client.query("rollback");
  console.log(`Customer portal security certification (${phase}) passed without changing the database.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
