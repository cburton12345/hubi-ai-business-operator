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

const QA_EMAIL = process.env.QA_DEMO_EMAIL ?? "qa-demo@ferocity.live";
const QA_PASSWORD = process.env.QA_DEMO_PASSWORD;
const QA_TENANT_SLUG = "ferocity-qa-demo";
const QA_BRAND_SLUG = "qa-demo-services";
const RESET = process.argv.includes("--reset");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!QA_PASSWORD || QA_PASSWORD.length < 8) throw new Error("QA_DEMO_PASSWORD is required and must be at least 8 characters.");
if (RESET && process.env.CONFIRM_QA_SEED_RESET !== "YES") {
  throw new Error("Refusing reset. Set CONFIRM_QA_SEED_RESET=YES to reset only the Ferocity QA Demo workspace.");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});

function credentialParts(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return { hash, salt, iterations };
}

async function one(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0];
}

await client.connect();

try {
  await client.query("begin");

  const existingTenant = await one("select id from public.tenants where slug = $1", [QA_TENANT_SLUG]);
  if (RESET && existingTenant?.id) {
    await client.query(
      `
      delete from public.tenants
      where id = $1
        and slug = $2
        and name = 'Ferocity QA Demo'
      `,
      [existingTenant.id, QA_TENANT_SLUG]
    );
  }

  const creds = credentialParts(QA_PASSWORD);
  const user = await one(
    `
    insert into public.users (email, name, platform_role)
    values ($1, 'QA Demo User', 'user')
    on conflict (email) do update
    set name = excluded.name,
        platform_role = 'user',
        updated_at = now()
    returning id
    `,
    [QA_EMAIL]
  );

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
    [user.id, creds.hash, creds.salt, creds.iterations]
  );

  const tenant = await one(
    `
    insert into public.tenants (name, slug, account_type, status, billing_status, plan_key, owner_user_id)
    values ('Ferocity QA Demo', $1, 'customer', 'trial', 'trialing', 'starter', $2)
    on conflict (slug) do update
    set name = 'Ferocity QA Demo',
        account_type = 'customer',
        status = 'trial',
        billing_status = 'trialing',
        plan_key = 'starter',
        owner_user_id = excluded.owner_user_id,
        updated_at = now()
    returning id
    `,
    [QA_TENANT_SLUG, user.id]
  );

  await client.query(
    `
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values ($1, $2, 'owner', 'active')
    on conflict (tenant_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now()
    `,
    [tenant.id, user.id]
  );

  const brand = await one(
    `
    insert into public.brands (
      tenant_id, name, slug, business_model, industry, vertical, description, primary_goal, primary_location, status
    )
    values (
      $1, 'QA Demo Services', $2, 'local_service', 'Home services', 'qa_demo',
      'Safe QA workspace for testing Ferocity without real customer data.',
      'Verify lead, customer, estimate, job, invoice, payment, review, automation, and warning paths.',
      'Demo City',
      'active'
    )
    on conflict (tenant_id, slug) do update
    set name = excluded.name,
        description = excluded.description,
        primary_goal = excluded.primary_goal,
        status = 'active',
        updated_at = now()
    returning id
    `,
    [tenant.id, QA_BRAND_SLUG]
  );

  await client.query(
    `
    insert into public.brand_users (tenant_id, brand_id, user_id, role)
    values ($1, $2, $3, 'owner')
    on conflict (brand_id, user_id) do update set role = 'owner'
    `,
    [tenant.id, brand.id, user.id]
  );

  const newLead = await one(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message, lead_type,
      status, qualification_status, priority, lead_score, consent_to_contact, metadata_json
    )
    values (
      $1, $2, 'website_form', 'qa_seed_new', 'QA New Lead', 'qa-new-lead@example.com', '555-0101',
      'I need a fast quote.', 'quote', 'new', 'needs_review', 'high', null, true,
      '{"seededFor":"qa_workspace","qaRecord":"new_lead"}'::jsonb
    )
    returning id
    `,
    [tenant.id, brand.id]
  );

  const scoredLead = await one(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message, lead_type,
      status, qualification_status, priority, lead_score, consent_to_contact, metadata_json
    )
    values (
      $1, $2, 'marketplacepro', 'qa_seed_scored', 'QA Scored Lead', 'qa-scored-lead@example.com', '555-0102',
      'Storm damage job, wants a callback today.', 'quote', 'contacted', 'qualified', 'high', 87, true,
      '{"seededFor":"qa_workspace","qaRecord":"scored_lead"}'::jsonb
    )
    returning id
    `,
    [tenant.id, brand.id]
  );

  const customer = await one(
    `
    insert into public.customers (
      tenant_id, brand_id, source_lead_id, name, email, phone, city, state, customer_type, status, notes, ai_summary
    )
    values (
      $1, $2, $3, 'QA Customer', 'qa-customer@example.com', '555-0103', 'Demo City', 'WI',
      'residential', 'active', 'Seeded QA customer.', 'Customer created by the safe QA seed.'
    )
    returning id
    `,
    [tenant.id, brand.id, scoredLead.id]
  );

  const estimate = await one(
    `
    insert into public.service_estimates (
      tenant_id, brand_id, customer_id, source_lead_id, title, status, subtotal_cents, total_cents,
      customer_summary, internal_notes, manual_follow_up_draft
    )
    values (
      $1, $2, $3, $4, 'QA Roof Repair Estimate', 'sent_manually', 480000, 480000,
      'Seeded estimate for QA verification.', 'No real customer. QA only.',
      'Hi, checking whether you had questions on the estimate.'
    )
    returning id
    `,
    [tenant.id, brand.id, customer.id, scoredLead.id]
  );

  await client.query(
    `
    insert into public.estimate_line_items (tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents, position)
    values ($1, $2, 'QA labor and materials', 'Seeded line item for estimate QA.', 1, 480000, 480000, 1)
    `,
    [tenant.id, estimate.id]
  );

  const job = await one(
    `
    insert into public.service_jobs (
      tenant_id, brand_id, customer_id, source_lead_id, estimate_id, title, status, scheduled_start, scheduled_end,
      service_area, dispatcher_notes, completion_notes, ai_next_action
    )
    values (
      $1, $2, $3, $4, $5, 'QA Completed Roof Repair', 'completed', now() - interval '1 day', now() - interval '20 hours',
      'Demo City', 'QA schedule item.', 'Seeded as complete so review workflow can be tested.',
      'Prepare review request after verifying the customer experience.'
    )
    returning id
    `,
    [tenant.id, brand.id, customer.id, scoredLead.id, estimate.id]
  );

  const invoice = await one(
    `
    insert into public.service_invoices (
      tenant_id, brand_id, customer_id, job_id, estimate_id, title, status, subtotal_cents, total_cents,
      amount_paid_cents, due_date, internal_notes, manual_payment_notes
    )
    values (
      $1, $2, $3, $4, $5, 'QA Invoice', 'partially_paid', 480000, 480000,
      125000, current_date - interval '2 days', 'Seeded unpaid balance.', 'Partial manual payment seeded.'
    )
    returning id
    `,
    [tenant.id, brand.id, customer.id, job.id, estimate.id]
  );

  const paymentLink = await one(
    `
    insert into public.service_invoice_payment_links (
      tenant_id, brand_id, customer_id, invoice_id, provider, status, amount_cents, currency, metadata_json
    )
    values ($1, $2, $3, $4, 'manual', 'ready', 355000, 'usd', '{"seededFor":"qa_workspace"}'::jsonb)
    returning id
    `,
    [tenant.id, brand.id, customer.id, invoice.id]
  );

  const payment = await one(
    `
    insert into public.service_invoice_payments (
      tenant_id, brand_id, customer_id, invoice_id, payment_link_id, provider, status, amount_cents, net_cents, currency, paid_at, metadata_json
    )
    values ($1, $2, $3, $4, $5, 'manual', 'succeeded', 125000, 125000, 'usd', now() - interval '1 day', '{"seededFor":"qa_workspace"}'::jsonb)
    returning id
    `,
    [tenant.id, brand.id, customer.id, invoice.id, paymentLink.id]
  );

  await client.query(
    `
    insert into public.service_ledger_entries (
      tenant_id, brand_id, customer_id, invoice_id, payment_id, entry_type, direction, amount_cents, currency, description, provider, metadata_json
    )
    values ($1, $2, $3, $4, $5, 'payment_received', 'credit', 125000, 'usd', 'QA manual payment recorded.', 'manual', '{"seededFor":"qa_workspace"}'::jsonb)
    `,
    [tenant.id, brand.id, customer.id, invoice.id, payment.id]
  );

  await client.query(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, customer_id, lead_id, job_id, trigger_event, channel, status, scheduled_for, ai_response_draft, metadata_json
    )
    values (
      $1, $2, $3, $4, $5, 'job_completed', 'email', 'draft', now() + interval '1 day',
      'Thanks again for choosing us. If everything went well, would you be open to leaving a quick review?',
      '{"seededFor":"qa_workspace","qaRecord":"review_ready_completed_job"}'::jsonb
    )
    `,
    [tenant.id, brand.id, customer.id, scoredLead.id, job.id]
  );

  await client.query(
    `
    insert into public.owner_reminders (
      tenant_id, user_id, title, body, reminder_type, priority, status, remind_at, next_due_at, action_url, metadata_json
    )
    values (
      $1, $2, 'QA automation action', 'Seeded reminder proves automation/task surfaces have a safe test record.',
      'task', 'medium', 'active', now() + interval '2 hours', now() + interval '2 hours',
      '/app/attention-command', '{"seededFor":"qa_workspace","qaRecord":"automation_action"}'::jsonb
    )
    `,
    [tenant.id, user.id]
  );

  await client.query(
    `
    insert into public.app_error_events (tenant_id, source, severity, message, metadata_json)
    values (
      $1, 'qa.seed.non_production_warning', 'warning', 'Deliberate QA warning for observability verification.',
      '{"seededFor":"qa_workspace","nonProduction":true,"category":"qa_warning","retryable":false}'::jsonb
    )
    `,
    [tenant.id]
  );

  await client.query("commit");
  console.log(JSON.stringify({ email: QA_EMAIL, tenantSlug: QA_TENANT_SLUG, brandSlug: QA_BRAND_SLUG }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
