import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "supabase", "migrations");
const expectedProjectRef = "puvpgebitzvyqbdnnlyz";
const candidateVersions = [
  "279_worker_balance_ledger",
  "280_worker_time_breaks_and_audit",
  "281_password_reset_token_separation",
];
const releaseRange = [
  "268_managed_image_ad_lifecycle",
  "269_marketplacepro_delivery_inbox",
  "270_accounting_browser_write_hardening",
  "271_user_identity_privilege_hardening",
  "272_voice_admission_evidence_hardening",
  "273_authority_and_execution_evidence_browser_write_hardening",
  "274_subscription_and_entitlement_browser_write_hardening",
  "275_canonical_provider_boundary_browser_write_hardening",
  "276_ai_budget_usage_browser_write_hardening",
  "277_consent_authority_credential_voice_browser_write_hardening",
  "278_tenant_commercial_authority_column_hardening",
  ...candidateVersions,
];

const migrationDependencies = {
  "268_managed_image_ad_lifecycle": {
    relations: ["marketing_graphic_jobs", "marketing_media_assets"],
    functions: [],
    changes: "Managed-image lifecycle columns, private storage bucket, and server-control triggers.",
  },
  "269_marketplacepro_delivery_inbox": {
    relations: ["marketplacepro_connections", "brands", "tenants", "users"],
    functions: [],
    changes: "Connection identity hardening and server-only owner-pilot delivery tables.",
  },
  "270_accounting_browser_write_hardening": {
    relations: [
      "usage_meter_events", "storage_usage_events", "storage_quota_policies",
      "billing_usage_charges", "usage_bundle_purchases", "usage_allowance_policies", "spend_limits",
    ],
    functions: ["reserve_storage_usage"],
    changes: "Revokes browser mutation authority from accounting, usage, quota, and spend records.",
  },
  "271_user_identity_privilege_hardening": {
    relations: ["users"], functions: [],
    changes: "Restricts authenticated user updates to the profile name column.",
  },
  "272_voice_admission_evidence_hardening": {
    relations: ["receptionist_calls"], functions: [],
    changes: "Makes voice-admission pricing evidence server-owned.",
  },
  "273_authority_and_execution_evidence_browser_write_hardening": {
    relations: [
      "approvals", "live_action_policies", "outbound_action_queue", "approval_audit_events",
      "activity_logs", "outbound_delivery_events", "capability_execution_audits",
      "paid_media_action_audit", "integration_jobs",
    ],
    functions: [],
    changes: "Makes authority, queue, and execution evidence browser-read-only.",
  },
  "274_subscription_and_entitlement_browser_write_hardening": {
    relations: ["billing_plans", "billing_subscriptions", "workspace_feature_entitlements", "plan_feature_matrix"],
    functions: [],
    changes: "Makes subscriptions, entitlements, pricing, and feature catalogs server-owned.",
  },
  "275_canonical_provider_boundary_browser_write_hardening": {
    relations: [
      "provider_accounts", "integration_connections", "provider_connection_lanes",
      "payment_provider_accounts", "payment_provider_account_events", "payment_fee_policies",
    ],
    functions: [],
    changes: "Makes provider/OAuth/payment connection truth server-owned.",
  },
  "276_ai_budget_usage_browser_write_hardening": {
    relations: ["ai_usage_events", "ai_budget_policies"], functions: [],
    changes: "Makes AI budget policy and usage evidence server-owned.",
  },
  "277_consent_authority_credential_voice_browser_write_hardening": {
    relations: [
      "contact_consent_records", "contact_suppression_list", "integration_authority_grants",
      "external_ai_credentials", "voice_provider_routes",
    ],
    functions: [],
    changes: "Makes consent, suppression, credential, authority, and voice route state server-owned.",
  },
  "278_tenant_commercial_authority_column_hardening": {
    relations: ["tenants"], functions: [],
    changes: "Removes browser mutation authority over tenant commercial and ownership columns.",
  },
  "279_worker_balance_ledger": {
    relations: ["employee_cash_advances", "operations_workers", "tenants", "users"],
    functions: ["has_tenant_role", "current_app_user_id"],
    changes: "Adds reviewable worker balance evidence without payroll or money movement.",
  },
  "280_worker_time_breaks_and_audit": {
    relations: ["operations_time_entries", "operations_workers", "tenants", "users"],
    functions: ["has_tenant_role"],
    changes: "Adds persisted breaks, immutable clock evidence, and server-only writes.",
  },
  "281_password_reset_token_separation": {
    relations: ["tenants", "users"], functions: [],
    changes: "Adds server-only, single-purpose password reset credentials.",
  },
};

