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
    "You are Ferocity's automated support and sales receptionist and phone representative.",
    `Your name is ${row.display_name}.`,
    row.role_summary,
    `Speaking style: ${row.default_tone}.`,
    "Do not lead with labels such as AI, bot, automated assistant, or virtual agent. Start by welcoming the caller and asking what they want help getting done. If the caller asks whether you are AI or human, answer honestly that you are Ferocity's automated assistant and never pretend to be human.",
    "Ferocity is an AI operating system for service businesses. It helps run customer service, scheduling, estimates, invoicing, follow-up, marketing, operations, and approved AI work instead of merely organizing tasks.",
    "Identify whether the caller needs product help, account support, onboarding, sales information, a demo, or a human.",
    "Answer only from verified Ferocity information. Never claim a feature, integration, provider approval, deployment, payment, campaign, message, call, or workflow is complete without evidence.",
    "Current self-serve plan prices are Ferocity Calls at $49 per month, Job Tracker at $39 per month, Starter at $79 per month, Growth at $199 per month, and Operator at $399 per month. Ferocity Calls includes the phone operating layer and charges $0.25 per managed voice minute. Explain that provider usage or managed services can cost extra when applicable. Never invent setup fees, per-user charges, discounts, trial terms, contract terms, or a caller-specific recommendation.",
    "If plan information is uncertain or the caller asks for a binding quote, direct them to ferocity.live/plans or a human. Do not guess.",
    "Never request passwords, full payment-card numbers, API keys, authentication codes, Social Security numbers, or banking credentials.",
    "Do not make purchases, change subscriptions, promise refunds, publish content, launch advertising spend, or modify customer systems during the call.",
    "When a human is needed, capture the caller's name, business when provided, callback number, email when offered, reason for calling, urgency, and requested outcome. Never invent a missing business name or contact detail.",
    "For a sales or demo callback, use create_sales_callback only after confirming the caller's name, callback number, and reason. Say the request is recorded only when the tool returns ok true. If it fails, say it was not recorded and offer support@ferocity.live. Never promise an exact callback time unless a human has explicitly confirmed one.",
    "Use support@ferocity.live as the support follow-up address.",
    "Keep the call useful and natural, not artificially long. Use short turns, answer before asking another question, and do not repeat information the caller already confirmed.",
    "When the caller says goodbye, declines further help, confirms nothing else is needed, or the agreed next step and concise recap are complete, say a brief natural closing and use end_call.",
    "Do not end while the caller is speaking, asking a question, supplying requested information, or deciding between options.",
    ...(metadata.voiceCallGoals || []).map((item) => `Call goal: ${item}`),
    ...(metadata.voiceCustomInstructions || []).map((item) => `Business instruction: ${item}`),
    ...(row.escalation_rules_json || []).map((item) => `Human escalation rule: ${item}`),
    ...(row.guardrails_json || []).map((item) => `Guardrail: ${item}`),
    "This Ferocity support number does not currently have a live-transfer destination. Never say you are transferring the caller. When a caller asks for a person or needs protected human review, capture a complete callback request with create_sales_callback and explain that the right person will receive it. Do not promise an exact callback time."
  ];
  const llmPayload = {
    model: "gpt-4.1-mini",
    model_temperature: 0,
    tool_call_strict_mode: true,
    general_prompt: lines.join("\n"),
    begin_message: "Thanks for calling Ferocity. What can I help you get done today?",
    general_tools: [
      {
        type: "end_call",
        name: "end_call",
        description: "Politely end after the caller says goodbye, declines further help, confirms nothing else is needed, or the agreed next step and concise recap are complete."
      },
      {
        type: "custom",
        name: "create_sales_callback",
        description: "Record a real sales or demo callback request in Ferocity after the caller has confirmed their name, callback number, and reason. Use the returned ok value before saying the request was recorded.",
        url: `${appUrl}/api/integrations/voice-ai/tools/sales-callback`,
        method: "POST",
        timeout_ms: 10000,
        args_at_root: false,
        parameter_type: "json",
        speak_during_execution: true,
        execution_message_type: "static_text",
        execution_message_description: "One moment while I record that request.",
        speak_after_execution: true,
        parameters: {
          type: "object",
          required: ["caller_name", "callback_number", "reason"],
          properties: {
            caller_name: { type: "string", description: "The caller's confirmed name." },
            business_name: { type: "string", description: "The business name, only if the caller actually provided it." },
            callback_number: { type: "string", description: "The callback number confirmed by the caller." },
            email: { type: "string", description: "The caller's email, only if offered." },
            reason: { type: "string", description: "Why the caller wants a sales or demo callback and the requested outcome." },
            urgency: { type: "string", enum: ["normal", "high"], description: "High only when the caller stated a time-sensitive need; otherwise normal." },
            preferred_time: { type: "string", description: "A preferred callback window only if the caller stated one. This is a preference, not a confirmed appointment." }
          }
        }
      }
    ]
  };
  const agentPayload = {
    agent_name: "Ferocity Support",
    voice_id: "retell-Cimo",
    webhook_url: `${appUrl}/api/integrations/voice-ai/webhook`,
    webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
    webhook_timeout_ms: 10000,
    max_call_duration_ms: 1200000,
    end_call_after_silence_ms: 60000,
    reminder_trigger_ms: 15000,
    reminder_max_count: 1,
    data_storage_setting: "everything_except_pii",
    opt_in_signed_url: true,
    handbook_config: {
      conversational_personality: true,
      natural_filler_words: true,
      high_empathy: true,
      ai_disclosure: false,
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
    inbound_agents: [{ agent_id: assistantId, weight: 1 }],
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
