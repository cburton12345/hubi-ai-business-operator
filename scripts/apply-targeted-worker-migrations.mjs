import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedProductionProjectRef = "puvpgebitzvyqbdnnlyz";
const targetVersions = [
  "279_worker_balance_ledger",
  "280_worker_time_breaks_and_audit",
  "281_password_reset_token_separation",
];
const deferredVersions = [
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
];
const expectedBaseline = "267_restore_server_only_data_api_boundaries";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs() {
  const args = new Map();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith("--")) throw new Error(`Unsupported positional argument: ${raw}`);
    const [key, ...rest] = raw.slice(2).split("=");
    args.set(key, rest.length ? rest.join("=") : true);
  }
  const plan = args.has("plan");
  const apply = args.has("apply");
  if (plan === apply) throw new Error("Choose exactly one of --plan or --apply.");
  const target = args.get("target");
  if (target !== "production" && target !== "disposable") {
    throw new Error("--target must be production or disposable.");
  }
  const preflight = args.get("preflight") ?? process.env.TARGETED_WORKER_MIGRATION_PREFLIGHT;
  if (!preflight) throw new Error("Provide --preflight=<path> or TARGETED_WORKER_MIGRATION_PREFLIGHT.");
  const failAfter = args.get("fail-after") ?? null;
  if (failAfter && (target !== "disposable" || !targetVersions.includes(failAfter))) {
    throw new Error("--fail-after is restricted to a named migration on a disposable target.");
  }
  return { plan, apply, target, preflight: path.resolve(rootDir, preflight), failAfter, evidence: args.get("evidence") ?? null };
}

