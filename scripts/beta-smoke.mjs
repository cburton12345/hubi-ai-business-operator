import pg from "pg";

const { Client } = pg;
const tenantSlug = process.env.BETA_TENANT_SLUG ?? "beta-roofing-co";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  const result = await client.query(
    `
    select
      t.slug,
      count(distinct b.id) as brands,
      count(distinct f.id) as forms,
      count(distinct s.id) as services,
      count(distinct k.id) as keywords
    from public.tenants t
    left join public.brands b on b.tenant_id = t.id
    left join public.forms f on f.tenant_id = t.id
    left join public.brand_services s on s.tenant_id = t.id
    left join public.brand_seo_keywords k on k.tenant_id = t.id
    where t.slug = $1
    group by t.slug
    `,
    [tenantSlug]
  );
  const row = result.rows[0];
  if (!row || Number(row.brands) < 1 || Number(row.forms) < 1 || Number(row.services) < 1 || Number(row.keywords) < 1) {
    throw new Error(`Beta workspace ${tenantSlug} is incomplete.`);
  }
  console.log(`Beta smoke passed for ${tenantSlug}`);
} finally {
  await client.end();
}
