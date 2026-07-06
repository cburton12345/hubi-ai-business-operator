import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined
});

await client.connect();

const formResult = await client.query(`
  select f.public_key, f.tenant_id, f.brand_id, b.slug as brand_slug
  from public.forms f
  join public.brands b on b.id = f.brand_id
  where f.active = true and f.public_key is not null
  order by f.created_at desc
  limit 1
`);

const form = formResult.rows[0];
if (!form) {
  await client.end();
  console.error("No active public form key found.");
  process.exit(1);
}

const inserted = await client.query(
  `
  insert into public.labor_worker_availability (
    tenant_id, name, trade, service_area, home_location, phone, email,
    availability_label, travel_radius_miles, rate_label, experience_label,
    source, status, consent_to_contact, last_available_at, metadata_json
  )
  values ($1,'Ferocity Worker Intake Smoke','QA helper','Smoke Test Area','Smoke Test City','555-0100',null,
    'Smoke availability',25,'Smoke rate','Smoke experience','public_form','available',true,now(),$2::jsonb)
  returning id, source, status, consent_to_contact
  `,
  [
    form.tenant_id,
    JSON.stringify({
      source: "public_worker_intake_smoke",
      brandId: form.brand_id,
      brandSlug: form.brand_slug,
      deleteAfterVerify: true
    })
  ]
);

const row = inserted.rows[0];
await client.query("delete from public.labor_worker_availability where id = $1", [row.id]);
await client.end();

if (row.source !== "public_form" || row.status !== "available" || row.consent_to_contact !== true) {
  console.error("Worker intake insert smoke failed.");
  process.exit(1);
}

console.log(`Worker intake insert smoke passed and cleaned up: ${row.id}`);
