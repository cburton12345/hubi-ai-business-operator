import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urlValue = process.env.TARGETED_WORKER_MIGRATION_DATABASE_URL;
const preflight = process.env.TARGETED_WORKER_MIGRATION_PREFLIGHT;
const preflightSha256 = process.env.TARGETED_WORKER_MIGRATION_PREFLIGHT_SHA256;
if (!urlValue || !preflight || !preflightSha256) throw new Error("Disposable URL and exact preflight artifact/hash are required.");
const parsed = new URL(urlValue);
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    || !/^ferocity_worker_(?:migration_)?test(?:_|$)/.test(parsed.pathname.replace(/^\//, ""))) {
  throw new Error("Refusing to test against a nonlocal or non-test-named database.");
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fingerprint = sha256(`${parsed.hostname.toLowerCase()}\0${parsed.port || "5432"}\0${parsed.pathname}\0${parsed.username}`).slice(0, 24);
const ack = `targeted-worker-279-281:disposable:${fingerprint}:${preflightSha256}`;
const childEnv = {
  ...process.env,
  TARGETED_WORKER_MIGRATION_ACK: ack,
};

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ["scripts/apply-targeted-worker-migrations.mjs", ...args], {
    cwd: rootDir, env: childEnv, encoding: "utf8", windowsHide: true,
  });
  if (result.status !== expectedStatus) {
    throw new Error(`Unexpected targeted runner status ${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
  }
  return result;
}

const client = new Client({ connectionString: urlValue, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
await client.connect();
try {
  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists auth cascade");
  await client.query("create schema public");
  await client.query("create schema auth");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await client.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$`);
  }
  await client.query(`
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function public.current_app_user_id() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.has_tenant_role(uuid,text[]) returns boolean language sql stable as $$ select true $$;
    create table public.schema_migrations(version text primary key,applied_at timestamptz not null default now());
    create table public.tenants(id uuid primary key);
    create table public.users(id uuid primary key,tenant_id uuid references public.tenants(id),auth_user_id uuid);
    create table public.operations_workers(
      id uuid primary key,tenant_id uuid not null references public.tenants(id),user_id uuid references public.users(id),
      unique(tenant_id,id),unique(tenant_id,id,user_id)
    );
    create table public.employee_cash_advances(
      id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
      worker_id uuid not null references public.operations_workers(id),amount_cents integer not null default 1,
      status text not null default 'pending',created_at timestamptz not null default now()
    );
    alter table public.employee_cash_advances enable row level security;
    create policy employee_cash_advances_operator on public.employee_cash_advances for all
      using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));
    create table public.operations_time_entries(
      id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
      worker_id uuid references public.operations_workers(id),clock_in_at timestamptz not null default now(),
      clock_out_at timestamptz,break_minutes integer not null default 0,status text not null default 'open'
    );
    alter table public.operations_time_entries enable row level security;
    create policy operations_time_entries_tenant on public.operations_time_entries for all
      using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
      with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));
  `);
  const migrationFiles = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
    .filter((name) => /^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 267)
    .sort();
  for (const file of migrationFiles) {
    await client.query("insert into public.schema_migrations(version) values($1)", [file.replace(/\.sql$/, "")]);
  }
} finally {
  await client.end();
}

run(["--plan", "--target=disposable", `--preflight=${preflight}`]);
const injected = run(["--apply", "--target=disposable", `--preflight=${preflight}`, "--fail-after=279_worker_balance_ledger"], 1);
if (!injected.stderr.includes("Injected disposable failure")) throw new Error("Failure injection did not reach the expected point.");

const verifyRollback = new Client({ connectionString: urlValue });
await verifyRollback.connect();
try {
  const ledger = await verifyRollback.query("select count(*)::int as count from public.schema_migrations where version like '27%' or version like '28%'");
  const relation = await verifyRollback.query("select to_regclass('public.employee_advance_repayments') as relation");
  const column = await verifyRollback.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='employee_cash_advances' and column_name='entry_kind'");
  if (ledger.rows[0].count !== 0 || relation.rows[0].relation !== null || column.rows[0].count !== 0) {
    throw new Error("Injected failure did not roll back ledger and schema atomically.");
  }
} finally {
  await verifyRollback.end();
}

run(["--apply", "--target=disposable", `--preflight=${preflight}`]);
const replay = run(["--apply", "--target=disposable", `--preflight=${preflight}`]);
const replayReport = JSON.parse(replay.stdout);
if (!replayReport.replay || replayReport.transactionCommitted) throw new Error("Replay was not a verified no-op.");

const future = new Client({ connectionString: urlValue });
await future.connect();
try {
  await future.query("begin");
  const deferred = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
    .filter((name) => /^(268|269|270|271|272|273|274|275|276|277|278)_.*\.sql$/.test(name)).sort();
  for (const file of deferred) {
    await future.query("insert into public.schema_migrations(version) values($1)", [file.replace(/\.sql$/, "")]);
  }
  const all = await future.query("select version from public.schema_migrations where version >= '268_' order by version");
  if (all.rows.length !== 14 || all.rows[0].version.slice(0, 3) !== "268" || all.rows.at(-1).version.slice(0, 3) !== "281") {
    throw new Error("Future deferred ledger compatibility check failed.");
  }
  await future.query("rollback");
} finally {
  await future.end();
}

console.log(JSON.stringify({
  passed: true,
  planReadOnly: true,
  partialFailureRollback: true,
  targetedApplyAtomic: true,
  replayNoOp: true,
  futureDeferredLedgerOrderingCompatible: true,
  note: "Deferred 268-278 DDL compatibility is covered by its existing focused migration tests and static non-overlap review; this harness verifies ledger ordering without executing deferred DDL.",
}, null, 2));
