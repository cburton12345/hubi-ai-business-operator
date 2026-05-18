import pg from "pg";
import dns from "node:dns";
import { env } from "@/lib/env";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function createPostgresPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Render can prefer IPv6 for Supabase hostnames; Supabase's shared pooler is reachable over IPv4.
      family: 4,
      lookup: (
        hostname: string,
        options: dns.LookupOptions,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
      ) => {
        dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
      },
      ssl: {
        rejectUnauthorized: false
      }
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
