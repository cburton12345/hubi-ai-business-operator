import pg from "pg";
import dns from "node:dns";
import { env } from "@/lib/env";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function databaseSslOptions(caBase64 = env.DATABASE_CA_CERT_BASE64) {
  if (!caBase64) {
    return { rejectUnauthorized: false };
  }

  const ca = Buffer.from(caBase64, "base64").toString("utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("DATABASE_CA_CERT_BASE64 is not a valid PEM certificate.");
  }
  return { rejectUnauthorized: true, ca };
}

export function createPostgresPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    const configuredMax = Number(process.env.DATABASE_POOL_MAX ?? 3);
    const max = Number.isFinite(configuredMax) ? Math.max(1, Math.min(Math.floor(configuredMax), 10)) : 3;
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max,
      min: 0,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 20_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
      allowExitOnIdle: true,
      // Render can prefer IPv6 for Supabase hostnames; Supabase's shared pooler is reachable over IPv4.
      family: 4,
      lookup: (
        hostname: string,
        options: dns.LookupOptions,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
      ) => {
        dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
      },
      ssl: databaseSslOptions()
    } as pg.PoolConfig);
  }

  return pool;
}

export async function queryPostgres<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const db = createPostgresPool();

  if (!db) {
    return null;
  }

  try {
    return await db.query<T>(text, values);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      const message = error instanceof Error ? error.message : "Unknown database error";
      console.error(`Postgres query failed: ${message}`);
    }
    return null;
  }
}

export async function withPostgresTransaction<T>(
  operation: (client: pg.PoolClient) => Promise<T>
): Promise<T | null> {
  const db = createPostgresPool();
  if (!db) return null;

  const client = await db.connect().catch(() => null);
  if (!client) return null;
  try {
    await client.query("begin");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (process.env.NODE_ENV === "production") {
      const message = error instanceof Error ? error.message : "Unknown database error";
      console.error(`Postgres transaction failed: ${message}`);
    }
    return null;
  } finally {
    client.release();
  }
}
