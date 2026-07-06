import fs from "node:fs";
import pg from "pg";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3037";

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
  console.error("DATABASE_URL is required.");
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
  select public_key
  from public.forms
  where active = true and public_key is not null
  order by created_at desc
  limit 1
`);
await client.end();

const publicKey = result.rows[0]?.public_key;
if (!publicKey) {
  console.error("No active public form key found for worker intake smoke.");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/workers/${encodeURIComponent(publicKey)}`;
const response = await fetch(url, { redirect: "manual" });
const body = await response.text();

if (response.status !== 200 || !body.includes("Submit availability")) {
  console.error(`Worker intake smoke failed: ${response.status} ${url}`);
  process.exit(1);
}

console.log(`Worker intake smoke passed: ${url}`);
