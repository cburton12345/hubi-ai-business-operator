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
const qualityRetest = runtimeArgv.includes("--quality-retest");
const smallBusinessIntro = runtimeArgv.includes("--small-business-intro");
const oneTimeConsentedCall = runtimeArgv.includes("--one-time-consented-call");
const allowFailedRetry = runtimeArgv.includes("--allow-failed-retry");
const allowTerminalRetry = runtimeArgv.includes("--allow-terminal-retry");
const certificationVariables = {
  contact_name: genericSales || smallBusinessIntro ? "there" : "Chris",
  contact_type: "lead",
  business_name: "Ferocity",
  call_purpose: smallBusinessIntro
    ? "Chris Burton asked Ferocity to reach out once and briefly explain how Ferocity may help your small business"
    : genericSales
    ? "follow up because you expressed interest in learning about Ferocity"
    : qualityRetest
      ? "follow up on your Ferocity voice-agent test and confirm that the outbound introduction now clearly explains why Ferocity called"
    : "follow up on your interest in using Ferocity for a roofing business",
  call_scenario: "lead_follow_up",
  desired_outcome: smallBusinessIntro
    ? "First ask whether this is a good time for a brief explanation. If yes, explain Ferocity clearly, learn the business's biggest growth or operating challenge, and either send a secure Ferocity invitation if the person explicitly asks to start or record a callback if requested. If no, apologize, end promptly, and do not pressure or retry."
    : "Answer questions about Ferocity and record a demo or sales callback only if the person requests one.",
  business_context: "Ferocity is an AI business operating system for contractors, professional firms, agencies, and other small businesses. Its shared Business Brain studies how the company currently works, identifies gaps and growth opportunities, recommends the highest-value next move, and can prepare or complete authorized work across marketing, lead follow-up, customer communication, scheduling, estimates, jobs or client delivery, invoicing, payments, reviews, and reporting. It measures which work produces leads, customers, revenue, and profit so the business improves instead of merely accumulating disconnected tools.",
  contact_context: smallBusinessIntro
    ? "Chris Burton supplied this business contact and asked Ferocity to make one introductory call. Do not say the person previously expressed interest or consented. Be transparent about why you are calling and respect an immediate no."
    : genericSales
    ? "The person expressed interest in learning about Ferocity. Their industry and specific needs are not yet known, so ask before tailoring the conversation."
    : qualityRetest
      ? "Chris tested this voice agent moments ago. The previous outbound call did not clearly explain its purpose. This call is an authorized quality retest. Briefly acknowledge that reason, ask whether the corrected opening is clear, and do not turn this into a generic sales or support intake call."
    : "The person previously said they operate or are evaluating Ferocity for a roofing business and wants to understand how the platform can help.",
  context_quality: "prepared",
  allowed_next_steps: smallBusinessIntro
    ? "Ask permission to continue; give a concise, accurate overview; ask what kind of business they run and what needs the most help; answer from supplied Ferocity information; if they explicitly want to start, confirm full name, company, complete email address, and permission, then send the secure invitation only through create_ferocity_signup; record a human callback only through the connected callback tool and only if requested; never ask for a password or invent a feature, price, appointment, prior interest, consent, or completed action."
    : genericSales
    ? "Answer from supplied Ferocity information; ask what kind of business they run and what needs the most help; record a human callback only through the connected tool; never invent a feature, price, appointment, or completed action."
    : qualityRetest
      ? "Ask whether the corrected outbound purpose was clear, answer one brief question if asked, record feedback in the transcript, and end naturally. Do not offer an unsolicited sales callback."
    : "Answer from supplied Ferocity information; ask what part of the roofing business needs the most help; record a human callback only through the connected tool; never invent a feature, price, appointment, or completed action."
};
const client = new pg.Client({
  connectionString: runtimeEnv.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
let restoreOutboundDisabled = false;

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
  let number = (await client.query(
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
  if (smallBusinessIntro && oneTimeConsentedCall) {
    const consent = (await client.query(
      `select
         exists(select 1 from public.contact_consent_records where tenant_id=$1 and channel='phone' and status='granted' and right(regexp_replace(contact_value, '[^0-9]', '', 'g'), 10)=$2) as granted,
         exists(select 1 from public.contact_suppression_list where tenant_id=$1 and channel='phone' and active=true and right(regexp_replace(contact_value, '[^0-9]', '', 'g'), 10)=$2) as suppressed`,
      [tenantId, toNumber.replace(/\D/g, "").slice(-10)]
    )).rows[0];
    if (!consent?.granted || consent?.suppressed) {
      throw new Error("A one-time business introduction requires recorded phone consent and no active suppression.");
    }
    if (number && !number.outbound_enabled) {
      await client.query(
        `update public.telephony_numbers set outbound_enabled=true, updated_at=now()
          where tenant_id=$1 and provider_key='retell_voice' and phone_number=$2`,
        [tenantId, fromNumber]
      );
      restoreOutboundDisabled = true;
      number = { ...number, outbound_enabled: true };
    }
  }
  if (!number || number.status !== "active" || !number.outbound_enabled) {
    throw new Error("The Ferocity support number is not enabled for the controlled outbound test.");
  }

  const recent = (await client.query(
    `select provider_call_id, status
      from public.receptionist_calls
      where tenant_id = $1 and provider_key = 'retell_voice' and called_number = $2
        and metadata_json->>'source' = $3
        and created_at >= now() - interval '10 minutes'
      order by created_at desc limit 1`,
    [tenantId, toNumber, smallBusinessIntro ? "founder_authorized_business_intro" : "founder_authorized_certification"]
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
       $8, 'none', 0, $6, $7::jsonb
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
        source: smallBusinessIntro ? "founder_authorized_business_intro" : "founder_authorized_certification",
        consentConfirmed: smallBusinessIntro ? oneTimeConsentedCall : true,
        controlledTest: !smallBusinessIntro,
        agentPurpose
      }),
      smallBusinessIntro
        ? "Founder-authorized one-time small-business introduction started. Recipient interest and consent were not assumed."
        : "Founder-authorized Retell certification call started."
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
  if (restoreOutboundDisabled) {
    await client.query(
      `update public.telephony_numbers set outbound_enabled=false, updated_at=now()
        where tenant_id=$1 and provider_key='retell_voice' and phone_number=$2`,
      [tenantId, fromNumber]
    ).catch(() => undefined);
  }
  await client.end();
}
