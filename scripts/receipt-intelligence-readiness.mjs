import fs from "node:fs";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const requiredTables = [
  "document_intelligence_settings",
  "document_intelligence_documents",
  "document_intelligence_line_items",
  "document_intelligence_transactions",
  "document_intelligence_allocations",
  "document_intelligence_events"
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});

await client.connect();
try {
  const tablesResult = await client.query(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])`,
      [requiredTables]
    );
  const bucketResult = await client.query(
      `select id, public, file_size_limit, allowed_mime_types
         from storage.buckets where id = 'receipt-expense-assets'`
    );
  const aliasResult = await client.query(
      `select
         count(*) filter (where t.status <> 'archived' and t.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$')::int as eligible_workspaces,
         count(*) filter (where r.id is not null and r.status = 'active' and r.default_lead_source = 'expense_document_email')::int as active_receipt_aliases
       from public.tenants t
       left join public.email_inbound_routes r
         on r.tenant_id = t.id
        and r.address = lower('receipts+' || t.slug || '@ferocity.live')
       where t.status <> 'archived' and t.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'`
    );
  const featureTableResult = await client.query("select to_regclass('public.feature_entitlements') as table_name");
  const featureTableExists = Boolean(featureTableResult.rows[0]?.table_name);
  const featureResult = featureTableExists
    ? await client.query(
        `select status, metadata_json from public.feature_entitlements
          where feature_key = 'expense_document_intelligence' limit 1`
      )
    : { rows: [] };
  const migrationsResult = await client.query(
      `select version from public.schema_migrations
        where version in ('211_shared_document_expense_intelligence', '212_expense_email_intake_routes', '213_statement_transaction_intelligence')
        order by version`
    ).catch(() => ({ rows: [] }));

  const tables = new Map(tablesResult.rows.map((row) => [row.table_name, row.rls_enabled]));
  const missingTables = requiredTables.filter((name) => !tables.has(name));
  const rlsDisabled = requiredTables.filter((name) => tables.has(name) && !tables.get(name));
  const bucket = bucketResult.rows[0];
  const aliases = aliasResult.rows[0] ?? { eligible_workspaces: 0, active_receipt_aliases: 0 };
  const appliedMigrations = migrationsResult.rows.map((row) => row.version);

  const checks = {
    schema: missingTables.length === 0,
    rowLevelSecurity: rlsDisabled.length === 0,
    privateSourceStorage: Boolean(bucket && bucket.public === false && Number(bucket.file_size_limit) >= 15 * 1024 * 1024),
    receiptAliases: Number(aliases.active_receipt_aliases) === Number(aliases.eligible_workspaces),
    featureRegistration: !featureTableExists || featureResult.rows[0]?.status === "enabled",
    migrationsApplied: appliedMigrations.length === 3
  };
  const ok = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    ok,
    checks,
    details: {
      missingTables,
      rlsDisabled,
      storageBucket: bucket ? {
        id: bucket.id,
        private: bucket.public === false,
        fileSizeLimitBytes: Number(bucket.file_size_limit),
        allowedMimeTypes: bucket.allowed_mime_types
      } : null,
      receiptEmailAliases: {
        eligibleWorkspaces: Number(aliases.eligible_workspaces),
        activeAliases: Number(aliases.active_receipt_aliases)
      },
      featureEntitlement: featureTableExists ? featureResult.rows[0] ?? null : "not_used_in_this_schema",
      appliedMigrations
    }
  }, null, 2));

  if (!ok) process.exitCode = 2;
} finally {
  await client.end();
}
