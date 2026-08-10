import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const truthPath = path.join(root, "src", "lib", "integrations", "provider-capability-truth.json");
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
const allowedStates = new Set(truth.states ?? []);
const failures = [];

if (!Number.isInteger(truth.version) || truth.version < 1) failures.push("version must be a positive integer");
if (!/^\d{4}-\d{2}-\d{2}$/.test(truth.reviewedAt ?? "")) failures.push("reviewedAt must use YYYY-MM-DD");

for (const [providerKey, provider] of Object.entries(truth.providers ?? {})) {
  if (!allowedStates.has(provider.state)) failures.push(`${providerKey}: unknown state ${provider.state}`);
  if (!provider.label?.trim()) failures.push(`${providerKey}: label is required`);
  if (!provider.summary?.trim()) failures.push(`${providerKey}: summary is required`);
  if (!provider.fallback?.trim()) failures.push(`${providerKey}: fallback is required`);
  if (!Array.isArray(provider.capabilities)) failures.push(`${providerKey}: capabilities must be an array`);
  if ((provider.state === "planned" || provider.state === "approval_blocked") && provider.capabilities?.some((item) => /^(send|write|publish|launch|execute|create_campaign)/.test(item))) {
    failures.push(`${providerKey}: blocked/planned providers cannot claim live write capabilities`);
  }
}

const runtimePath = path.join(root, "src", "lib", "integrations", "connector-runtime.ts");
const runtime = fs.readFileSync(runtimePath, "utf8");
if (!runtime.includes("providerCanExecute")) failures.push("connector-runtime.ts must consume the truth registry");

if (failures.length) {
  console.error("Provider truth guard failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

const counts = Object.values(truth.providers).reduce((result, provider) => {
  result[provider.state] = (result[provider.state] ?? 0) + 1;
  return result;
}, {});
console.log(`Provider truth guard passed (${Object.keys(truth.providers).length} providers).`);
console.log(counts);
