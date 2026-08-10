import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");
if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
  throw new Error("DATABASE_URL and STRIPE_SECRET_KEY are required.");
}

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const invoiceTitle = "[CERTIFICATION] Stripe Connect $1 payment";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
const feeBps = Math.min(Math.max(Number(process.env.FEROCITY_MANAGED_PAYMENT_FEE_BPS ?? 150), 0), 1000);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  const invoiceResult = await client.query(
    `select i.id, i.tenant_id, i.brand_id, i.customer_id, i.title, i.total_cents, i.amount_paid_cents,
            c.email as customer_email
     from public.service_invoices i
     join public.customers c on c.id=i.customer_id
     where i.tenant_id=$1 and i.title=$2 and i.status <> 'void'
     order by i.created_at desc limit 1`,
    [tenantId, invoiceTitle]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) throw new Error("Certification invoice was not found.");
  const amountCents = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  if (amountCents !== 100) throw new Error(`Expected a $1 outstanding certification balance; found ${amountCents} cents.`);

  const accountResult = await client.query(
    `select provider_account_id, charges_enabled, payouts_enabled, details_submitted
     from public.payment_provider_accounts
     where tenant_id=$1 and provider='stripe' and account_status='connected'
     order by updated_at desc limit 1`,
    [tenantId]
  );
  const account = accountResult.rows[0];
  if (!account?.provider_account_id || !account.charges_enabled || !account.payouts_enabled || !account.details_submitted) {
    throw new Error("Stripe Connect account is not fully enabled for direct charges and payouts.");
  }

  let linkResult = await client.query(
    `select id, status, payment_url from public.service_invoice_payment_links
     where tenant_id=$1 and invoice_id=$2 and amount_cents=$3
       and payment_mode='stripe_connect_direct' and status in ('draft','ready','sent')
     order by created_at desc limit 1`,
    [tenantId, invoice.id, amountCents]
  );
  let link = linkResult.rows[0];
  const platformFeeCents = Math.max(0, Math.floor((amountCents * feeBps) / 10000));
  if (!link) {
    linkResult = await client.query(
      `insert into public.service_invoice_payment_links (
         tenant_id, brand_id, customer_id, invoice_id, provider, status, amount_cents, currency,
         payment_mode, connected_account_id, platform_fee_cents, net_to_business_cents, metadata_json
       ) values ($1,$2,$3,$4,'stripe','draft',$5,'usd','stripe_connect_direct',$6,$7,$8,
         '{"certification":true,"purpose":"controlled_low_dollar_e2e"}'::jsonb)
       returning id, status, payment_url`,
      [tenantId, invoice.brand_id, invoice.customer_id, invoice.id, amountCents, account.provider_account_id,
       platformFeeCents, amountCents - platformFeeCents]
    );
    link = linkResult.rows[0];
  }
  if (link.payment_url) {
    console.log(JSON.stringify({ created: false, invoiceId: invoice.id, paymentLinkId: link.id, paymentUrl: link.payment_url }, null, 2));
    process.exit(0);
  }

  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": invoice.title,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][quantity]": "1",
    success_url: `${appUrl}/portal/payment-success?invoice=${encodeURIComponent(invoice.id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/portal/payment-cancel?invoice=${encodeURIComponent(invoice.id)}`,
    "metadata[ferocity_kind]": "service_invoice_payment",
    "metadata[tenant_id]": tenantId,
    "metadata[invoice_id]": invoice.id,
    "metadata[customer_id]": invoice.customer_id,
    "metadata[payment_link_id]": link.id,
    "metadata[amount_cents]": String(amountCents),
    "metadata[currency]": "usd",
    "metadata[payment_mode]": "stripe_connect_direct",
    "metadata[connected_account_id]": account.provider_account_id,
    "metadata[platform_fee_cents]": String(platformFeeCents)
  });
  if (platformFeeCents > 0) body.set("payment_intent_data[application_fee_amount]", String(platformFeeCents));
  for (const [key, value] of Object.entries({
    ferocity_kind: "service_invoice_payment", tenant_id: tenantId, invoice_id: invoice.id,
    customer_id: invoice.customer_id, payment_link_id: link.id, amount_cents: String(amountCents),
    currency: "usd", payment_mode: "stripe_connect_direct", connected_account_id: account.provider_account_id,
    platform_fee_cents: String(platformFeeCents)
  })) body.set(`payment_intent_data[metadata][${key}]`, value);
  if (invoice.customer_email) body.set("customer_email", invoice.customer_email);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": account.provider_account_id,
      "Idempotency-Key": `ferocity-invoice-checkout-${link.id}`
    },
    body
  });
  const session = await response.json();
  if (!response.ok || !session.url) throw new Error(session?.error?.message ?? `Stripe checkout failed with ${response.status}.`);
  await client.query(
    `update public.service_invoice_payment_links
     set status='ready', provider_checkout_session_id=$3, provider_payment_intent_id=$4,
         payment_url=$5, metadata_json=metadata_json || '{"stripeCheckoutPrepared":true}'::jsonb, updated_at=now()
     where tenant_id=$1 and id=$2`,
    [tenantId, link.id, session.id ?? null, session.payment_intent ?? null, session.url]
  );
  console.log(JSON.stringify({
    created: true, invoiceId: invoice.id, paymentLinkId: link.id, amountCents,
    platformFeeCents, connectedAccountId: account.provider_account_id, paymentUrl: session.url
  }, null, 2));
} finally {
  await client.end();
}
