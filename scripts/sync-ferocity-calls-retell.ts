import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  const [
    { queryPostgres, withPostgresTransaction },
    { getVoiceAgentProvider },
    { voiceProfileFromStored, buildVoiceAgentSystemPrompt },
    { getIndustryKnowledgeContext },
    { getPhoneConnection },
    { getVoiceMaxDurationSeconds },
    { resolveRetellConfiguration }
  ] = await Promise.all([
    import("../src/lib/db/postgres"),
    import("../src/lib/providers/voice-adapters"),
    import("../src/lib/phone/voice-agent-profile"),
    import("../src/lib/industry-knowledge/get-industry-context"),
    import("../src/lib/phone/phone-connections"),
    import("../src/lib/usage/managed-voice"),
    import("../src/lib/providers/retell-config")
  ]);

  const tenantId = process.env.RETELL_TEST_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
  const appUrl = (process.env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const profileResult = await queryPostgres<{
    brand_id: string | null;
    display_name: string;
    role_summary: string;
    default_tone: string;
    escalation_rules_json: unknown;
    guardrails_json: unknown;
    metadata_json: unknown;
    assistant_id: string | null;
    outbound_assistant_id: string | null;
  }>(
    `select p.brand_id,p.display_name,p.role_summary,p.default_tone,p.escalation_rules_json,
            p.guardrails_json,p.metadata_json,nullif(a.metadata_json->>'assistantId','') assistant_id,
            nullif(a.metadata_json->>'outboundAssistantId','') outbound_assistant_id
       from public.office_manager_profiles p
       join public.provider_accounts a on a.tenant_id=p.tenant_id and a.provider_key='retell_voice'
      where p.tenant_id=$1 and p.status in ('ready','active','needs_attention')
      order by p.updated_at desc limit 1`,
    [tenantId]
  );
  const profile = profileResult?.rows[0];
  if (!profile) throw new Error("The Ferocity Calls workspace does not have a prepared Office Manager profile.");

  const [industryContext, phoneConnection, maxDurationSeconds, retellConfiguration] = await Promise.all([
    getIndustryKnowledgeContext({
      tenantId,
      brandId: profile.brand_id,
      categories: ["intake", "qualification", "scheduling", "safety", "follow_up"]
    }),
    getPhoneConnection(tenantId),
    getVoiceMaxDurationSeconds(tenantId, "retell_voice"),
    resolveRetellConfiguration(tenantId, false)
  ]);
  if (!retellConfiguration?.apiKey || !retellConfiguration.phoneNumber) {
    throw new Error("The workspace does not have a complete Retell API key and phone number configuration.");
  }

  const businessProfile = voiceProfileFromStored({
    displayName: profile.display_name,
    roleSummary: profile.role_summary,
    tone: profile.default_tone,
    escalationRules: profile.escalation_rules_json,
    guardrails: profile.guardrails_json,
    metadata: profile.metadata_json
  });
  const sharedConfig = {
    model: { provider: "openai", model: "gpt-4o-mini", messages: [{ role: "system", content: buildVoiceAgentSystemPrompt(businessProfile, industryContext) }] },
    server: { url: `${appUrl}/api/integrations/voice-ai/webhook` },
    serverMessages: ["status-update", "end-of-call-report", "transcript"],
    maxDurationSeconds,
    transferNumber: phoneConnection?.humanTransferNumber ?? null,
    metadata: { profileSource: "ferocity_office_manager", industryModule: industryContext?.moduleKey ?? null }
  };
  const adapter = getVoiceAgentProvider("retell_voice");
  if (!adapter || adapter.adapterStatus !== "live") throw new Error("The Retell adapter is not live.");
  const context = {
    tenantId,
    brandId: profile.brand_id,
    correlationId: `calls-release:${tenantId}`,
    idempotencyKey: `calls-release:${tenantId}:${profile.brand_id ?? "workspace"}`,
    liveActionsEnabled: false
  };
  const inbound = await adapter.createOrUpdateAssistant(context, {
    assistantId: profile.assistant_id,
    name: businessProfile.displayName,
    firstMessage: businessProfile.greeting,
    ...sharedConfig
  });
  if (!inbound.ok) throw new Error(inbound.safeMessage);
  const outbound = await adapter.createOrUpdateAssistant(
    { ...context, correlationId: `calls-release-outbound:${tenantId}`, idempotencyKey: `calls-release-outbound:${tenantId}:${profile.brand_id ?? "workspace"}` },
    {
      assistantId: profile.outbound_assistant_id,
      name: `${businessProfile.displayName} Outbound`,
      firstMessage: "Hello, this is the business calling through Ferocity. Is now an okay time to talk?",
      ...sharedConfig
    }
  );
  if (!outbound.ok) throw new Error(outbound.safeMessage);

  const numberResponse = await fetch(
    `https://api.retellai.com/update-phone-number/${encodeURIComponent(retellConfiguration.phoneNumber)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${retellConfiguration.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        inbound_agents: null,
        outbound_agents: [{ agent_id: outbound.data.assistantId, weight: 1 }],
        inbound_webhook_url: `${appUrl}/api/integrations/voice-ai/inbound`,
        nickname: "Ferocity Calls"
      })
    }
  );
  if (!numberResponse.ok) throw new Error(`Retell phone assignment failed with HTTP ${numberResponse.status}.`);

  const now = new Date().toISOString();
  await withPostgresTransaction(async (client) => {
    await client.query(
      `update public.provider_accounts
          set status='connected',credentials_status='configured',live_actions_enabled=true,
              metadata_json=metadata_json || $2::jsonb,updated_at=now()
        where tenant_id=$1 and provider_key='retell_voice'`,
      [tenantId, JSON.stringify({
        assistantId: inbound.data.assistantId,
        outboundAssistantId: outbound.data.assistantId,
        brandId: profile.brand_id,
        assistantStatus: "configured",
        assistantSyncedAt: now
      })]
    );
    await client.query(
      `update public.office_manager_channel_configs
          set provider_key='retell_voice',status='ready',inbound_enabled=true,outbound_enabled=true,
              live_actions_enabled=true,setup_notes='Retell inbound and outbound agents are synchronized to the signed Ferocity Calls tools.',
              metadata_json=metadata_json || $2::jsonb,updated_at=now()
        where tenant_id=$1 and channel_key='phone'`,
      [tenantId, JSON.stringify({ assistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId, syncedAt: now })]
    );
    const numberUpdate = await client.query(
      `update public.telephony_numbers
          set status='active',inbound_enabled=true,outbound_enabled=true,
              routing_json=routing_json || $3::jsonb,metadata_json=metadata_json || $4::jsonb,updated_at=now()
        where tenant_id=$1 and provider_key='retell_voice' and phone_number=$2 and compliance_status='ready'
        returning id`,
      [tenantId, retellConfiguration.phoneNumber,
        JSON.stringify({ inboundWebhook: `${appUrl}/api/integrations/voice-ai/inbound`, eventWebhook: `${appUrl}/api/integrations/voice-ai/webhook` }),
        JSON.stringify({ assistantId: inbound.data.assistantId, outboundAssistantId: outbound.data.assistantId, verifiedAt: now })]
    );
    if (!numberUpdate.rows[0]) throw new Error("The Retell number was not compliance-ready, so Ferocity did not enable it.");
  });

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    inboundAssistantId: inbound.data.assistantId,
    outboundAssistantId: outbound.data.assistantId,
    phoneAssigned: true,
    inboundEnabled: true,
    outboundEnabled: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