function safeTargetIdentity(url, target) {
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (target === "production") {
    return url.hostname.includes(expectedProductionProjectRef) || url.username.includes(expectedProductionProjectRef);
  }
  return local && /^ferocity_worker_(?:migration_)?test(?:_|$)/.test(url.pathname.replace(/^\//, ""));
}

function targetFingerprint(url) {
  const port = url.port || "5432";
  return sha256(`${url.hostname.toLowerCase()}\0${port}\0${url.pathname}\0${url.username}`).slice(0, 24);
}

async function verifyPreflight(preflightPath) {
  const bytes = await readFile(preflightPath);
  const actualSha256 = sha256(bytes);
  const expectedSha256 = process.env.TARGETED_WORKER_MIGRATION_PREFLIGHT_SHA256;
  if (!expectedSha256 || expectedSha256 !== actualSha256) {
    throw new Error("Preflight artifact hash is missing or does not match the exact file.");
  }
  const report = JSON.parse(bytes.toString("utf8"));
  if (!report?.database?.passed || !report?.safeguards?.transactionReadOnly) {
    throw new Error("Preflight artifact is not a passing enforced-read-only report.");
  }
  if (report.database.ledger.latest !== expectedBaseline) {
    throw new Error("Preflight artifact was not captured from the expected production baseline.");
  }
  if (report.database.blockingFindings.length !== 0) {
    throw new Error("Preflight artifact contains blocking findings.");
  }
  const migrationEntries = new Map(report.migrationSourceManifest.entries.map((entry) => [entry.version, entry]));
  for (const version of [...deferredVersions, ...targetVersions]) {
    const expected = migrationEntries.get(version);
    if (!expected) throw new Error(`Preflight artifact is missing ${version}.`);
    const file = path.join(rootDir, expected.file);
    const current = await readFile(file);
    if (current.length !== expected.bytes || sha256(current) !== expected.sha256) {
      throw new Error(`Migration source drift detected for ${version}.`);
    }
  }
  const canonical = report.migrationSourceManifest.entries
    .map((entry) => `${entry.version}\0${entry.bytes}\0${entry.sha256}\n`).join("");
  if (sha256(canonical) !== report.migrationSourceManifest.sha256) {
    throw new Error("Migration manifest aggregate hash is invalid.");
  }
  return { report, actualSha256 };
}

async function ledgerState(client) {
  const result = await client.query("select version from public.schema_migrations order by version");
  const versions = result.rows.map((row) => row.version);
  const inRange = [...deferredVersions, ...targetVersions].filter((version) => versions.includes(version));
  const targeted = targetVersions.filter((version) => versions.includes(version));
  return {
    count: versions.length,
    latest: versions.at(-1) ?? null,
    deferredApplied: deferredVersions.filter((version) => versions.includes(version)),
    targetedApplied: targeted,
    inRange,
    replay: targeted.length === targetVersions.length,
    partial: targeted.length > 0 && targeted.length < targetVersions.length,
  };
}

function assertLedgerCompatible(state, preflight, { allowReplay = true } = {}) {
  const preflightApplied = [...deferredVersions, ...targetVersions]
    .filter((version) => preflight.database.ledger.applied[version]);
  if (state.partial) throw new Error("Partial 279-281 ledger state detected; aborting instead of guessing recovery state.");
  if (state.replay) {
    if (!allowReplay) throw new Error("Targeted migrations became applied during this operation.");
    return;
  }
  if (state.latest !== expectedBaseline) {
    throw new Error(`Ledger drift: expected latest ${expectedBaseline} before targeted application.`);
  }
  if (state.inRange.length !== preflightApplied.length || state.inRange.some((version) => !preflightApplied.includes(version))) {
    throw new Error("Migration 268-281 ledger state drifted from the preserved preflight.");
  }
}

async function schemaState(client) {
  const relationResult = await client.query(`
    select c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[])
    order by c.relname
  `, [["employee_advance_repayments", "employee_advance_pay_allocations", "employee_advance_events",
    "operations_time_entry_events", "password_reset_tokens"]]);
  const columnResult = await client.query(`
    select table_name,column_name from information_schema.columns
    where table_schema='public' and (
      (table_name='employee_cash_advances' and column_name=any($1::text[]))
      or (table_name='operations_time_entries' and column_name=any($2::text[]))
    ) order by table_name,column_name
  `, [["entry_kind", "currency", "is_worker_debt", "approval_status", "worker_authorization_status"],
    ["break_started_at", "break_seconds"]]);
  return { relations: relationResult.rows.map((row) => row.relname), columns: columnResult.rows };
}

async function main() {
  const options = parseArgs();
  const urlValue = process.env.TARGETED_WORKER_MIGRATION_DATABASE_URL;
  if (!urlValue) throw new Error("TARGETED_WORKER_MIGRATION_DATABASE_URL is required; DATABASE_URL is intentionally ignored.");
  const url = new URL(urlValue);
  if (!safeTargetIdentity(url, options.target)) throw new Error("Target identity does not match the selected protected target class.");
  const { report: preflight, actualSha256: preflightSha256 } = await verifyPreflight(options.preflight);
  const fingerprint = targetFingerprint(url);
  const requiredAck = `targeted-worker-279-281:${options.target}:${fingerprint}:${preflightSha256}`;
  if (options.apply && options.target === "production") {
    throw new Error("Isolated production application of 279-281 is disabled; the reviewed frontend requires the full 268-281 tranche.");
  }
  if (options.apply && process.env.TARGETED_WORKER_MIGRATION_ACK !== requiredAck) {
    throw new Error(`Exact nonsecret acknowledgement required: ${requiredAck}`);
  }

  const client = new Client({
    connectionString: urlValue,
    ssl: options.target === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    application_name: `ferocity_targeted_worker_migrations_${options.plan ? "plan" : "apply"}`,
  });
  await client.connect();
  let before;
  let after;
  let beforeSchema;
  let afterSchema;
  let replay = false;
  try {
    await client.query(options.plan ? "begin read only" : "begin");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local lock_timeout='5s'");
    await client.query("set local idle_in_transaction_session_timeout='45s'");
    if (options.apply) await client.query("select pg_catalog.pg_advisory_xact_lock(hashtextextended($1,0))", ["ferocity:targeted-worker-migrations:279-281"]);
    before = await ledgerState(client);
    beforeSchema = await schemaState(client);
    assertLedgerCompatible(before, preflight);
    replay = before.replay;
    if (options.apply && !replay) {
      if (beforeSchema.relations.length || beforeSchema.columns.length) {
        throw new Error("Partial schema collision detected despite an unapplied ledger; aborting.");
      }
      for (const version of targetVersions) {
        const sql = await readFile(path.join(rootDir, "supabase", "migrations", `${version}.sql`), "utf8");
        await client.query(sql);
        await client.query("insert into public.schema_migrations(version) values ($1)", [version]);
        if (options.failAfter === version) throw new Error(`Injected disposable failure after ${version}.`);
      }
      after = await ledgerState(client);
      if (!after.replay || after.partial) throw new Error("Post-apply ledger verification failed.");
      afterSchema = await schemaState(client);
      if (afterSchema.relations.length !== 5 || afterSchema.columns.length !== 7) {
        throw new Error("Post-apply schema verification failed.");
      }
      await client.query("commit");
    } else {
      after = before;
      afterSchema = beforeSchema;
      await client.query("rollback");
    }
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    await client.end();
  }

  const evidence = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    mode: options.plan ? "plan-read-only" : "targeted-transactional-apply",
    targetClass: options.target,
    targetFingerprint: fingerprint,
    preflight: { path: path.relative(rootDir, options.preflight).replaceAll("\\", "/"), sha256: preflightSha256 },
    sourceArtifactSha256: preflight.sourceManifest.artifactSha256,
    migrationSourceSha256: preflight.migrationSourceManifest.sha256,
    targetVersions,
    explicitlyDeferredVersions: deferredVersions,
    before,
    after,
    beforeSchema,
    afterSchema,
    replay,
    transactionCommitted: options.apply && !replay,
  };
  if (options.evidence) {
    const output = path.resolve(rootDir, options.evidence);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Targeted migration procedure failed.");
  process.exitCode = 1;
});
