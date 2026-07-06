import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (process.env[key]) continue;
    process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined
});

await client.connect();

const tenantResult = await client.query(`
  select id
  from public.tenants
  order by created_at asc
  limit 1
`);

const tenantId = tenantResult.rows[0]?.id;
if (!tenantId) {
  await client.end();
  console.error("No tenant found for labor owner event smoke.");
  process.exit(1);
}

const externalEventId = `labor-smoke:${Date.now()}`;
const inserted = await client.query(
  `
  insert into public.owner_command_events (
    tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
    severity, status, owner_attention, ai_handled, recommended_action, action_href, risk_type,
    confidence_score, metadata_json, occurred_at
  )
  values (
    $1, 'ferocity-labor', 'Ferocity Labor Bench', $2, 'labor.worker.available',
    'Labor smoke worker available', 'Smoke test verified that labor events can enter Owner Command.',
    'medium', 'needs_owner', true, false, 'Open Labor Bench and review worker availability.',
    '/app/labor-bench', 'approval', 92, '{"smoke":true,"source":"smoke-labor-owner-event"}'::jsonb, now()
  )
  returning id, platform_key, platform_name, event_type, action_href
  `,
  [tenantId, externalEventId]
);

const row = inserted.rows[0];
const verified = await client.query(
  `
  select count(*)::int as count
  from public.owner_command_events
  where tenant_id = $1
    and platform_key = 'ferocity-labor'
    and platform_name = 'Ferocity Labor Bench'
    and event_type = 'labor.worker.available'
    and action_href = '/app/labor-bench'
    and external_event_id = $2
  `,
  [tenantId, externalEventId]
);

await client.query("delete from public.owner_command_events where id = $1", [row.id]);
await client.end();

if (verified.rows[0]?.count !== 1) {
  console.error("Labor owner event smoke failed.");
  process.exit(1);
}

console.log(`Labor owner event smoke passed and cleaned up: ${row.id}`);
