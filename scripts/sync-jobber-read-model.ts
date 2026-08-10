import fs from "node:fs";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
async function main() {
  const { syncJobberReadModel } = await import("../src/lib/integrations/jobber/read-model");
  const slug = process.env.TENANT_SLUG ?? "ferocity-qa-demo";
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tenant = await client.query("select id from public.tenants where slug=$1 limit 1", [slug]);
    if (!tenant.rows[0]) throw new Error(`Tenant ${slug} was not found.`);
    const result = await syncJobberReadModel({ tenantId: tenant.rows[0].id, pageSize: 25, maxPagesPerResource: 2 });
    console.log(JSON.stringify({ tenantSlug: slug, ...result }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
