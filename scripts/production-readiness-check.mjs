import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "docs/production-safety-runbook.md",
  "docs/customer-onboarding-runbook.md",
  "scripts/run-migrations.mjs",
  "scripts/verify-rls.mjs",
  "scripts/check-public-company-leaks.mjs",
  "scripts/launch-smoke.mjs",
  "scripts/render-smoke.mjs",
  "src/lib/observability/log-error.ts",
  "src/lib/leads/spam-guard.ts",
  "src/lib/auth/workspace-access.test.ts",
  "src/lib/leads/schemas.test.ts",
  "src/lib/leads/spam-guard.test.ts",
  "src/app/api/billing/portal/route.ts",
  "src/app/reset-password/page.tsx",
  "src/app/reset-password/update/page.tsx",
  "src/app/install/page.tsx",
  "src/app/manifest.ts",
  "src/app/api/integrations/resend/inbound/route.ts",
  "src/app/api/owner-command-center/events/route.ts",
  "src/app/app/autopilot/page.tsx",
  "src/app/app/labor-bench/page.tsx",
  "src/app/workers/[publicKey]/page.tsx",
  "src/lib/labor-bench/get-labor-bench-dashboard.ts",
  "src/lib/labor-bench/public-worker-intake.ts",
  "src/lib/labor-bench/record-labor-owner-event.ts",
  "scripts/smoke-labor-owner-event.mjs",
  "scripts/smoke-worker-intake-insert.mjs",
  "src/app/app/operations-workforce/page.tsx",
  "src/app/app/crew-itinerary/page.tsx",
  "src/lib/operations-workforce/get-operations-workforce-dashboard.ts",
  "src/app/api/operations-workforce/location-pings/route.ts",
  "src/app/api/operations-workforce/field-media/route.ts",
  "docs/operations-workforce.md",
  "docs/business-autopilot.md",
  "docs/labor-bench.md",
  "supabase/migrations/061_marketplacepro_revenue_traffic_events.sql",
  "supabase/migrations/067_operations_workforce_management.sql",
  "supabase/migrations/068_operations_workforce_future_layer.sql",
  "supabase/migrations/069_operations_live_provider_gates.sql",
  "supabase/migrations/080_labor_bench_staffing.sql",
  "supabase/migrations/081_labor_bench_feature_gates.sql"
];

const requiredEnvNames = [
  "DATABASE_URL",
  "ADMIN_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID_STARTER",
  "STRIPE_PRICE_ID_GROWTH",
  "STRIPE_PRICE_ID_OPERATOR",
  "EMAIL_PROVIDER",
  "EMAIL_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_REPLY_TO_ADDRESS",
  "RESEND_INBOUND_WEBHOOK_SECRET",
  "FEROCITY_APP_URL",
  "OWNER_COMMAND_CENTER_TOKEN"
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingFiles.length > 0) {
  throw new Error(`Production readiness files missing: ${missingFiles.join(", ")}`);
}

const runbook = fs.readFileSync(path.join(root, "docs/production-safety-runbook.md"), "utf8");
const missingEnvDocs = requiredEnvNames.filter((name) => !runbook.includes(name));
if (missingEnvDocs.length > 0) {
  throw new Error(`Production runbook is missing env policy entries: ${missingEnvDocs.join(", ")}`);
}

const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql"));
if (migrations.length < 20) {
  throw new Error("Expected migration history to be present before production readiness.");
}

const marketplaceMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "061_marketplacepro_revenue_traffic_events.sql"), "utf8");
const marketplaceTerms = [
  "payment_completed",
  "payment_failed",
  "checkout_session_completed",
  "checkout_session_failed",
  "traffic_event_logged",
  "payments",
  "traffic_events"
];
const missingMarketplaceTerms = marketplaceTerms.filter((term) => !marketplaceMigration.includes(term));
if (missingMarketplaceTerms.length > 0) {
  throw new Error(`MarketplacePro revenue/traffic migration is missing: ${missingMarketplaceTerms.join(", ")}`);
}

const marketplaceAdapter = fs.readFileSync(path.join(root, "src", "lib", "integrations", "marketplacepro.ts"), "utf8");
const adapterTerms = [
  "\"payments\"",
  "\"traffic_events\"",
  "if (table === \"payments\") return \"revenue\";",
  "if (table === \"traffic_events\" || table === \"notifications\" || table === \"follows\") return \"marketing\";"
];
const missingAdapterTerms = adapterTerms.filter((term) => !marketplaceAdapter.includes(term));
if (missingAdapterTerms.length > 0) {
  throw new Error(`MarketplacePro adapter hardening is missing: ${missingAdapterTerms.join(", ")}`);
}

const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
const netlifyConfig = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
  if (!nextConfig.includes(header) || !netlifyConfig.includes(header)) {
    throw new Error(`Security header missing from Next or Netlify config: ${header}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const scriptName of ["public:guard", "predeploy:local", "launch:smoke", "labor:smoke"]) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`package.json is missing required script: ${scriptName}`);
  }
}

const launchSmoke = fs.readFileSync(path.join(root, "scripts", "launch-smoke.mjs"), "utf8");
for (const route of ["/features", "/automations", "/connect-website", "/signup", "/install"]) {
  if (!launchSmoke.includes(route)) {
    throw new Error(`Launch smoke test is missing public route: ${route}`);
  }
}

const laborMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "080_labor_bench_staffing.sql"), "utf8");
for (const term of ["labor_staffing_requests", "labor_worker_availability", "labor_staffing_matches", "enable row level security"]) {
  if (!laborMigration.includes(term)) {
    throw new Error(`Labor Bench migration is missing: ${term}`);
  }
}

const launchSmokeTerms = ["getPublicWorkerRoute", "/workers/"];
for (const term of launchSmokeTerms) {
  if (!launchSmoke.includes(term)) {
    throw new Error(`Launch smoke test is missing worker intake coverage: ${term}`);
  }
}

const routeCrawl = fs.readFileSync(path.join(root, "scripts", "qa-route-crawl.mjs"), "utf8");
for (const route of ["/app/autopilot", "/app/labor-bench", "/app/ai-monitoring"]) {
  if (!routeCrawl.includes(route)) {
    throw new Error(`Route crawl is missing protected route: ${route}`);
  }
}

console.log(`Production readiness check passed with ${migrations.length} migrations and ${requiredFiles.length} required files.`);
