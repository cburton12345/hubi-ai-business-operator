import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const appliedResult = await client.query(
    "select version from public.schema_migrations order by version"
  ).catch(() => ({ rows: [] }));
  const applied = new Set(appliedResult.rows.map((row) => row.version));
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const pending = fs.readdirSync(directory).filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .filter((file) => !applied.has(file.replace(/\.sql$/, "")));

  await client.query("begin");
  for (const file of pending) {
    await client.query(fs.readFileSync(path.join(directory, file), "utf8"));
    console.log(`validated ${file}`);
  }
  await client.query("rollback");
  console.log(`Validated ${pending.length} pending migration(s) without persisting changes.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
