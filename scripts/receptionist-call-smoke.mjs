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
assert(process.env.DATABASE_URL, "DATABASE_URL is required for Receptionist Call smoke.");

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const nonce = crypto.randomBytes(5).toString("hex");
const providerEventId = `voice-smoke-event-${nonce}`;
const providerCallId = `voice-smoke-call-${nonce}`;

await client.connect();
await client.query("begin");

try {
  const tenant = await client.query(
    `
    select id, name
    from public.tenants
    where status in ('active', 'trial')
    order by created_at asc
    limit 1
    `
  );
  assert(tenant.rows[0]?.id, "No active or trial tenant exists for receptionist call smoke.");
  const tenantId = tenant.rows[0].id;
  line("Workspace", `${tenant.rows[0].name} (${tenantId})`);

  await client.query(
    `
    insert into public.provider_webhook_events (
      tenant_id, provider_key, provider_event_id, event_type, resource_type, resource_id,
      signature_status, processing_status, idempotency_key, payload_redacted_json
    )
    values ($1, 'vapi_voice', $2, 'call.completed', 'receptionist_call', $3, 'verified', 'processed', $4, '{}'::jsonb)
    on conflict (idempotency_key) do nothing
    `,
    [tenantId, providerEventId, providerCallId, `${tenantId}:vapi_voice:${providerEventId}`]
  );

  const call = await client.query(
    `
    insert into public.receptionist_calls (
      tenant_id, provider_key, provider_call_id, direction, caller_number, called_number,
      status, outcome, sentiment, lead_qualification, duration_seconds, summary,
      follow_up_status, usage_units, idempotency_key, metadata_json
    )
    values ($1, 'vapi_voice', $2, 'inbound', '+15555550100', '+15555550200',
      'completed', 'new_lead', 'neutral', 'warm', 125, 'Smoke call completed.',
      'needed', 3, $3, '{"smoke":true}'::jsonb)
    returning id
    `,
    [tenantId, providerCallId, `${tenantId}:vapi_voice:call:${providerCallId}`]
  );
  const callId = call.rows[0].id;

  await client.query(
    `
    insert into public.usage_meter_events (
      tenant_id, feature_key, provider_key, provider_resource_id, provider_event_id,
      source_table, source_id, unit_type, quantity, provider_cost_cents, customer_charge_cents,
      status, source, idempotency_key, metadata_json
    )
    values ($1, 'ai_receptionist', 'vapi_voice', $2, $3, 'receptionist_calls', $4, 'minute', 3, 12, 0, 'included', 'test', $5, '{"smoke":true}'::jsonb)
    on conflict (tenant_id, idempotency_key) do nothing
    `,
    [tenantId, providerCallId, providerEventId, callId, `${tenantId}:vapi_voice:${providerEventId}:minute:${callId}`]
  );

  const counts = await client.query(
    `
    select
      (select count(*) from public.provider_webhook_events where provider_event_id = $1)::int as events,
      (select count(*) from public.receptionist_calls where id = $2)::int as calls,
      (select count(*) from public.usage_meter_events where source_id = $2::text)::int as usage
    `,
    [providerEventId, callId]
  );
  assert(counts.rows[0].events === 1, "Expected one provider webhook event.");
  assert(counts.rows[0].calls === 1, "Expected one receptionist call.");
  assert(counts.rows[0].usage === 1, "Expected one usage meter event.");

  line("Call", `${callId}; provider=${providerCallId}; usage=3 minutes`);
  line("Cleanup", "transaction rolled back; no smoke records saved");
  await client.query("rollback");
  console.log("Receptionist call smoke passed.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
