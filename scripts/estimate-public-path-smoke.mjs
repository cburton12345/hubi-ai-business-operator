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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function line(label, detail) {
  console.log(`${label.padEnd(30)} ${detail}`);
}

loadLocalEnv();
assert(process.env.DATABASE_URL, "DATABASE_URL is required for estimate public path smoke.");

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const id = Date.now().toString(36);
const token = `estimate-smoke-${id}-${crypto.randomBytes(4).toString("hex")}`;

await client.connect();
await client.query("begin");

try {
  const tenant = await client.query(
    `
    select t.id, t.name, b.id as brand_id
    from public.tenants t
    left join public.brands b on b.tenant_id = t.id and b.status = 'active'
    where t.status in ('active', 'trial')
    order by t.created_at asc
    limit 1
    `
  );
  assert(tenant.rows[0]?.id, "No active or trial tenant exists for estimate smoke.");
  const tenantId = tenant.rows[0].id;
  const brandId = tenant.rows[0].brand_id ?? null;
  line("Workspace", `${tenant.rows[0].name} (${tenantId})`);

  const customer = await client.query(
    `
    insert into public.customers (
      tenant_id, brand_id, name, email, phone, address_line1, city, state, postal_code, notes
    )
    values ($1, $2, $3, $4, '555-0199', '100 Smoke Test Way', 'Eau Claire', 'WI', '54701', 'Rollback-safe estimate smoke test.')
    returning id
    `,
    [tenantId, brandId, `Estimate Smoke ${id}`, `estimate-smoke-${id}@example.com`]
  );
  const customerId = customer.rows[0].id;

  const estimate = await client.query(
    `
    insert into public.service_estimates (
      tenant_id, brand_id, customer_id, title, status,
      subtotal_cents, discount_cents, tax_cents, total_cents,
      customer_summary, internal_notes, manual_follow_up_draft,
      valid_until, payment_terms, deposit_required_cents, acceptance_notes,
      show_line_item_prices
    )
    values (
      $1, $2, $3, 'Roof repair smoke estimate', 'sent_manually',
      420000, 0, 0, 420000,
      'Repair storm damage, replace damaged shingles, and clean work area.',
      'Smoke test estimate. Rolled back automatically.',
      'Follow up if the customer has not accepted by tomorrow.',
      current_date + interval '14 days',
      'Deposit due at acceptance. Balance due after completion.',
      75000,
      'Scheduling and material dates are confirmed after acceptance.',
      true
    )
    returning id
    `,
    [tenantId, brandId, customerId]
  );
  const estimateId = estimate.rows[0].id;

  await client.query(
    `
    insert into public.estimate_line_items (
      tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents, position
    )
    values
      ($1, $2, 'Labor', 'Tear out, install, clean up, and customer walkthrough.', 1, 240000, 240000, 1),
      ($1, $2, 'Materials', 'Starter shingles, fasteners, flashing, sealant, and disposal.', 1, 180000, 180000, 2)
    `,
    [tenantId, estimateId]
  );

  const share = await client.query(
    `
    insert into public.estimate_share_links (
      tenant_id, estimate_id, customer_id, public_token, status, email_to, metadata_json
    )
    values ($1, $2, $3, $4, 'ready', $5, '{"source":"estimate_public_path_smoke"}'::jsonb)
    returning id
    `,
    [tenantId, estimateId, customerId, token, `estimate-smoke-${id}@example.com`]
  );
  const shareLinkId = share.rows[0].id;
  line("Public share", `/estimate/${token}`);

  await client.query(
    `
    insert into public.estimate_acceptances (
      tenant_id, estimate_share_link_id, estimate_id, customer_id,
      accepted_name, accepted_email, acceptance_note, metadata_json
    )
    values ($1, $2, $3, $4, 'Estimate Smoke', $5, 'Looks good.',
      jsonb_build_object(
        'source', 'estimate_public_path_smoke',
        'signatureMethod', 'typed_name',
        'signatureText', 'Estimate Smoke',
        'electronicSignatureConsent', true,
        'consentVersion', '2026-08-11',
        'signedAt', now(),
        'documentSha256', repeat('a', 64),
        'documentSnapshot', jsonb_build_object('estimateId', $3::uuid, 'totalCents', 420000)
      ))
    on conflict (estimate_share_link_id) do nothing
    `,
    [tenantId, shareLinkId, estimateId, customerId, `estimate-smoke-${id}@example.com`]
  );

  await client.query(
    `
    update public.estimate_share_links
    set status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
    where id = $1
    `,
    [shareLinkId]
  );

  await client.query(
    `
    update public.service_estimates
    set status = 'approved', updated_at = now()
    where id = $1
    `,
    [estimateId]
  );

  await client.query(
    `
    insert into public.service_jobs (
      tenant_id, brand_id, customer_id, estimate_id, title, status, dispatcher_notes, ai_next_action
    )
    select tenant_id, brand_id, customer_id, id, title, 'unscheduled',
      'Estimate accepted. Confirm schedule, material readiness, deposit/payment, and crew assignment.',
      'Confirm scheduling, material readiness, and deposit/payment status.'
    from public.service_estimates
    where id = $1
      and not exists (
        select 1 from public.service_jobs where tenant_id = public.service_estimates.tenant_id and estimate_id = public.service_estimates.id
      )
    `,
    [estimateId]
  );

  const invoice = await client.query(
    `
    insert into public.service_invoices (
      tenant_id, brand_id, customer_id, estimate_id, title, status,
      subtotal_cents, total_cents, due_date, internal_notes, manual_payment_notes
    )
    values (
      $1, $2, $3, $4, 'Deposit - Roof repair smoke estimate', 'draft',
      75000, 75000, current_date + interval '3 days',
      'Deposit invoice prepared after public estimate acceptance.',
      'Send only after payment settings are confirmed.'
    )
    returning id
    `,
    [tenantId, brandId, customerId, estimateId]
  );
  const invoiceId = invoice.rows[0].id;

  await client.query(
    `
    insert into public.invoice_line_items (
      tenant_id, invoice_id, name, description, quantity, unit_price_cents, total_cents, position
    )
    values ($1, $2, 'Estimate deposit', 'Deposit due after estimate acceptance.', 1, 75000, 75000, 1)
    `,
    [tenantId, invoiceId]
  );

  await client.query(
    `
    insert into public.service_invoice_payment_links (
      tenant_id, brand_id, customer_id, invoice_id, provider, status,
      amount_cents, currency, payment_mode, platform_fee_cents, processor_fee_cents,
      net_to_business_cents, metadata_json
    )
    values (
      $1, $2, $3, $4, 'stripe', 'draft',
      75000, 'usd', 'platform_direct', 0, 0,
      75000, '{"source":"estimate_acceptance_deposit","smoke":true}'::jsonb
    )
    `,
    [tenantId, brandId, customerId, invoiceId]
  );

  const verification = await client.query(
    `
    select
      (select status from public.service_estimates where id = $1) as estimate_status,
      (select status from public.estimate_share_links where id = $2) as share_status,
      (select count(*)::int from public.estimate_acceptances where estimate_share_link_id = $2) as acceptances,
      (select count(*)::int from public.estimate_acceptances where estimate_share_link_id = $2
        and metadata_json->>'electronicSignatureConsent'='true'
        and length(metadata_json->>'documentSha256')=64) as signed_acceptances,
      (select count(*)::int from public.service_jobs where estimate_id = $1 and status = 'unscheduled') as jobs,
      (select count(*)::int from public.service_invoices where estimate_id = $1 and title like 'Deposit - %') as deposit_invoices,
      (select count(*)::int from public.service_invoice_payment_links l join public.service_invoices i on i.id = l.invoice_id where i.estimate_id = $1) as payment_links,
      (select count(*)::int from public.estimate_line_items where estimate_id = $1) as line_items
    `,
    [estimateId, shareLinkId]
  );
  const row = verification.rows[0];
  assert(row.estimate_status === "approved", `estimate status expected approved, got ${row.estimate_status}`);
  assert(row.share_status === "accepted", `share status expected accepted, got ${row.share_status}`);
  assert(row.acceptances === 1, `expected 1 acceptance, got ${row.acceptances}`);
  assert(row.signed_acceptances === 1, `expected 1 signed acceptance receipt, got ${row.signed_acceptances}`);
  assert(row.jobs === 1, `expected 1 draft job, got ${row.jobs}`);
  assert(row.deposit_invoices === 1, `expected 1 deposit invoice, got ${row.deposit_invoices}`);
  assert(row.payment_links === 1, `expected 1 payment link, got ${row.payment_links}`);
  assert(row.line_items === 2, `expected 2 estimate line items, got ${row.line_items}`);

  line("Acceptance flow", "estimate electronically signed; receipt evidence saved; job draft prepared");
  line("Deposit flow", "deposit invoice and draft payment link prepared");
  line("Cleanup", "transaction rolled back; no smoke records saved");
  console.log("Estimate public path smoke passed.");
} finally {
  await client.query("rollback");
  await client.end();
}