const newRelations = [
  "marketplacepro_owner_pilot_enrollments",
  "marketplacepro_delivery_inbox",
  "employee_advance_repayments",
  "employee_advance_pay_allocations",
  "employee_advance_events",
  "operations_time_entry_events",
  "password_reset_tokens",
];

const securityTables = [...new Set(Object.values(migrationDependencies).flatMap((item) => item.relations).concat(newRelations))].sort();
const browserRoles = ["public", "anon", "authenticated"];
const inspectedRoles = [...browserRoles, "service_role"];
const tablePrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const mutationPrivileges = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const pendingColumnContracts = {
  marketing_graphic_jobs: [
    "output_media_asset_id", "provider_response_json", "submitted_at", "completed_at", "cancelled_at",
    "approval_snapshot_json", "approval_hash", "approval_version", "approved_by_actor_key", "approved_at",
  ],
  employee_cash_advances: [
    "entry_kind", "currency", "is_worker_debt", "approval_status", "worker_authorization_status",
    "repayment_terms", "receipt_url", "approved_by_user_id", "approved_at", "rejected_by_user_id",
    "rejected_at", "reversed_by_user_id", "reversed_at", "reversal_reason",
  ],
  operations_time_entries: ["break_started_at", "break_seconds"],
};

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePolicyExpression(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("::text", "")
    .replaceAll("public.", "")
    .replace(/[\s()]/g, "");
}

function gitText(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", windowsHide: true }).trim();
}

function gitBuffer(args) {
  return execFileSync("git", args, { cwd: rootDir, windowsHide: true });
}

