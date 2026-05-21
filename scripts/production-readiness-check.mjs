import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "docs/production-safety-runbook.md",
  "docs/customer-onboarding-runbook.md",
  "scripts/run-migrations.mjs",
  "scripts/verify-rls.mjs",
  "scripts/render-smoke.mjs",
  "src/lib/observability/log-error.ts",
  "src/lib/leads/spam-guard.ts",
  "src/lib/auth/workspace-access.test.ts",
  "src/lib/leads/schemas.test.ts",
  "src/lib/leads/spam-guard.test.ts"
];

const requiredEnvNames = [
  "DATABASE_URL",
  "ADMIN_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
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

console.log(`Production readiness check passed with ${migrations.length} migrations and ${requiredFiles.length} required files.`);
