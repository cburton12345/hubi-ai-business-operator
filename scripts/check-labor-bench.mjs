import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to check Labor Bench tables.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined
});

await client.connect();

const result = await client.query(`
  select
    to_regclass('public.labor_staffing_requests') as requests,
    to_regclass('public.labor_worker_availability') as workers,
    to_regclass('public.labor_staffing_matches') as matches
`);

await client.end();

const row = result.rows[0] ?? {};
console.log(JSON.stringify(row, null, 2));

if (!row.requests || !row.workers || !row.matches) {
  process.exit(1);
}
