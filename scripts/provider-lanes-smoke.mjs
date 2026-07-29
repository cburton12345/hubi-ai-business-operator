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

loadLocalEnv();
assert(process.env.DATABASE_URL, "DATABASE_URL is required for provider lane smoke.");

const expectedCapabilities = [
  "email",
  "ai_text",
  "text_alerts",
  "voice_ai",
  "payments",
  "website_publishing",
  "google_business_profile",
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "reddit_ads",
  "microsoft_ads",
  "marketplacepro",
  "supplier_purchasing"
];

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const result = await client.query(
    `
    select capability_key,
           count(*)::int as lane_count,
           count(*) filter (where lane_key = 'customer_owned')::int as customer_lanes,
           count(*) filter (where lane_key = 'ferocity_managed')::int as ferocity_lanes,
           bool_or(live_actions_enabled) as has_live_actions
    from public.provider_connection_lanes
    group by capability_key
    order by capability_key
    `
  );

  const rows = new Map(result.rows.map((row) => [row.capability_key, row]));
  for (const capability of expectedCapabilities) {
    const row = rows.get(capability);
    assert(row, `${capability} provider lanes are missing.`);
    assert(Number(row.customer_lanes) >= 1, `${capability} is missing the customer-owned lane.`);
    assert(Number(row.ferocity_lanes) >= 1, `${capability} is missing the Ferocity-managed lane.`);
  }

  const duplicateResult = await client.query(
    `
    select tenant_id, capability_key, lane_key, count(*)::int as duplicates
    from public.provider_connection_lanes
    group by tenant_id, capability_key, lane_key
    having count(*) > 1
    `
  );
  assert(duplicateResult.rowCount === 0, "Provider lane duplicates were found.");

  const unsafeLiveResult = await client.query(
    `
    select capability_key, provider_key, lane_key
    from public.provider_connection_lanes
    where live_actions_enabled = true
      and connection_status <> 'connected'
    limit 10
    `
  );
  assert(unsafeLiveResult.rowCount === 0, "A provider lane has live actions enabled without a connected status.");

  console.log(`Provider lane smoke passed for ${expectedCapabilities.length} capability groups.`);
} finally {
  await client.end();
}
