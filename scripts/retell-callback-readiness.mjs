import fs from "node:fs";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL || !process.env.RETELL_API_KEY) {
  throw new Error("DATABASE_URL and RETELL_API_KEY are required.");
}

const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const certify = process.argv.includes("--certify");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();

async function retell(path, method = "GET", body) {
  const response = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message ?? `Retell returned ${response.status}.`);
  return payload;
}

try {
  const result = await client.query(
    `select n.id,n.phone_number,n.callback_status,n.callback_last_tested_at,
            nullif(a.metadata_json->>'assistantId','') as assistant_id
       from public.telephony_numbers n
       join public.provider_accounts a on a.tenant_id=n.tenant_id and a.provider_key=n.provider_key
      where n.tenant_id=$1 and n.provider_key='retell_voice'
      order by n.updated_at desc limit 1`,
    [tenantId]
  );
  const number = result.rows[0];
  if (!number?.phone_number || !number?.assistant_id) {
    throw new Error("The workspace does not have a Retell number and inbound agent to test.");
  }

  const [remoteNumber, calls] = await Promise.all([
    retell(`/get-phone-number/${encodeURIComponent(number.phone_number)}`),
    retell("/v3/list-calls", "POST", { sort_order: "descending", limit: 100 })
  ]);
  const inboundAgents = Array.isArray(remoteNumber.inbound_agents) ? remoteNumber.inbound_agents : [];
  const fallbackAgentBound = inboundAgents.some((agent) => agent?.agent_id === number.assistant_id);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const evidence = (calls.items ?? []).find((call) =>
    call?.direction === "inbound"
    && call?.to_number === number.phone_number
    && call?.agent_id === number.assistant_id
    && Number(call?.start_timestamp ?? 0) >= cutoff
    && ["ongoing", "ended"].includes(call?.call_status)
    && Number(call?.call_cost?.total_duration_seconds ?? 0) > 0
  );

  const certified = Boolean(evidence && remoteNumber.inbound_webhook_url && fallbackAgentBound);
  if (certify && certified) {
    await client.query(
      `update public.telephony_numbers
          set callback_status='certified',callback_last_tested_at=now(),
              callback_last_failure_at=null,callback_failure_reason=null,updated_at=now()
        where id=$1`,
      [number.id]
    );
  }

  console.log(JSON.stringify({
    ok: certified,
    callbackStatus: certify && certified ? "certified" : number.callback_status,
    inboundWebhookConfigured: Boolean(remoteNumber.inbound_webhook_url),
    fallbackAgentBound,
    realInboundEvidenceFound: Boolean(evidence),
    evidenceStatus: evidence?.call_status ?? null,
    evidenceDurationSeconds: evidence?.call_cost?.total_duration_seconds ?? null,
    databaseUpdated: certify && certified,
    nextStep: certified
      ? (certify ? "The caller ID is certified for production use." : "Run again with --certify to record the successful callback test.")
      : "Place a real callback to the displayed number after its carrier route is restored, then run this check again."
  }, null, 2));

  if (!certified) process.exitCode = 2;
} finally {
  await client.end();
}
