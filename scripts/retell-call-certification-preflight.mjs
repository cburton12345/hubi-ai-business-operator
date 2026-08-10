import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const raw of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const directionIndex = process.argv.indexOf("--direction");
const direction = directionIndex >= 0 ? process.argv[directionIndex + 1] : "outbound";
if (!['inbound', 'outbound'].includes(direction)) throw new Error("--direction must be inbound or outbound.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const providerResult = await client.query(
      `select status,credentials_status,live_actions_enabled,metadata_json
         from public.provider_accounts where tenant_id=$1 and provider_key='retell_voice' limit 1`,
      [tenantId]
    );
  const numberResult = await client.query(
      `select phone_number,status,inbound_enabled,outbound_enabled,compliance_status
         from public.telephony_numbers where tenant_id=$1 and provider_key='retell_voice'
        order by updated_at desc limit 1`,
      [tenantId]
    );
  const policyResult = await client.query(
      `select action_key,status,requires_human_approval,requires_consent
         from public.live_action_policies where tenant_id=$1 and action_key in ('voice_call','outbound_call') order by action_key`,
      [tenantId]
    );
  const provider = providerResult.rows[0] ?? null;
  const number = numberResult.rows[0] ?? null;
  const blockers = [];
  if (!provider) blockers.push("Retell provider account is missing from the tenant.");
  if (!number) blockers.push("Retell phone number is missing from the tenant.");
  if (provider?.credentials_status !== "configured") blockers.push("Retell credentials are not marked configured.");
  if (!['ready', 'not_required'].includes(number?.compliance_status)) blockers.push("Voice compliance is not ready for live calls.");
  if (direction === 'inbound' && !number?.inbound_enabled) blockers.push("Inbound calling is intentionally disabled in Ferocity.");
  if (direction === 'outbound' && !number?.outbound_enabled) blockers.push("Outbound calling is intentionally disabled in Ferocity.");
  if (!provider?.live_actions_enabled) blockers.push("Retell live actions are intentionally disabled in Ferocity.");
  const voicePolicy = policyResult.rows.find((policy) => policy.action_key === 'voice_call');
  if (direction === 'outbound' && voicePolicy?.status !== 'live') blockers.push("The live voice-call policy is not enabled.");
  console.log(JSON.stringify({
    ok: blockers.length === 0,
    safePreflightOnly: true,
    callPlaced: false,
    direction,
    providerStatus: provider?.status ?? "missing",
    credentialsStatus: provider?.credentials_status ?? "missing",
    phonePresent: Boolean(number?.phone_number),
    phoneStatus: number?.status ?? "missing",
    inboundEnabled: Boolean(number?.inbound_enabled),
    outboundEnabled: Boolean(number?.outbound_enabled),
    complianceStatus: number?.compliance_status ?? "missing",
    policies: policyResult.rows,
    blockers,
    nextStep: "Choose a safe destination, approve the one controlled call, then temporarily enable only the required direction and verify webhook, summary, usage, and escalation evidence."
  }, null, 2));
} finally {
  await client.end();
}
