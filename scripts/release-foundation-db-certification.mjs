import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const TARGETS = [
  "250_document_email_ingestion_jobs",
  "251_integration_authority_receipts",
  "252_external_ai_mcp_credentials",
];

const TARGET_TABLES = [
  "document_intelligence_email_jobs",
  "integration_authority_grants",
  "external_ai_credentials",
  "external_ai_tool_invocations",
];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const split = line.indexOf("=");
    const key = line.slice(0, split).trim();
    if (process.env[key]) continue;
    process.env[key] = line.slice(split + 1).trim().replace(/^["']|["']$/g, "");
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function printCheck(label, value) {
  console.log(`- ${label}: ${value}`);
}

loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));
invariant(process.env.DATABASE_URL, "DATABASE_URL is required.");

const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg?.split("=")[1] ?? "pre";
invariant(["pre", "post"].includes(phase), "Use --phase=pre or --phase=post.");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  application_name: `ferocity_release_foundation_${phase}`,
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout = '30s'");

  const migrations = await client.query(
    "select version from public.schema_migrations where version = any($1::text[]) order by version",
    [TARGETS],
  );
  const applied = new Set(migrations.rows.map((row) => row.version));
  const tables = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name = any($1::text[]) order by table_name`,
    [TARGET_TABLES],
  );
  const presentTables = new Set(tables.rows.map((row) => row.table_name));

  console.log(`Release foundation database certification (${phase})`);
  printCheck("target migrations applied", `${applied.size}/${TARGETS.length}`);

  if (phase === "pre") {
    invariant(applied.size === 0 || applied.size === TARGETS.length,
      `Partial migration state detected (${[...applied].join(", ") || "none"}). Stop and use the recovery runbook.`);
    if (applied.size === 0) {
      const dependencies = await client.query(
        `select to_regclass('public.tenants') is not null as tenants,
                to_regclass('public.users') is not null as users,
                to_regclass('public.tenant_users') is not null as tenant_users,
                to_regclass('public.document_intelligence_import_batches') is not null as import_batches,
                to_regclass('public.integration_connections') is not null as integration_connections,
                to_regprocedure('public.has_tenant_role(uuid,text[])') is not null as has_tenant_role`,
      );
      for (const [name, exists] of Object.entries(dependencies.rows[0])) {
        invariant(exists, `Required dependency is missing: ${name}`);
        printCheck(`dependency ${name}`, "present");
      }
      invariant(presentTables.size === 0,
        `Untracked target tables already exist: ${[...presentTables].join(", ")}. Do not apply IF NOT EXISTS migrations over drift.`);
    } else {
      printCheck("state", "already migrated; postflight invariants will be evaluated");
    }

    const connectionSummary = await client.query(
      `select count(*)::integer as total,
              count(*) filter (where status='connected')::integer as connected,
              count(*) filter (where credentials_status in ('expired','invalid'))::integer as unhealthy
       from public.integration_connections`,
    );
    const summary = connectionSummary.rows[0];
    printCheck("existing OAuth/integration records", summary.total);
    printCheck("connected OAuth/integration records", summary.connected);
    printCheck("expired or invalid credential records", summary.unhealthy);
  }

  if (phase === "post" || applied.size === TARGETS.length) {
    invariant(applied.size === TARGETS.length, `Postflight requires all migrations 250-252; found ${applied.size}.`);
    invariant(presentTables.size === TARGET_TABLES.length,
      `Missing target tables: ${TARGET_TABLES.filter((name) => !presentTables.has(name)).join(", ")}`);

    const rls = await client.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace='public'::regnamespace and relname = any($1::text[]) order by relname`,
      [TARGET_TABLES],
    );
    invariant(rls.rows.length === TARGET_TABLES.length && rls.rows.every((row) => row.relrowsecurity),
      "RLS is not enabled on every release-foundation table.");

    const expectedPolicies = new Set([
      "document_intelligence_email_jobs_tenant_operator",
      "integration_authority_grants_tenant_manage",
      "external_ai_credentials_tenant_admin",
      "external_ai_tool_invocations_tenant_admin",
    ]);
    const policies = await client.query(
      `select policyname from pg_policies where schemaname='public' and tablename = any($1::text[])`,
      [TARGET_TABLES],
    );
    const actualPolicies = new Set(policies.rows.map((row) => row.policyname));
    invariant([...expectedPolicies].every((name) => actualPolicies.has(name)),
      `Missing RLS policies: ${[...expectedPolicies].filter((name) => !actualPolicies.has(name)).join(", ")}`);

    const credentialColumns = await client.query(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='external_ai_credentials'`,
    );
    const columnNames = new Set(credentialColumns.rows.map((row) => row.column_name));
    for (const required of ["token_hash", "token_prefix", "consent_version", "consented_at", "consent_summary"]) {
      invariant(columnNames.has(required), `external_ai_credentials is missing ${required}.`);
    }
    for (const forbidden of ["token", "access_token", "bearer_token", "plaintext_token", "secret"]) {
      invariant(!columnNames.has(forbidden), `Unsafe plaintext credential column exists: ${forbidden}.`);
    }

    const integrity = await client.query(
      `select
        (select count(*) from public.external_ai_credentials
          where btrim(consent_version)='' or btrim(consent_summary)='' or cardinality(scopes)=0)::integer as invalid_credentials,
        (select count(*) from public.external_ai_credentials c
          left join public.tenant_users tu on tu.tenant_id=c.tenant_id and tu.user_id=c.authorized_user_id and tu.status='active'
          where tu.id is null)::integer as orphan_credentials,
        (select count(*) from public.external_ai_tool_invocations i
          left join public.external_ai_credentials c on c.id=i.credential_id and c.tenant_id=i.tenant_id
          where c.id is null)::integer as orphan_invocations,
        (select count(*) from public.document_intelligence_email_jobs j
          left join public.document_intelligence_import_batches b on b.id=j.batch_id and b.tenant_id=j.tenant_id
          where b.id is null)::integer as orphan_email_jobs`,
    );
    for (const [name, count] of Object.entries(integrity.rows[0])) {
      invariant(count === 0, `${name} must be zero; found ${count}.`);
      printCheck(name.replaceAll("_", " "), count);
    }
    printCheck("RLS target tables", rls.rows.length);
    printCheck("required policies", expectedPolicies.size);
    printCheck("plaintext token columns", 0);
  }

  await client.query("rollback");
  console.log("Certification passed without changing the database.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
