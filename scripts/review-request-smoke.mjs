import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

loadLocalEnv();
assert(process.env.DATABASE_URL, "DATABASE_URL is required for review-request smoke.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const nonce = crypto.randomBytes(5).toString("hex");
await client.connect();
await client.query("begin");

try {
  const target = await client.query(`
    select t.id as tenant_id, b.id as brand_id
    from public.tenants t
    join public.brands b on b.tenant_id = t.id and b.status = 'active'
    where t.status in ('active', 'trial')
    order by t.created_at, b.created_at
    limit 1
  `);
  const { tenant_id: tenantId, brand_id: brandId } = target.rows[0] ?? {};
  assert(tenantId && brandId, "An active workspace and brand are required.");

  const customer = await client.query(
    `insert into public.customers (tenant_id, brand_id, name, email)
     values ($1, $2, $3, $4) returning id`,
    [tenantId, brandId, `Review Smoke ${nonce}`, `review-smoke-${nonce}@example.com`]
  );
  const workflow = await client.query(
    `insert into public.review_request_workflows (
       tenant_id, brand_id, customer_id, trigger_event, channel, status, scheduled_for, ai_response_draft
     ) values ($1, $2, $3, 'manual', 'email', 'draft', now(), 'Thank you for choosing us. We welcome your honest feedback.')
     returning id, public_token::text`,
    [tenantId, brandId, customer.rows[0].id]
  );
  const workflowId = workflow.rows[0].id;
  const publicToken = workflow.rows[0].public_token;
  assert(publicToken, "A stable public review token was not generated.");

  await client.query(
    `insert into public.review_request_destinations (
       tenant_id, brand_id, destination_key, provider, display_name, review_url, priority, status
     ) values
       ($1, null, 'custom:workspace-smoke', 'custom', 'Workspace review site', 'https://example.com/workspace-review', 200, 'active'),
       ($1, $2, 'google_business_profile:brand-smoke', 'google_business_profile', 'Review us on Google', 'https://example.com/google-review', 10, 'active')`,
    [tenantId, brandId]
  );

  const appUrl = "https://ferocity.live";
  const publicUrl = `${appUrl}/review/${publicToken}`;
  const message = `Thank you for choosing us. We welcome your honest feedback.\n\nShare your feedback: ${publicUrl}`;
  assert(message.includes(publicToken), "Outbound review message did not contain the stable public token.");

  const destinations = await client.query(
    `select provider, display_name, review_url
     from public.review_request_destinations
     where tenant_id = $1 and status = 'active' and (brand_id = $2 or brand_id is null)
     order by case when brand_id = $2 then 0 else 1 end, priority, created_at`,
    [tenantId, brandId]
  );
  assert(destinations.rows.length === 2, "Expected brand and workspace fallback destinations.");
  assert(destinations.rows[0].provider === "google_business_profile", "Brand-specific Google destination did not resolve first.");

  await client.query(
    `update public.review_request_workflows
     set rating_received = 2, feedback_text = 'Please contact me.', feedback_received_at = now(),
         status = 'completed', negative_interception_status = 'needs_service_recovery'
     where tenant_id = $1 and id = $2`,
    [tenantId, workflowId]
  );
  const recovery = await client.query(
    `select rating_received, feedback_received_at is not null as received,
       negative_interception_status
     from public.review_request_workflows where tenant_id = $1 and id = $2`,
    [tenantId, workflowId]
  );
  assert(recovery.rows[0].rating_received === 2, "Private rating was not stored.");
  assert(recovery.rows[0].received === true, "Private feedback timestamp was not stored.");
  assert(recovery.rows[0].negative_interception_status === "needs_service_recovery", "Low feedback did not request service recovery.");

  console.log(`Review request smoke passed: token, neutral public URL, destination fallback, private feedback, and service recovery verified.`);
  console.log("Cleanup: transaction rolled back; no smoke records saved.");
  await client.query("rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
