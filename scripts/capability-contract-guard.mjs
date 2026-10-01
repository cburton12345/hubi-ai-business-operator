import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "src", "lib", "capabilities", "execution-contracts.json");
const callPath = path.join(root, "src", "lib", "office-manager", "call-management.ts");
const data = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];
const allowedStates = new Set(data.states ?? []);

if (!Number.isInteger(data.version) || data.version < 1) failures.push("version must be a positive integer");
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt ?? "")) failures.push("reviewedAt must use YYYY-MM-DD");

for (const [key, contract] of Object.entries(data.contracts ?? {})) {
  if (!allowedStates.has(contract.state)) failures.push(`${key}: invalid state ${contract.state}`);
  for (const field of ["control", "storedState", "executor", "limitation", "evidence"]) {
    if (!contract[field]?.trim()) failures.push(`${key}: ${field} is required`);
  }
  if (contract.state === "certified_live" && /not certified|remains open|still required|awaits deployment/i.test(`${contract.limitation} ${contract.evidence}`)) {
    failures.push(`${key}: certified_live contradicts its limitation/evidence`);
  }
}

const callSource = fs.readFileSync(callPath, "utf8");
const strategyBlock = callSource.match(/export const callHandlingStrategies = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
const sourceStrategies = [...strategyBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
for (const strategy of sourceStrategies) {
  const state = data.callHandlingStrategies?.[strategy];
  const contract = data.contracts?.[`calls.${strategy}`];
  if (!state) failures.push(`calls.${strategy}: missing callHandlingStrategies state`);
  if (!contract) failures.push(`calls.${strategy}: missing execution contract`);
  if (state && contract && state !== contract.state) failures.push(`calls.${strategy}: strategy state does not match contract state`);
}

for (const strategy of Object.keys(data.callHandlingStrategies ?? {})) {
  if (!sourceStrategies.includes(strategy)) failures.push(`calls.${strategy}: contract exists for a strategy not exposed by runtime`);
}

for (const required of [
  "calls.transfer", "calls.managed_number", "integrations.customer_revoke", "messaging.ferocity_connect", "messaging.scheduled_sms",
  "social.tiktok_login", "social.tiktok_publish", "social.tiktok_ads",
  "social.facebook_marketplace", "email.mailbox_read", "email.mailbox_send",
  "marketing.organic_publish", "marketing.paid_spend", "expenses.document_intelligence"
]) {
  if (!data.contracts?.[required]) failures.push(`${required}: required high-risk execution contract is missing`);
}

if (failures.length) {
  console.error("Capability contract guard failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

const counts = Object.values(data.contracts).reduce((result, contract) => {
  result[contract.state] = (result[contract.state] ?? 0) + 1;
  return result;
}, {});
console.log(`Capability contract guard passed (${Object.keys(data.contracts).length} high-risk capabilities; ${sourceStrategies.length} call strategies covered).`);
console.log(counts);