function normalizedPath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function buildSourceManifest() {
  const raw = gitBuffer(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const relativeFiles = raw.toString("utf8").split("\0").filter(Boolean)
    .filter((file) => !file.startsWith("artifacts/release-preflight/"))
    .sort((a, b) => a.localeCompare(b));
  const entries = [];
  for (const relativePath of relativeFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) continue;
    const bytes = await readFile(absolutePath);
    entries.push({ path: normalizedPath(relativePath), bytes: fileStat.size, sha256: sha256(bytes) });
  }
  const canonical = entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join("");
  const statusLines = gitText(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  return {
    head: gitText(["rev-parse", "HEAD"]),
    branch: gitText(["branch", "--show-current"]),
    upstreamDelta: gitText(["status", "--short", "--branch"]).split(/\r?\n/, 1)[0],
    statusEntryCount: statusLines.length,
    trackedChangedCount: statusLines.filter((line) => !line.startsWith("??")).length,
    untrackedCount: statusLines.filter((line) => line.startsWith("??")).length,
    fileCount: entries.length,
    artifactSha256: sha256(canonical),
    entries,
  };
}

async function migrationSourceManifest() {
  const entries = [];
  for (const version of releaseRange) {
    const fileName = `${version}.sql`;
    const bytes = await readFile(path.join(migrationsDir, fileName));
    entries.push({ version, file: `supabase/migrations/${fileName}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return {
    sha256: sha256(entries.map((entry) => `${entry.version}\0${entry.bytes}\0${entry.sha256}\n`).join("")),
    entries,
  };
}

function mapRelationRows(rows) {
  return rows.map((row) => ({
    schema: row.schema_name,
    relation: row.relation_name,
    kind: row.relation_kind,
    rowLevelSecurity: row.row_level_security,
  }));
}

async function inspectDatabase(client, localMigrations) {
  const readOnly = await client.query("select current_setting('transaction_read_only') as value");
  const ledger = await client.query("select version from public.schema_migrations order by version");
  const ledgerVersions = ledger.rows.map((row) => row.version);

  const relations = await client.query(`
    select n.nspname as schema_name, c.relname as relation_name, c.relkind as relation_kind,
           c.relrowsecurity as row_level_security
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relname=any($1::text[])
    order by n.nspname,c.relname
  `, [[...new Set([...securityTables, "buckets"])] ]);
  const relationNames = new Set(relations.rows.filter((row) => row.schema_name === "public").map((row) => row.relation_name));

  const functions = await client.query(`
    select distinct p.proname as function_name
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any($1::text[])
    order by p.proname
  `, [[...new Set(Object.values(migrationDependencies).flatMap((item) => item.functions))]]);
  const functionNames = new Set(functions.rows.map((row) => row.function_name));

  const roles = await client.query(`
    select rolname from pg_catalog.pg_roles where rolname=any($1::text[]) order by rolname
  `, [inspectedRoles]);
  const roleNames = new Set(roles.rows.map((row) => row.rolname));

  const columns = await client.query(`
    select table_schema,table_name,column_name,data_type,is_nullable
    from information_schema.columns
    where table_schema='public' and table_name=any($1::text[])
    order by table_name,ordinal_position
  `, [[
    "marketing_graphic_jobs", "marketplacepro_connections", "employee_cash_advances",
    "operations_time_entries", ...newRelations,
  ]]);

  const policies = await client.query(`
    select tablename,policyname,cmd,roles,qual,with_check
    from pg_catalog.pg_policies
    where schemaname='public' and tablename=any($1::text[])
    order by tablename,policyname
  `, [securityTables]);

  const constraints = await client.query(`
    select c.relname as table_name, con.conname as constraint_name, con.contype as constraint_type,
           con.convalidated as validated, pg_catalog.pg_get_constraintdef(con.oid,true) as definition
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid=con.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[])
    order by c.relname,con.conname
  `, [securityTables]);

  const privilegeRows = await client.query(`
    select c.relname as table_name, role_name, privilege_name,
           pg_catalog.has_table_privilege(role_name,c.oid,privilege_name) as allowed
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join unnest($2::text[]) role_name
    cross join unnest($3::text[]) privilege_name
    where n.nspname='public' and c.relname=any($1::text[])
    order by c.relname,role_name,privilege_name
  `, [securityTables, inspectedRoles.filter((role) => roleNames.has(role)), tablePrivileges]);

  const columnMutationRows = await client.query(`
    select c.relname as table_name, role_name, privilege_name, count(*)::integer as allowed_column_count
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    cross join unnest($2::text[]) role_name
    cross join unnest($3::text[]) privilege_name
    where n.nspname='public' and c.relname=any($1::text[])
      and pg_catalog.has_column_privilege(role_name,c.oid,a.attname,privilege_name)
    group by c.relname,role_name,privilege_name
    order by c.relname,role_name,privilege_name
  `, [securityTables, browserRoles.filter((role) => roleNames.has(role)), ["INSERT", "UPDATE", "REFERENCES"]]);

  const bucket = await client.query(`
    select count(*)::integer as existing_count,
           count(*) filter (where public=false and file_size_limit=20971520
             and allowed_mime_types=array['image/png']::text[])::integer as compatible_count
    from storage.buckets where id='marketing-media-assets' or name='marketing-media-assets'
  `);
  const imageBrandMismatch = await client.query(`
    select count(*)::integer as count
    from public.marketing_graphic_jobs job
    join public.brands brand on brand.id=job.brand_id
    where job.brand_id is not null and brand.tenant_id<>job.tenant_id
  `);
  const marketplaceBrandMismatch = await client.query(`
    select count(*)::integer as count
    from public.marketplacepro_connections connection
    join public.brands brand on brand.id=connection.brand_id
    where connection.brand_id is not null and brand.tenant_id<>connection.tenant_id
  `);
  const openShifts = await client.query(`
    with open_rows as (
      select tenant_id,worker_id
      from public.operations_time_entries
      where status='open' and clock_out_at is null
    ), duplicate_groups as (
      select tenant_id,worker_id,count(*) as row_count
      from open_rows where worker_id is not null
      group by tenant_id,worker_id having count(*)>1
    )
    select (select count(*)::integer from open_rows) as open_row_count,
           (select count(*)::integer from duplicate_groups) as duplicate_open_worker_groups,
           (select coalesce(sum(row_count),0)::integer from duplicate_groups) as rows_in_duplicate_groups,
           (select count(*)::integer from public.operations_time_entries
             where (status='open')<>(clock_out_at is null)) as inconsistent_open_state_count
  `);

  const dependencyChecks = Object.fromEntries(Object.entries(migrationDependencies).map(([version, details]) => [version, {
    relations: details.relations,
    missingRelations: details.relations.filter((name) => !relationNames.has(name)),
    functions: details.functions,
    missingFunctions: details.functions.filter((name) => !functionNames.has(name)),
    changes: details.changes,
  }]));
  const applied = Object.fromEntries(releaseRange.map((version) => [version, ledgerVersions.includes(version)]));
  const pendingNormalRunner = localMigrations.entries.map((entry) => entry.version).filter((version) => !ledgerVersions.includes(version));
  const existingNewRelations = newRelations.filter((name) => relationNames.has(name));
  const existingColumns = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const pendingColumnCollisions = Object.entries(pendingColumnContracts).flatMap(([table, names]) =>
    names.filter((name) => existingColumns.has(`${table}.${name}`)).map((name) => `${table}.${name}`));
  const browserMutationGrants = privilegeRows.rows.filter((row) => browserRoles.includes(row.role_name)
    && mutationPrivileges.includes(row.privilege_name) && row.allowed);

  const expectedLegacyPolicyExpression = "has_tenant_roletenant_id,array['owner','admin','operator']";
  const legacyPolicyContracts = [
    ["employee_cash_advances", "employee_cash_advances_operator"],
    ["operations_time_entries", "operations_time_entries_tenant"],
  ].map(([table, policy]) => {
    const actual = policies.rows.find((row) => row.tablename === table && row.policyname === policy);
    const roles = Array.isArray(actual?.roles) ? actual.roles : String(actual?.roles ?? "").replace(/^\{|\}$/g, "").split(",").filter(Boolean);
    const matches = Boolean(actual) && actual.cmd === "ALL" && roles.length === 1 && roles[0] === "public"
      && normalizePolicyExpression(actual.qual) === expectedLegacyPolicyExpression
      && normalizePolicyExpression(actual.with_check) === expectedLegacyPolicyExpression;
    return { table, policy, matches };
  });

  const blockingFindings = [];
  if (readOnly.rows[0]?.value !== "on") blockingFindings.push("Database transaction is not READ ONLY.");
  if (ledgerVersions.at(-1) !== "267_restore_server_only_data_api_boundaries") {
    blockingFindings.push(`Expected production ledger 267; observed ${ledgerVersions.at(-1) ?? "empty"}.`);
  }
  if (candidateVersions.some((version) => applied[version])) blockingFindings.push("At least one candidate migration is already recorded.");
  if (existingNewRelations.length > 0) blockingFindings.push("One or more candidate/new release relations already exist outside the ledger.");
  if (pendingColumnCollisions.length > 0) blockingFindings.push("One or more pending migration columns already exist outside the ledger.");
  if (legacyPolicyContracts.some((contract) => !contract.matches)) {
    blockingFindings.push("A migration 279/280 legacy policy does not match the exact source-defined pre-apply contract.");
  }
  for (const version of candidateVersions) {
    if (dependencyChecks[version].missingRelations.length || dependencyChecks[version].missingFunctions.length) {
      blockingFindings.push(`${version} has missing production dependencies.`);
    }
  }
  if (marketplaceBrandMismatch.rows[0].count > 0) blockingFindings.push("Migration 269 has cross-tenant MarketplacePro brand links.");
  if (imageBrandMismatch.rows[0].count > 0) blockingFindings.push("Migration 268 has cross-tenant managed-image brand links.");
  if (bucket.rows[0].existing_count > 0 && bucket.rows[0].compatible_count !== bucket.rows[0].existing_count) {
    blockingFindings.push("Migration 268 storage bucket name/id collides with incompatible settings.");
  }
  if (openShifts.rows[0].duplicate_open_worker_groups > 0) {
    blockingFindings.push("Legacy operations_time_entries contains duplicate open shifts for at least one worker.");
  }
  if (openShifts.rows[0].inconsistent_open_state_count > 0) {
    blockingFindings.push("Legacy operations_time_entries contains inconsistent status/clock_out_at state.");
  }

  return {
    transactionReadOnly: readOnly.rows[0]?.value === "on",
    ledger: {
      count: ledgerVersions.length,
      latest: ledgerVersions.at(-1) ?? null,
      applied,
      pendingUnderNormalRunner: pendingNormalRunner,
    },
    dependencyChecks,
    rolesPresent: inspectedRoles.filter((role) => roleNames.has(role)),
    relations: mapRelationRows(relations.rows),
    columns: columns.rows,
    policies: policies.rows.map((row) => ({
      table: row.tablename,
      policy: row.policyname,
      command: row.cmd,
      roles: row.roles,
      usingSha256: sha256(row.qual ?? ""),
      checkSha256: sha256(row.with_check ?? ""),
    })),
    constraints: constraints.rows.map((row) => ({
      table: row.table_name,
      constraint: row.constraint_name,
      type: row.constraint_type,
      validated: row.validated,
      definitionSha256: sha256(row.definition),
    })),
    effectiveTablePrivileges: privilegeRows.rows,
    effectiveBrowserColumnMutationPrivileges: columnMutationRows.rows,
    aggregateAssumptions: {
      managedImageCrossTenantBrandLinks: imageBrandMismatch.rows[0].count,
      managedImageBucket: bucket.rows[0],
      marketplaceProCrossTenantBrandLinks: marketplaceBrandMismatch.rows[0].count,
      workerTime: openShifts.rows[0],
      existingNewRelationCollisions: existingNewRelations,
      pendingColumnCollisions,
      legacyPolicyContracts,
      effectiveBrowserTableMutationGrantCount: browserMutationGrants.length,
    },
    blockingFindings,
    passed: blockingFindings.length === 0,
  };
}

function outputPathFromArgs() {
  const option = process.argv.slice(2).find((arg) => arg.startsWith("--output="));
  if (option) return path.resolve(rootDir, option.slice("--output=".length));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(rootDir, "artifacts", "release-preflight", `worker-release-279-281-${stamp}.json`);
}

loadLocalEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; no database connection was attempted.");
  process.exit(1);
}
const parsedUrl = new URL(process.env.DATABASE_URL);
const targetMatchesExpectedProject = parsedUrl.hostname.includes(expectedProjectRef) || parsedUrl.username.includes(expectedProjectRef);
if (!targetMatchesExpectedProject) {
  console.error("DATABASE_URL does not match the expected production project identity; refusing to connect.");
  process.exit(1);
}

const sourceManifest = await buildSourceManifest();
const localMigrations = await migrationSourceManifest();
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
  statement_timeout: 20_000,
  application_name: "ferocity_worker_release_readonly_preflight",
});

let database;
await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='20s'");
  await client.query("set local lock_timeout='3s'");
  await client.query("set local idle_in_transaction_session_timeout='30s'");
  database = await inspectDatabase(client, localMigrations);
  await client.query("rollback");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}

const report = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  mode: "production-read-only-schema-and-aggregate-preflight",
  safeguards: {
    targetProjectIdentityMatched: true,
    transactionReadOnly: database.transactionReadOnly,
    statementTimeoutMs: 20_000,
    lockTimeoutMs: 3_000,
    outputContainsPrivateWorkerRows: false,
    outputContainsSecretsOrEnvironmentValues: false,
  },
  sourceManifest,
  migrationSourceManifest: localMigrations,
  database,
  releaseScope: {
    candidateFeatureMigrations: candidateVersions,
    featureDependencyConclusion: "Migrations 279-281 depend only on production relations/functions already present at ledger 267; they do not depend on 268-278.",
    normalRunnerConclusion: "The repository's normal migration runner applies every pending migration in lexical order, so its next production run would apply 268-281, not only 279-281.",
    smallestSchemaBatch: candidateVersions,
    standardRunnerBatch: releaseRange,
    confirmationRequired: [
      "Applying 268-269 enables managed-image and MarketplacePro schema contracts unrelated to the worker/auth candidate.",
      "Applying 270-278 changes effective browser/service-role grants, policies, identity authority, commercial authority, consent/credential boundaries, and provider/payment/accounting records.",
      "A targeted 279-281 application would be a deliberate exception to the normal all-pending runner and must record exactly those ledger versions transactionally.",
    ],
  },
  backupAndRollbackPlan: {
    beforeApply: [
      "Confirm a current provider-native production backup/PITR restore point and record its timestamp without exporting customer rows.",
      "Preserve this source manifest hash, migration-source hash, production ledger latest version, and the preflight report.",
      "Re-run this preflight immediately before application and require the same ledger/dependency/collision assumptions.",
    ],
    failureDuringApply: "Each migration must run in its own explicit transaction; rollback the transaction on any error and do not write its schema_migrations row.",
    afterCommit: [
      "Use a reviewed forward migration to restore grants/policies or disable new code paths; do not edit already-applied migration files.",
      "Do not drop worker balance, clock evidence, or password-reset tables if any evidence/token rows exist; preserve records and revoke runtime access while fixing forward.",
      "If platform recovery is required, restore through the confirmed provider-native backup/PITR procedure and reconcile the migration ledger before traffic resumes.",
    ],
  },
  localTestEvidence: {
    immutableFullCandidateTestArtifactFound: false,
    note: "The handoff records a 1,446-test pass for this candidate, but no immutable local test-result artifact tied to the current source-manifest hash was found. This preflight report and its hash are fresh evidence only for schema/access assumptions.",
  },
};
const reportWithoutHash = `${JSON.stringify(report, null, 2)}\n`;
report.reportSha256 = sha256(reportWithoutHash);
const outputPath = outputPathFromArgs();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({
  passed: report.database.passed,
  output: normalizedPath(path.relative(rootDir, outputPath)),
  reportSha256: report.reportSha256,
  sourceArtifactSha256: sourceManifest.artifactSha256,
  migrationSourceSha256: localMigrations.sha256,
  ledgerLatest: report.database.ledger.latest,
  blockingFindings: report.database.blockingFindings,
  smallestSchemaBatch: report.releaseScope.smallestSchemaBatch,
  standardRunnerBatch: report.releaseScope.standardRunnerBatch,
}, null, 2));
if (!report.database.passed) process.exitCode = 2;
