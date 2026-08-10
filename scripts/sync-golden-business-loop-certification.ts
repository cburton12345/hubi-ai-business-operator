import fs from "node:fs";

function loadEnv(file: string) {
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

if (process.env.CONFIRM_GOLDEN_LOOP_CERTIFICATION !== "YES") {
  throw new Error("Set CONFIRM_GOLDEN_LOOP_CERTIFICATION=YES before certification sync.");
}

const tenantSlug = process.env.TENANT_SLUG ?? "ferocity-qa-demo";
if (tenantSlug !== "ferocity-qa-demo") throw new Error("Certification sync is restricted to the Ferocity QA Demo workspace.");

async function main() {
  const [{ queryPostgres }, { syncGoldenBusinessLoopsForTenant }] = await Promise.all([
    import("../src/lib/db/postgres"),
    import("../src/lib/business-loop/sync-golden-loop")
  ]);

  const tenant = await queryPostgres<{ id: string }>("select id from public.tenants where slug=$1 limit 1", [tenantSlug]);
  const tenantId = tenant?.rows[0]?.id;
  if (!tenantId) throw new Error("Ferocity QA Demo workspace was not found.");

  const result = await syncGoldenBusinessLoopsForTenant(tenantId);
  console.log(JSON.stringify({ tenantId, ...result, liveProviderActionsTriggered: false }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
