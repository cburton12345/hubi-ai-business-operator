import fs from "node:fs";
import path from "node:path";

const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SECURITY_HMAC_KEY",
  "FEROCITY_APP_URL",
  "EMAIL_PROVIDER",
  "EMAIL_API_KEY",
  "RESEND_INBOUND_WEBHOOK_SECRET",
  "MCP_ALLOWED_HOSTS",
];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (!(key in process.env)) process.env[key] = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));

const keyFileArg = process.argv.find((arg) => arg.startsWith("--keys-file="));
let configured = new Set(Object.entries(process.env).filter(([, value]) => String(value ?? "").trim()).map(([key]) => key));
let source = "local release environment";

if (keyFileArg) {
  const file = path.resolve(keyFileArg.slice("--keys-file=".length));
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = Array.isArray(parsed) ? parsed : Object.keys(parsed);
  configured = new Set(keys.map((entry) => typeof entry === "string" ? entry : entry?.key).filter(Boolean));
  source = "provided Netlify key-name inventory";
}

console.log(`Release environment key check (${source}; values are never printed)`);
const missing = [];
for (const key of required) {
  const present = configured.has(key);
  console.log(`- ${key}: ${present ? "configured" : "MISSING"}`);
  if (!present) missing.push(key);
}
if (missing.length) {
  throw new Error(`Missing required release keys: ${missing.join(", ")}`);
}
console.log(`Environment key check passed (${required.length}/${required.length}).`);
