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

const fallbackPath = path.resolve("public/ferocity-demo-walkthrough.svg");
const fallbackBytes = fs.existsSync(fallbackPath) ? fs.statSync(fallbackPath).size : 0;

const result = {
  builtInFallback: {
    type: "static_walkthrough",
    present: fallbackBytes > 1_000,
    bytes: fallbackBytes,
    finalVideoApproved: false
  },
  configuredOverride: { status: "not_checked" }
};

if (process.env.DATABASE_URL) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const query = await client.query(
      `select enabled, source_type, media_url, poster_url
       from public.platform_public_content
       where content_key = 'featured_demo'
       limit 1`
    );
    const row = query.rows[0];
    result.configuredOverride = row
      ? {
          status: row.enabled && row.media_url ? "active" : "built_in_fallback_will_be_used",
          sourceType: row.source_type,
          hasMediaUrl: Boolean(row.media_url),
          mediaUsesHttps: !row.media_url || /^https:\/\//i.test(row.media_url),
          hasPosterUrl: Boolean(row.poster_url)
        }
      : { status: "built_in_fallback_will_be_used" };
  } finally {
    await client.end();
  }
}

console.log(JSON.stringify(result, null, 2));
if (!result.builtInFallback.present) {
  throw new Error("The safe built-in public demo fallback is missing or unexpectedly small.");
}
if (result.configuredOverride.mediaUsesHttps === false) {
  throw new Error("The configured featured demo URL must use HTTPS.");
}
