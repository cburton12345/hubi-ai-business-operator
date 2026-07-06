import fs from "node:fs";
import pg from "pg";

const baseUrl = process.argv[2] || "http://127.0.0.1:3031";

const publicRoutes = [
  "/",
  "/about",
  "/features",
  "/automations",
  "/pricing",
  "/integrations",
  "/connect-website",
  "/demo",
  "/demo/tour",
  "/demo/acme-roofing",
  "/start",
  "/signup",
  "/login",
  "/reset-password",
  "/business-health-score",
  "/website-grader",
  "/install",
  "/privacy",
  "/terms",
  "/health",
  "/ferocity.js",
];

const protectedRoutes = [
  "/app",
  "/app/autopilot",
  "/app/ai-workforce",
  "/app/business-brain",
  "/app/automation-timeline",
  "/app/owner-command-center",
  "/app/ai-monitoring",
  "/app/lead-command",
  "/app/service-command",
  "/app/crew-itinerary",
  "/app/labor-bench",
  "/app/cash-collection",
  "/app/growth-calendar",
  "/app/operations-workforce",
  "/app/feature-map",
  "/app/build-system",
  "/app/website",
  "/app/seo",
  "/app/marketing",
  "/app/review",
  "/app/service",
  "/app/billing",
  "/app/integrations",
  "/app/credentials",
  "/app/settings",
  "/app/system-health",
  "/app/go-live",
  "/app/notifications",
  "/app/webhooks",
  "/app/lifeops-connections",
  "/app/personal-ops",
];

function urlFor(route) {
  return new URL(route, baseUrl).toString();
}

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

async function checkPublic(route) {
  const response = await fetch(urlFor(route), { redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  const looksLikeError =
    body.includes("Application error") ||
    body.includes("Unhandled Runtime Error") ||
    body.includes("NEXT_REDIRECT") ||
    body.includes("<title>404: This page could not be found</title>");

  const failures = [];
  if (response.status >= 400) failures.push(`HTTP ${response.status}`);
  if (looksLikeError) failures.push("error-like body");
  if (contentType.includes("text/html") && body.trim().length < 1000) {
    failures.push("suspiciously small HTML body");
  }

  return {
    route,
    status: response.status,
    redirected: response.redirected,
    finalUrl: response.url,
    failures,
  };
}

async function checkProtected(route) {
  const response = await fetch(urlFor(route), { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const failures = [];
  if (![302, 303, 307, 308].includes(response.status)) {
    failures.push(`expected auth redirect, got HTTP ${response.status}`);
  }
  if (!location.includes("/login")) {
    failures.push(`expected login redirect, got ${location || "(none)"}`);
  }

  return {
    route,
    status: response.status,
    location,
    failures,
  };
}

async function main() {
  const results = [];
  const workerRoute = await getPublicWorkerRoute().catch((error) => {
    console.warn(`WARN worker intake route skipped: ${error instanceof Error ? error.message : "lookup failed"}`);
    return null;
  });
  if (workerRoute) publicRoutes.push(workerRoute);

  for (const route of publicRoutes) {
    results.push(await checkPublic(route));
  }
  for (const route of protectedRoutes) {
    results.push(await checkProtected(route));
  }

  const failures = results.filter((result) => result.failures.length > 0);
  for (const result of results) {
    const state = result.failures.length > 0 ? "FAIL" : "OK";
    const target = result.location || result.finalUrl || "";
    console.log(`${state.padEnd(4)} ${String(result.status).padEnd(3)} ${result.route} ${target}`);
    for (const failure of result.failures) {
      console.log(`     - ${failure}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} route checks failed.`);
    process.exit(1);
  }

  console.log(`\n${results.length} route checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
