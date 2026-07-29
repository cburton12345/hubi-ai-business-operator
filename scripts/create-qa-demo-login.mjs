import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

loadLocalEnv();

const email = process.env.QA_DEMO_EMAIL ?? "qa-demo@ferocity.live";
const password = process.env.QA_DEMO_PASSWORD;
const name = process.env.QA_DEMO_NAME ?? "QA Demo User";
const tenantName = "Ferocity QA Demo";
const tenantSlug = "ferocity-qa-demo";
const brandName = "QA Demo Services";
const brandSlug = "qa-demo-services";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

if (!password || password.length < 8) {
  throw new Error("QA_DEMO_PASSWORD is required and must be at least 8 characters.");
}

const iterations = 120000;
const keyLength = 64;
const digest = "sha512";
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});

await client.connect();

try {
  await client.query("begin");

  const user = await client.query(
    `
    insert into public.users (email, name, platform_role)
    values ($1, $2, 'user')
    on conflict (email) do update
    set name = excluded.name,
        platform_role = 'user',
        updated_at = now()
    returning id
    `,
    [email, name]
  );
  const userId = user.rows[0].id;

  await client.query(
    `
    insert into public.user_password_credentials (user_id, password_hash, password_salt, password_iterations, must_reset_password)
    values ($1, $2, $3, $4, false)
    on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        password_iterations = excluded.password_iterations,
        must_reset_password = false,
        updated_at = now()
    `,
    [userId, hash, salt, iterations]
  );

  const tenant = await client.query(
    `
    insert into public.tenants (name, slug, account_type, status, billing_status, plan_key, owner_user_id)
    values ($1, $2, 'customer', 'trial', 'trialing', 'starter', $3)
    on conflict (slug) do update
    set name = excluded.name,
        account_type = 'customer',
        status = 'trial',
        billing_status = 'trialing',
        plan_key = 'starter',
        owner_user_id = excluded.owner_user_id,
        updated_at = now()
    returning id
    `,
    [tenantName, tenantSlug, userId]
  );
  const tenantId = tenant.rows[0].id;

  await client.query(
    `
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values ($1, $2, 'owner', 'active')
    on conflict (tenant_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = now()
    `,
    [tenantId, userId]
  );

  const brand = await client.query(
    `
    insert into public.brands (
      tenant_id, name, slug, business_model, industry, vertical, description, primary_goal, primary_location, status
    )
    values (
      $1, $2, $3, 'local_service', 'Home services', 'qa_demo',
      'Safe QA demo workspace for testing Ferocity features.',
      'Test leads, follow-up, jobs, invoices, reviews, and integrations without real customer data.',
      'Demo City',
      'active'
    )
    on conflict (tenant_id, slug) do update
    set name = excluded.name,
        industry = excluded.industry,
        description = excluded.description,
        primary_goal = excluded.primary_goal,
        status = 'active',
        updated_at = now()
    returning id
    `,
    [tenantId, brandName, brandSlug]
  );
  const brandId = brand.rows[0].id;

  await client.query(
    `
    insert into public.brand_users (tenant_id, brand_id, user_id, role)
    values ($1, $2, $3, 'owner')
    on conflict (brand_id, user_id) do update
    set role = 'owner'
    `,
    [tenantId, brandId, userId]
  );

  await client.query(
    `
    insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
    values ($1, $2, 'QA Demo Lead Form', 'qa-demo-lead-form', 'qa-demo-ferocity-live', true)
    on conflict (brand_id, slug) do update
    set name = excluded.name,
        public_key = excluded.public_key,
        active = true
    `,
    [tenantId, brandId]
  );

  await client.query(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message, lead_type,
      status, qualification_status, priority, lead_score, consent_to_contact, metadata_json
    )
    select
      $1, $2, 'website_form', 'qa_demo_seed', 'Sample Lead', 'sample-lead@example.com', '555-0101',
      'I need a quote and fast follow-up.', 'quote', 'new', 'needs_review', 'high', 82, true,
      '{"seededFor":"qa_demo"}'::jsonb
    where not exists (
      select 1
      from public.leads
      where tenant_id = $1
        and source_detail = 'qa_demo_seed'
        and email = 'sample-lead@example.com'
    )
    `,
    [tenantId, brandId]
  );

  await client.query(
    `
    with duplicate_seed_leads as (
      select id,
             row_number() over (order by created_at asc, id asc) as duplicate_rank
      from public.leads
      where tenant_id = $1
        and source_detail = 'qa_demo_seed'
        and email = 'sample-lead@example.com'
    )
    delete from public.leads
    where id in (
      select id from duplicate_seed_leads where duplicate_rank > 1
    )
    `,
    [tenantId]
  );

  await client.query("commit");
  console.log(JSON.stringify({ email, tenantSlug, brandSlug }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
