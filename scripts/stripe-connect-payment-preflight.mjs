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
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();
try {
  const account = await client.query(
    `select payment_mode, account_status, charges_enabled, payouts_enabled, details_submitted,
            default_currency, last_provider_sync_at
     from public.payment_provider_accounts
     where tenant_id=$1 and provider='stripe'
     order by updated_at desc limit 1`,
    [tenantId]
  );
  const invoices = await client.query(
    `select id, status, total_cents, amount_paid_cents, due_date
     from public.service_invoices
     where tenant_id=$1 and status in ('draft','sent_manually','partially_paid','overdue')
       and total_cents > amount_paid_cents
     order by total_cents asc, created_at desc limit 5`,
    [tenantId]
  );
  const links = await client.query(
    `select status, amount_cents, currency, created_at
     from public.service_invoice_payment_links
     where tenant_id=$1 order by created_at desc limit 5`,
    [tenantId]
  );
  const row = account.rows[0];
  const candidate = invoices.rows[0];
  const connected = Boolean(
    row?.account_status === "connected" && row.charges_enabled && row.payouts_enabled && row.details_submitted
  );
  console.log(JSON.stringify({
    tenantId,
    providerAccount: row ? {
      paymentMode: row.payment_mode,
      accountStatus: row.account_status,
      chargesEnabled: row.charges_enabled,
      payoutsEnabled: row.payouts_enabled,
      detailsSubmitted: row.details_submitted,
      defaultCurrency: row.default_currency,
      lastProviderSyncAt: row.last_provider_sync_at
    } : { accountStatus: "not_found" },
    unpaidInvoiceCandidates: invoices.rows.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      outstandingCents: Math.max(0, invoice.total_cents - invoice.amount_paid_cents),
      dueDate: invoice.due_date
    })),
    recentPaymentLinks: links.rows,
    certification: connected && candidate
      ? {
          status: "ready_for_owner_authorized_low_dollar_test",
          invoiceId: candidate.id,
          outstandingCents: Math.max(0, candidate.total_cents - candidate.amount_paid_cents),
          note: "No payment link was sent and no charge was created by this preflight."
        }
      : {
          status: connected ? "needs_unpaid_test_invoice" : "stripe_connect_not_fully_connected",
          note: "No payment link was sent and no charge was created by this preflight."
        }
  }, null, 2));
} finally {
  await client.end();
}
