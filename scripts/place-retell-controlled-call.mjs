import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

const runtimeEnv = { ...(typeof process === 'undefined' ? {} : process.env) };
const runtimeArgv = typeof process === 'undefined' ? [] : process.argv;
for (const file of [new URL('../.env.local', import.meta.url), new URL('../.env', import.meta.url)]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || runtimeEnv[match[1]]) continue;
    runtimeEnv[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
if (typeof globalThis.__FEROCITY_RETELL_API_KEY === 'string') {
  runtimeEnv.RETELL_API_KEY = globalThis.__FEROCITY_RETELL_API_KEY;
}

const toIndex = runtimeArgv.indexOf("--to");
const toNumber = toIndex >= 0
  ? runtimeArgv[toIndex + 1]
  : typeof globalThis.__FEROCITY_RETELL_TEST_TO === 'string'
    ? globalThis.__FEROCITY_RETELL_TEST_TO
    : null;
if (!/^\+[1-9]\d{7,14}$/.test(toNumber ?? "")) {
  throw new Error("A valid E.164 destination is required with --to.");
}
if (!runtimeEnv.DATABASE_URL || !runtimeEnv.RETELL_API_KEY) {
  throw new Error("DATABASE_URL and RETELL_API_KEY are required from the production runtime.");
}

const tenantId = runtimeEnv.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const fromNumber = "+18882566005";
const agentIndex = runtimeArgv.indexOf("--agent");
const agentPurpose = agentIndex >= 0 ? runtimeArgv[agentIndex + 1] : "customer_outbound";
if (!['customer_outbound', 'public_receptionist'].includes(agentPurpose)) {
  throw new Error("--agent must be customer_outbound or public_receptionist. Private owner calls require the verified owner-briefing flow.");
}
const correlationId = `retell-certification:${crypto.randomUUID()}`;
const genericSales = runtimeArgv.includes("--generic-sales");
const allowFailedRetry = runtimeArgv.includes("--allow-failed-retry");
const allowTerminalRetry = runtimeArgv.includes("--allow-terminal-retry");
const certificationVariables = {
  contact_name: genericSales ? "there" : "Chris",
  contact_type: "lead",
  business_name: "Ferocity",
  call_purpose: genericSales
    ? "follow up because you expressed interest in learning about Ferocity"
    : "follow up on your interest in using Ferocity for a roofing business",
  call_scenario: "lead_follow_up",
  desired_outcome: "Answer questions about Ferocity and record a demo or sales callback only if the person requests one.",
  business_context: "Ferocity is an AI operating system for service businesses. It coordinates customer communication, leads, estimates, scheduling, field work, invoicing, payments, reviews, marketing, and approved AI work through one shared Business Brain.",
  contact_context: genericSales
    ? "The person expressed interest in learning about Ferocity. Their industry and specific needs are not yet known, so ask before tailoring the conversation."
    : "The person previously said they operate or are evaluating Ferocity for a roofing business and wants to understand how the platform can help.",
  context_quality: "prepared",
  allowed_next_steps: genericSales
    ? "Answer from supplied Ferocity information; ask what kind of business they run and what needs the most help; record a human callback only through the connected tool; never invent a feature, price, appointment, or completed action."
    : "Answer from supplied Ferocity information; ask what part of the roofing business needs the most help; record a human callback only through the connected tool; never invent a feature, price, appointment, or completed action."
};
const client = new pg.Client({
  connectionString: runtimeEnv.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const provider = (await client.query(
    `select status, credentials_status, live_actions_enabled, ownership_mode,
            nullif(metadata_json->>'assistantId', '') as public_assistant_id,
            nullif(metadata_json->>'outboundAssistantId', '') as outbound_assistant_id
       from public.provider_accounts
      where tenant_id = $1 and provider_key = 'retell_voice'
      limit 1`,
    [tenantId]
  )).rows[0];
  const number = (await client.query(
    `select id, status, outbound_enabled
       from public.telephony_numbers
      where tenant_id = $1 and provider_key = 'retell_voice' and phone_number = $2
      limit 1`,
    [tenantId, fromNumber]
  )).rows[0];
  if (
    !provider
    || provider.status !== "connected"
    || provider.credentials_status !== "configured"
    || !provider.live_actions_enabled
    || provider.ownership_mode !== "ferocity_managed"
    || !(agentPurpose === 'customer_outbound' ? provider.outbound_assistant_id : provider.public_assistant_id)
  ) {
    throw new Error("The Ferocity-managed Retell provider is not enabled for the controlled test.");
  }
  if (!number || number.status !== "active" || !number.outbound_enabled) {
    throw new Error("The Ferocity support number is not enabled for the controlled outbound test.");
  }

  const recent = (await client.query(
    `select provider_call_id, status
       from public.receptionist_calls
      where tenant_id = $1 and provider_key = 'retell_voice' and called_number = $2
        and metadata_json->>'source' = 'founder_authorized_certification'
        and created_at >= now() - interval '10 minutes'
      order by created_at desc limit 1`,
    [tenantId, toNumber]
  )).rows[0];
  const retryableTerminalStatus = recent && ["failed", "missed"].includes(recent.status);
  if (recent && !((allowFailedRetry && recent.status === "failed") || (allowTerminalRetry && retryableTerminalStatus))) {
    throw new Error(`A recent controlled call already exists with status ${recent.status}; refusing a duplicate.`);
  }

  const response = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeEnv.RETELL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from_number: fromNumber,
      to_number: toNumber,
      override_agent_id: agentPurpose === 'customer_outbound'
        ? provider.outbound_assistant_id
        : provider.public_assistant_id,
      ...(agentPurpose === 'customer_outbound'
        ? { retell_llm_dynamic_variables: certificationVariables }
        : {}),
      metadata: {
        ferocityTenantId: tenantId,
        ferocityCorrelationId: correlationId,
        ferocityIdempotencyKey: correlationId,
        ferocityAuthorizedTest: true,
        ferocityAgentPurpose: agentPurpose
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  const providerCallId = typeof payload.call_id === "string" ? payload.call_id : null;
  if (!response.ok || !providerCallId) {
    throw new Error(`Retell rejected the controlled call with HTTP ${response.status}.`);
  }

  await client.query(
    `insert into public.receptionist_calls (
       tenant_id, telephony_number_id, provider_key, provider_call_id, direction,
       caller_number, called_number, status, sentiment, lead_qualification,
       summary, follow_up_status, usage_units, idempotency_key, metadata_json
     ) values (
       $1, $2, 'retell_voice', $3, 'outbound', $4, $5, 'ringing', 'unknown', 'unknown',
       'Founder-authorized Retell certification call started.', 'none', 0, $6, $7::jsonb
     )
     on conflict (provider_key, provider_call_id) do nothing`,
    [
      tenantId,
      number.id,
      providerCallId,
      fromNumber,
      toNumber,
      correlationId,
      JSON.stringify({
        source: "founder_authorized_certification",
        consentConfirmed: true,
        controlledTest: true,
        agentPurpose
      })
    ]
  );

  console.log(JSON.stringify({
    ok: true,
    callPlaced: true,
    provider: "retell_voice",
    agentPurpose,
    fromNumber,
    toNumber,
    status: payload.call_status ?? "registered",
    providerCallId
  }, null, 2));
} finally {
  await client.end();
}
