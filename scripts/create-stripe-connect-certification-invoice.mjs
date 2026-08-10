import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
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
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const title = "[CERTIFICATION] Stripe Connect $1 payment";
const amountCents = 100;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  await client.query("begin");
  const existing = await client.query(
    `select id, customer_id, status, total_cents, amount_paid_cents
     from public.service_invoices
     where tenant_id=$1 and title=$2 and status <> 'void'
     order by created_at desc limit 1`,
    [tenantId, title]
  );
  if (existing.rows[0]) {
    await client.query("commit");
    console.log(JSON.stringify({ created: false, tenantId, invoice: existing.rows[0] }, null, 2));
    process.exit(0);
  }

  let customer = await client.query(
    `select id, name from public.customers
     where tenant_id=$1 order by updated_at desc, created_at desc limit 1`,
    [tenantId]
  );
  if (!customer.rows[0]) {
    customer = await client.query(
      `insert into public.customers (tenant_id, name, customer_type, status, notes)
       values ($1, '[CERTIFICATION] Stripe payment customer', 'other', 'active',
         'Synthetic QA record for the controlled $1 Stripe Connect certification only.')
       returning id, name`,
      [tenantId]
    );
  }

  const invoice = await client.query(
    `insert into public.service_invoices (
       tenant_id, customer_id, title, status, subtotal_cents, total_cents,
       due_date, internal_notes, manual_payment_notes
     ) values (
       $1, $2, $3, 'draft', $4, $4, current_date + interval '1 day',
       'Controlled production Stripe Connect certification. Do not reuse for customer billing.',
       'Certification-only $1 online payment. Keep clearly labeled and auditable.'
     ) returning id, customer_id, status, total_cents, amount_paid_cents`,
    [tenantId, customer.rows[0].id, title, amountCents]
  );
  await client.query(
    `insert into public.invoice_line_items (
       tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents, position
     ) values ($1, $2, 'Stripe Connect certification', 'Controlled end-to-end payment test.', 1, $3, $3, 1)`,
    [tenantId, invoice.rows[0].id, amountCents]
  );
  await client.query("commit");
  console.log(JSON.stringify({
    created: true,
    tenantId,
    customer: { id: customer.rows[0].id, displayName: customer.rows[0].name },
    invoice: invoice.rows[0]
  }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
