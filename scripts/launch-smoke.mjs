import fs from "node:fs";
import pg from "pg";

const checks = [
  { path: "/", label: "public landing page", statuses: [200] },
  { path: "/features", label: "features page", statuses: [200] },
  { path: "/automations", label: "automations page", statuses: [200] },
  { path: "/integrations", label: "integrations page", statuses: [200] },
  { path: "/connect-website", label: "website connection page", statuses: [200] },
  { path: "/demo", label: "public demo", statuses: [200] },
  { path: "/demo/tour", label: "public guided tour", statuses: [200] },
  { path: "/pricing", label: "pricing page", statuses: [200] },
  { path: "/start", label: "start page", statuses: [200] },
  { path: "/signup", label: "signup page", statuses: [200] },
  { path: "/install", label: "install app page", statuses: [200] },
  { path: "/business-health-score", label: "business health score", statuses: [200] },
  { path: "/login", label: "login page", statuses: [200] },
  { path: "/reset-password", label: "password reset request", statuses: [200] },
  { path: "/health", label: "public health endpoint", statuses: [200] },
  { path: "/app", label: "protected app redirect", statuses: [200], mustMatch: /\/login\?next=(%2Fapp|\/app)$/ }
];

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (process.env[key]) continue;
    process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();
const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? process.env.FEROCITY_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function getPublicWorkerRoute() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) return null;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
  });
  try {
    await client.connect();
    const result = await client.query(`
      select public_key
      from public.forms
      where active = true and public_key is not null
      order by created_at desc
      limit 1
    `);
    return result.rows[0]?.public_key ? `/workers/${result.rows[0].public_key}` : null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertCheck(check) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: "follow" });
  if (!check.statuses.includes(response.status)) {
    throw new Error(`${check.label} failed: ${response.status} ${response.statusText}`);
  }
  if (check.mustMatch && !check.mustMatch.test(response.url)) {
    throw new Error(`${check.label} landed at ${response.url}, expected ${check.mustMatch}`);
  }
  const body = await response.text();
  if (body.length < 50) {
    throw new Error(`${check.label} returned an unexpectedly small body.`);
  }
  return { label: check.label, status: response.status, url: response.url };
}

const results = [];
const workerRoute = await getPublicWorkerRoute().catch((error) => {
  console.warn(`Worker intake smoke skipped: ${error instanceof Error ? error.message : "lookup failed"}`);
  return null;
});
if (workerRoute) {
  checks.push({ path: workerRoute, label: "public worker intake", statuses: [200] });
}

for (const check of checks) {
  results.push(await assertCheck(check));
}

console.log(`Launch smoke passed for ${baseUrl}`);
for (const result of results) {
  console.log(`- ${result.status} ${result.label}: ${result.url}`);
}
