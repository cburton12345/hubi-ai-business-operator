import pg from "pg";
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
      ssl: {
        rejectUnauthorized: false
      }
    });
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
  } catch {
    return null;
  }
}
