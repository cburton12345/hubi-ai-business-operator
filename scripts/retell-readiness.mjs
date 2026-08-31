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

if (!process.env.DATABASE_URL || !process.env.RETELL_API_KEY) throw new Error("DATABASE_URL and RETELL_API_KEY are required.");
const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const appUrl = (process.env.EXTERNAL_TEST_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function retell(path) {
  const response = await fetch(`https://api.retellai.com${path}`, { headers: { Authorization: `Bearer ${process.env.RETELL_API_KEY}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message ?? `Retell returned ${response.status}.`);
  return payload;
}

try {
  const providerResult = await client.query(
    `select status,credentials_status,live_actions_enabled,metadata_json from public.provider_accounts
      where tenant_id=$1 and provider_key='retell_voice' limit 1`,
    [tenantId]
  );
  const numberResult = await client.query(
    `select phone_number,status,inbound_enabled,outbound_enabled,compliance_status,callback_status,callback_last_tested_at from public.telephony_numbers
      where tenant_id=$1 and provider_key='retell_voice' order by updated_at desc limit 1`,
    [tenantId]
  );
  const connectionResult = await client.query(
    `select nullif(human_transfer_number,'') is not null as transfer_number_configured
       from public.phone_connections where tenant_id=$1 limit 1`,
    [tenantId]
  );
  const limitResult = await client.query(
    `select concurrent_call_limit from public.spend_limits
      where tenant_id=$1 and status='active'
        and (scope_type='provider' and scope_key='retell_voice'
          or scope_type='feature' and scope_key='ai_receptionist'
          or scope_type='tenant')
      order by case scope_type when 'provider' then 0 when 'feature' then 1 else 2 end limit 1`,
    [tenantId]
  );
  const provider = providerResult.rows[0];
  const number = numberResult.rows[0];
  const assistantId = provider?.metadata_json?.assistantId;
  const outboundAssistantId = provider?.metadata_json?.outboundAssistantId;
  if (!assistantId || !number?.phone_number) throw new Error("Retell assistant or phone number is missing from the tenant record.");
  const [agent, remoteNumber, concurrency] = await Promise.all([
    retell(`/get-agent/${encodeURIComponent(assistantId)}`),
    retell(`/get-phone-number/${encodeURIComponent(number.phone_number)}`),
    retell('/get-concurrency')
  ]);
  const llmId = agent?.response_engine?.llm_id;
  const llm = llmId ? await retell(`/get-retell-llm/${encodeURIComponent(llmId)}`) : null;
  const transferToolConfigured = Array.isArray(llm?.general_tools)
    && llm.general_tools.some((tool) => tool?.type === 'transfer_call');
  const inboundAgentId = remoteNumber.inbound_agent_id ?? remoteNumber.inbound_agents?.[0]?.agent_id ?? null;
  const outboundAgentId = remoteNumber.outbound_agent_id ?? remoteNumber.outbound_agents?.[0]?.agent_id ?? null;
  const normalConcurrencyLimit = Number(concurrency.concurrency_limit);
  const reservedInboundSlots = Number.isFinite(normalConcurrencyLimit) && normalConcurrencyLimit > 2
    ? Math.min(normalConcurrencyLimit - 1, Math.max(2, Math.ceil(normalConcurrencyLimit * 0.25)))
    : 0;
  console.log(JSON.stringify({
    ok: true,
    apiKeyAccepted: true,
    agentExists: Boolean(agent.agent_id),
    agentName: agent.agent_name ?? null,
    phoneExists: remoteNumber.phone_number === number.phone_number,
    inboundAgentAssigned: inboundAgentId === assistantId,
    inboundFallbackAgentAssigned: inboundAgentId === assistantId,
    inboundRoutingReady: inboundAgentId === assistantId || remoteNumber.inbound_webhook_url === `${appUrl}/api/integrations/voice-ai/inbound`,
    outboundAgentAssigned: outboundAgentId === (outboundAssistantId ?? assistantId),
    inboundWebhookConfigured: remoteNumber.inbound_webhook_url === `${appUrl}/api/integrations/voice-ai/inbound`,
    databaseProviderStatus: provider.status,
    databaseCredentialsStatus: provider.credentials_status,
    databaseLiveActionsEnabled: provider.live_actions_enabled,
    databaseInboundEnabled: number.inbound_enabled,
    databaseOutboundEnabled: number.outbound_enabled,
    databaseComplianceStatus: number.compliance_status,
    databaseCallbackStatus: number.callback_status,
    databaseCallbackLastTestedAt: number.callback_last_tested_at,
    tenantTransferNumberConfigured: connectionResult.rows[0]?.transfer_number_configured === true,
    retellTransferToolConfigured: transferToolConfigured,
    retellCurrentConcurrency: concurrency.current_concurrency ?? null,
    retellConcurrencyLimit: concurrency.concurrency_limit ?? null,
    retellBurstEnabled: concurrency.concurrency_burst_enabled === true,
    ferocityReservedInboundSlots: reservedInboundSlots,
    ferocityRoutineOutboundSoftLimit: Number.isFinite(normalConcurrencyLimit)
      ? Math.max(1, normalConcurrencyLimit - reservedInboundSlots)
      : null,
    ferocityTenantConcurrencyLimit: limitResult.rows[0]?.concurrent_call_limit ?? null
  }, null, 2));
} finally {
  await client.end();
}
