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
assert(process.env.DATABASE_URL, "DATABASE_URL is required for provider-promotion smoke.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const providerKey = `promotion_smoke_${crypto.randomBytes(5).toString("hex")}`;
await client.connect();
await client.query("begin");

try {
  const target = await client.query(`
    select id as tenant_id
    from public.tenants
    where status in ('active', 'trial')
    order by created_at
    limit 1
  `);
  const tenantId = target.rows[0]?.tenant_id;
  assert(tenantId, "An active workspace is required.");

  const control = await client.query(
    `insert into public.managed_ad_budget_controls (
       tenant_id, provider_key, lane_key, status, prepaid_required, approved_by_customer,
       live_spend_enabled, daily_cap_cents, monthly_cap_cents, stop_loss_cents
     ) values ($1, $2, 'customer_owned', 'not_ready', false, false, false, 2500, 10000, 10000)
     returning id, approved_by_customer, live_spend_enabled`,
    [tenantId, providerKey]
  );
  const controlRow = control.rows[0];

  const promotion = await client.query(
    `insert into public.provider_promotion_opportunities (
       tenant_id, provider_key, lane_key, budget_control_id, title, offer_source,
       credit_cents, required_spend_cents, planned_spend_without_offer_cents,
       status, recommendation, recommendation_reason, approved_budget_cents,
       approved_daily_cap_cents, approved_at
     ) values ($1, $2, 'customer_owned', $3, 'Smoke promotion', 'provider_dashboard',
       10000, 10000, 10000, 'approved', 'accept', 'Already-planned spend qualifies.',
       10000, 2500, now())
     returning id`,
    [tenantId, providerKey, controlRow.id]
  );
  const promotionId = promotion.rows[0]?.id;
  assert(promotionId, "Promotion was not created.");
  assert(controlRow.approved_by_customer === false, "Promotion approval incorrectly granted global campaign approval.");
  assert(controlRow.live_spend_enabled === false, "Promotion approval incorrectly enabled live spend.");

  const progress = await client.query(
    `update public.provider_promotion_opportunities
     set qualifying_spend_recorded_cents = 10000,
         status = case when 10000 >= required_spend_cents then 'qualified' else 'activated' end,
         qualified_at = case when 10000 >= required_spend_cents then now() else null end,
         updated_at = now()
     where id = $1 and tenant_id = $2
     returning status, qualifying_spend_recorded_cents, qualified_at is not null as qualified_at_set`,
    [promotionId, tenantId]
  );
  assert(progress.rows[0]?.status === "qualified", "Qualifying spend did not advance the offer to qualified.");
  assert(progress.rows[0]?.qualifying_spend_recorded_cents === 10000, "Qualifying spend was not stored.");
  assert(progress.rows[0]?.qualified_at_set === true, "Qualification timestamp was not stored.");

  console.log("Provider promotion smoke passed: capture, guarded approval, spend lock, progress, and qualification verified.");
  console.log("Cleanup: transaction rolled back; no smoke records saved.");
  await client.query("rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
