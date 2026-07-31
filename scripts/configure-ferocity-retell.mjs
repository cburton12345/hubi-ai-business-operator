import pg from "pg";

const required = ["DATABASE_URL", "RETELL_API_KEY", "VOICE_PHONE_NUMBER"];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`${key} is required.`);
}

const tenantId = "11111111-1111-4111-8111-111111111111";
const appUrl = (process.env.FEROCITY_APP_URL || "https://ferocity.live").replace(/\/+$/, "");
const phoneNumber = process.env.VOICE_PHONE_NUMBER.trim();
const apiKey = process.env.RETELL_API_KEY.trim();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function retell(path, method = "GET", payload) {
  const response = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(payload ? { "Content-Type": "application/json" } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : "";
    throw new Error(
      `Retell ${method} ${path} failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`
    );
  }
  return body;
}

await client.connect();

try {
  const context = await client.query(
    `
    select
      b.id as brand_id,
      b.name,
      b.description,
      p.id as profile_id,
      p.display_name,
      p.role_summary,
      p.default_tone,
      p.escalation_rules_json,
      p.guardrails_json,
      p.metadata_json,
      nullif(a.metadata_json->>'assistantId', '') as assistant_id
    from public.brands b
    join public.office_manager_profiles p
      on p.tenant_id = b.tenant_id and p.brand_id = b.id
    join public.provider_accounts a
      on a.tenant_id = b.tenant_id and a.provider_key = 'retell_voice'
    where b.tenant_id = $1 and b.slug = 'ferocity'
    limit 1
    `,
    [tenantId]
  );
  const row = context.rows[0];
  if (!row) throw new Error("Ferocity support profile is not prepared. Run migrations first.");

  const metadata = row.metadata_json || {};
  const lines = [
    "You are Ferocity's AI support assistant and phone representative.",
    `Your name is ${row.display_name}.`,
    row.role_summary,
    `Speaking style: ${row.default_tone}.`,
    "Start with a brief AI disclosure. Be warm, concise, patient, and natural.",
    "Ferocity is an AI operating system for service businesses. It helps run customer service, scheduling, estimates, invoicing, follow-up, marketing, operations, and approved AI work instead of merely organizing tasks.",
    "Identify whether the caller needs product help, account support, onboarding, sales information, a demo, or a human.",
    "Answer only from verified Ferocity information. Never claim a feature, integration, provider approval, deployment, payment, campaign, message, call, or workflow is complete without evidence.",
    "Never request passwords, full payment-card numbers, API keys, authentication codes, Social Security numbers, or banking credentials.",
    "Do not make purchases, change subscriptions, promise refunds, publish content, launch advertising spend, or modify customer systems during the call.",
    "When a human is needed, capture the caller's name, business, callback number, email when offered, reason for calling, urgency, and requested outcome. Tell them the Ferocity team will follow up.",
    "Use support@ferocity.live as the support follow-up address.",
    ...(metadata.voiceCallGoals || []).map((item) => `Call goal: ${item}`),
    ...(metadata.voiceCustomInstructions || []).map((item) => `Business instruction: ${item}`),
    ...(row.escalation_rules_json || []).map((item) => `Human escalation rule: ${item}`),
    ...(row.guardrails_json || []).map((item) => `Guardrail: ${item}`)
  ];
  const llmPayload = {
    model: "gpt-4.1-mini",
    general_prompt: lines.join("\n"),
    begin_message: metadata.voiceGreeting || "Thank you for calling Ferocity. I'm Ferocity's AI support assistant. How can I help you today?"
  };
  const agentPayload = {
    agent_name: "Ferocity AI Support",
    voice_id: "retell-Cimo",
    webhook_url: `${appUrl}/api/integrations/voice-ai/webhook`,
    webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
    webhook_timeout_ms: 10000,
    max_call_duration_ms: 900000,
    data_storage_setting: "everything_except_pii",
    opt_in_signed_url: true,
    handbook_config: {
      conversational_personality: true,
      natural_filler_words: true,
      high_empathy: true,
      ai_disclosure: true,
      scope_boundaries: true
    },
    metadata: {
      ferocityTenantId: tenantId,
      ferocityBrandId: row.brand_id,
      purpose: "ferocity_support"
    }
  };

  let assistantId = row.assistant_id;
  if (assistantId) {
    const current = await retell(`/get-agent/${encodeURIComponent(assistantId)}`);
    const llmId = current?.response_engine?.llm_id;
    if (!llmId) throw new Error("The existing Retell agent has no editable Retell LLM.");
    await Promise.all([
      retell(`/update-retell-llm/${encodeURIComponent(llmId)}`, "PATCH", llmPayload),
      retell(`/update-agent/${encodeURIComponent(assistantId)}`, "PATCH", agentPayload)
    ]);
  } else {
    const llm = await retell("/create-retell-llm", "POST", llmPayload);
    if (!llm?.llm_id) throw new Error("Retell did not return an LLM id.");
    const agent = await retell("/create-agent", "POST", {
      ...agentPayload,
      response_engine: { type: "retell-llm", llm_id: llm.llm_id }
    });
    assistantId = agent?.agent_id;
    if (!assistantId) throw new Error("Retell did not return an agent id.");
  }

  await retell(`/update-phone-number/${encodeURIComponent(phoneNumber)}`, "PATCH", {
    inbound_agents: null,
    outbound_agents: [{ agent_id: assistantId, weight: 1 }],
    inbound_webhook_url: `${appUrl}/api/integrations/voice-ai/inbound`,
    nickname: "Ferocity Support"
  });

  await client.query("begin");
  try {
    await client.query(
      `
      update public.provider_accounts
      set metadata_json = metadata_json || $2::jsonb,
          status = 'paused',
          credentials_status = 'configured',
          ownership_mode = 'ferocity_managed',
          live_actions_enabled = false,
          updated_at = now()
      where tenant_id = $1 and provider_key = 'retell_voice'
      `,
      [
        tenantId,
        JSON.stringify({
          assistantId,
          brandId: row.brand_id,
          phoneNumber,
          assistantStatus: "configured",
          assistantSyncedAt: new Date().toISOString()
        })
      ]
    );
    await client.query(
      `
      update public.office_manager_channel_configs
      set provider_key = 'retell_voice',
          status = 'ready',
          inbound_enabled = false,
          outbound_enabled = false,
          live_actions_enabled = false,
          setup_notes = 'The Ferocity support agent and signed Retell webhooks are configured. Activate after the first real call is verified.',
          metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where tenant_id = $1 and brand_id = $2 and channel_key = 'phone'
      `,
      [
        tenantId,
        row.brand_id,
        JSON.stringify({ assistantId, phoneNumber, syncedAt: new Date().toISOString() })
      ]
    );
    await client.query(
      `
      update public.telephony_numbers
      set status = 'active',
          inbound_enabled = false,
          outbound_enabled = false,
          routing_json = routing_json || $3::jsonb,
          metadata_json = metadata_json || $4::jsonb,
          updated_at = now()
      where tenant_id = $1 and phone_number = $2
      `,
      [
        tenantId,
        phoneNumber,
        JSON.stringify({
          inboundWebhook: `${appUrl}/api/integrations/voice-ai/inbound`,
          eventWebhook: `${appUrl}/api/integrations/voice-ai/webhook`
        }),
        JSON.stringify({ assistantId, verifiedAt: new Date().toISOString() })
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const verifiedAgent = await retell(`/get-agent/${encodeURIComponent(assistantId)}`);
  const verifiedNumber = await retell(`/get-phone-number/${encodeURIComponent(phoneNumber)}`);
  console.log(JSON.stringify({
    ok: true,
    assistantId,
    assistantName: verifiedAgent?.agent_name || null,
    phoneNumber: verifiedNumber?.phone_number || phoneNumber,
    inboundWebhookConfigured: verifiedNumber?.inbound_webhook_url === `${appUrl}/api/integrations/voice-ai/inbound`,
    liveActionsEnabled: false,
    nextStep: "Deploy the prepared production environment, then place and verify the first real call before activating live actions."
  }, null, 2));
} finally {
  await client.end();
}
