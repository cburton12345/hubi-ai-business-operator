import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const HISTORY_QUERY = "select version from public.schema_migrations order by version";
const LOCK_TIMEOUT = "5s";
const STATEMENT_TIMEOUT = "5min";

export const mutationWarning =
  "WARNING: db:validate:migrations is a mutating, disposable-database-only check. " +
  "It executes pending migration SQL inside a transaction and attempts to roll it back; " +
  "rollback does not guarantee the absence of every side effect.";

export function parseDisposableTarget(connectionString) {
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("MIGRATION_VALIDATION_DATABASE_URL must be a PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("MIGRATION_VALIDATION_DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const queryKeys = [...target.searchParams.keys()];
  const ambiguousKeys = [...new Set(queryKeys.filter((key) => key !== "sslmode"))];
  if (ambiguousKeys.length > 0 || target.searchParams.getAll("sslmode").length > 1) {
    const names = ambiguousKeys.length > 0 ? ambiguousKeys.sort().join(", ") : "duplicate sslmode";
    throw new Error(
      `MIGRATION_VALIDATION_DATABASE_URL contains unsupported or ambiguous query parameters: ${names}. ` +
      "Put host, port, user, and database in the URL authority/path only.",
    );
  }
  const sslMode = target.searchParams.get("sslmode");
  if (sslMode && sslMode !== "require") {
    throw new Error("MIGRATION_VALIDATION_DATABASE_URL only accepts sslmode=require; validator TLS behavior is fixed.");
  }

  const host = target.hostname;
  const port = target.port ? Number.parseInt(target.port, 10) : 5432;
  const database = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  const user = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  if (!host || !database || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "MIGRATION_VALIDATION_DATABASE_URL must explicitly identify host, valid port or default 5432, database, user, and password.",
    );
  }

  const routeFingerprint = createHash("sha256")
    .update(JSON.stringify({ host, port, database, user }))
    .digest("hex");
  const targetIdentity = `${host}:${port}/${encodeURIComponent(database)}#route=${routeFingerprint}`;

  return {
    targetIdentity,
    clientConfig: {
      host,
      port,
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false },
    },
  };
}

export function requireDisposableTargetAcknowledgement(environment = process.env) {
  const connectionString = environment.MIGRATION_VALIDATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "MIGRATION_VALIDATION_DATABASE_URL is required. This mutating command does not load DATABASE_URL from .env files.",
    );
  }

  const { targetIdentity, clientConfig } = parseDisposableTarget(connectionString);
  const expectedAcknowledgement = `disposable:${targetIdentity}`;
  if (environment.MIGRATION_VALIDATION_DISPOSABLE_ACK !== expectedAcknowledgement) {
    throw new Error(
      `Refusing migration validation for ${targetIdentity}. ` +
      `Set MIGRATION_VALIDATION_DISPOSABLE_ACK to ${JSON.stringify(expectedAcknowledgement)} only after confirming the target is disposable. ` +
      "This acknowledgement is operator confirmation, not proof that the target is disposable.",
    );
  }

  return { clientConfig, targetIdentity };
}

export async function validatePendingMigrations({
  client,
  migrationDirectory = path.join(process.cwd(), "supabase", "migrations"),
  logger = console,
}) {
  // Fail closed here. If the history cannot be read, treating it as empty could
  // replay the entire migration directory against the target.
  const appliedResult = await client.query(HISTORY_QUERY);
  const applied = new Set(appliedResult.rows.map((row) => row.version));
  const pending = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .filter((file) => !applied.has(file.replace(/\.sql$/, "")));

  await client.query("begin");
  try {
    await client.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    for (const file of pending) {
      await client.query(fs.readFileSync(path.join(migrationDirectory, file), "utf8"));
      logger.log(`validated ${file}`);
    }
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  logger.log(
    `Validated ${pending.length} pending migration(s) in a rollback transaction. ` +
    "No persistent database changes were intended; rollback cannot guarantee the absence of every side effect.",
  );
  return { pending };
}

export async function main({
  environment = process.env,
  Client = pg.Client,
  migrationDirectory,
  logger = console,
} = {}) {
  const { clientConfig, targetIdentity } = requireDisposableTargetAcknowledgement(environment);
  logger.warn(mutationWarning);
  logger.warn(
    `Disposable-target acknowledgement accepted for ${targetIdentity}. ` +
    "This operator confirmation does not independently prove the target is disposable.",
  );

  const client = new Client(clientConfig);
  let operationError;
  try {
    await client.connect();
    return await validatePendingMigrations({ client, migrationDirectory, logger });
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await client.end();
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (import.meta.url === invokedPath) {
  await main();
}
