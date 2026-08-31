import fs from "node:fs";
import pg from "pg";

const localEnv = {};
const localEnvPath = new URL("../.env.local", import.meta.url);
if (fs.existsSync(localEnvPath)) {
  for (const raw of fs.readFileSync(localEnvPath, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    localEnv[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const processEnv = typeof process === "undefined" ? {} : process.env;
const runtimeEnv = { ...localEnv, ...processEnv };
const injectedRetellKey = typeof globalThis.__FEROCITY_RETELL_API_KEY === "string"
  ? globalThis.__FEROCITY_RETELL_API_KEY.trim()
  : "";
const injectedAppUrl = typeof globalThis.__FEROCITY_APP_URL === "string"
  ? globalThis.__FEROCITY_APP_URL.trim()
  : "";
const required = ["DATABASE_URL"];
for (const key of required) {
  if (!runtimeEnv[key]?.trim()) throw new Error(`${key} is required.`);
}
if (!runtimeEnv.RETELL_API_KEY?.trim() && !injectedRetellKey) throw new Error("RETELL_API_KEY is required.");
if (!runtimeEnv.FEROCITY_APP_URL?.trim() && !injectedAppUrl) throw new Error("FEROCITY_APP_URL is required.");

const tenantId = runtimeEnv.FEROCITY_TENANT_ID?.trim() || "11111111-1111-4111-8111-111111111111";
const appUrl = (injectedAppUrl || runtimeEnv.FEROCITY_APP_URL).replace(/\/+$/, "");
const apiKey = runtimeEnv.RETELL_API_KEY?.trim() || injectedRetellKey;
const client = new pg.Client({ connectionString: runtimeEnv.DATABASE_URL });

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
    const detail = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : "";
    throw new Error(`Retell ${method} ${path} failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  return body;
}

await client.connect();
try {
  const context = await client.query(
    `select p.id,p.brand_id,p.display_name,p.default_tone,p.metadata_json
     from public.office_manager_profiles p
     where p.tenant_id=$1 and p.status in ('ready','active')
     order by p.updated_at desc limit 1`,
    [tenantId]
  );
  const profile = context.rows[0];
  if (!profile) throw new Error("Prepare the Office Manager before provisioning the private owner agent.");

  const providerContext = await client.query(
    `select metadata_json from public.provider_accounts
     where tenant_id=$1 and provider_key='retell_voice' limit 1`,
    [tenantId]
  );
  const providerMetadata = providerContext.rows[0]?.metadata_json || {};

  const existingAssistantId = typeof profile.metadata_json?.ownerVoiceAssistantId === "string"
    ? profile.metadata_json.ownerVoiceAssistantId
    : null;
  const prompt = [
    "You are Ferocity's private AI Office Manager speaking with a verified workspace owner.",
    `Speaking style: ${profile.default_tone || "warm, concise, direct, and natural"}.`,
    "This is not the public receptionist or sales agent. Never discuss another workspace or use information outside the supplied briefing context.",
    "Start with a brief AI disclosure, greet {{owner_name}}, and explain the most important item in {{briefing_context}} in plain language.",
    "The requested briefing type is {{briefing_type}}.",
    "Ask what the owner wants to do next. Give a recommendation when useful, but distinguish facts from your recommendation.",
    "Use only record IDs contained in briefing_context. Never invent a customer, lead, job, estimate, workflow, action-request, or record ID.",
    "Discussion is not authorization. Before contacting anyone or changing a contact preference, ask for clear approval. Before changing pricing, schedules, automation, money, or another high-impact setting, explain the consequence and ask for a second confirmation.",
    "Use owner_business_action only after the required approval. Set explicit_approval and secondary_confirmation truthfully from the conversation; never infer either flag.",
    "If the tool asks for fresh owner verification or review in the app, say so plainly and do not claim the action completed.",
    "Never ask for passwords, API keys, full card numbers, Social Security numbers, banking credentials, or a verification code during this call.",
    "End with a concise recap of what was completed, queued, blocked, or left for review.",
    "Keep the briefing useful and natural, not artificially long. Do not repeat decisions or details the owner already confirmed.",
    "When the owner says goodbye, declines further help, confirms nothing else is needed, or the recap is complete, say a brief natural closing and use end_call. Do not end while the owner is still asking a question or deciding."
  ].join("\n");
  const llmPayload = {
    model: "gpt-4.1-mini",
    model_temperature: 0,
    tool_call_strict_mode: true,
    general_prompt: prompt,
    begin_message: "Hi {{owner_name}}. I'm Ferocity's AI Office Manager. I have a {{briefing_type}} update and I'll keep it concise.",
    default_dynamic_variables: {
      owner_name: "the owner",
      briefing_type: "business briefing",
      briefing_context: "No verified briefing items were supplied. Explain that no action can be taken from this call."
    },
    general_tools: [{
      type: "end_call",
      name: "end_call",
      description: "Politely end when the owner says goodbye, declines further help, confirms nothing else is needed, or the concise recap is complete."
    }, {
      type: "custom",
      name: "owner_business_action",
      description: "Prepare or perform an owner-authorized Ferocity action using only real IDs supplied in briefing_context. The API independently enforces authentication, approval, confirmation, tenant isolation, and idempotency.",
      url: `${appUrl}/api/integrations/voice-ai/tools/owner-command`,
      method: "POST",
      timeout_ms: 12000,
      args_at_root: false,
      parameter_type: "json",
      speak_during_execution: true,
      execution_message_type: "static_text",
      execution_message_description: "One moment while I check Ferocity's authority and safety rules.",
      speak_after_execution: true,
      parameters: {
        type: "object",
        required: ["original_instruction", "action_payload", "explicit_approval", "secondary_confirmation"],
        properties: {
          original_instruction: { type: "string", description: "The owner's instruction in their own words." },
          action_payload: { type: "string", description: "A JSON object for one supported action, using only record IDs present in briefing_context." },
          explicit_approval: { type: "boolean", description: "True only when the owner clearly approved this exact action." },
          secondary_confirmation: { type: "boolean", description: "True only after a separate second confirmation for a high-impact action." }
        }
      }
    }]
  };
  const agentPayload = {
    agent_name: "Ferocity Private Owner Office Manager",
    voice_id: runtimeEnv.RETELL_OWNER_VOICE_ID?.trim() || "retell-Cimo",
    webhook_url: `${appUrl}/api/integrations/voice-ai/webhook`,
    webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
    webhook_timeout_ms: 10000,
    max_call_duration_ms: 1200000,
    end_call_after_silence_ms: 60000,
    reminder_trigger_ms: 15000,
    reminder_max_count: 1,
    data_storage_setting: "everything_except_pii",
    opt_in_signed_url: true,
    allow_user_dtmf: true,
    metadata: { ferocityTenantId: tenantId, ferocityBrandId: profile.brand_id, purpose: "private_owner_office_manager" }
  };

  let assistantId = existingAssistantId;
  if (assistantId) {
    const current = await retell(`/get-agent/${encodeURIComponent(assistantId)}`);
    const llmId = current?.response_engine?.llm_id;
    if (!llmId) throw new Error("The existing private owner agent has no editable Retell LLM.");
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
    if (!assistantId) throw new Error("Retell did not return an owner agent id.");
  }

  const outboundLlmPayload = {
    model: "gpt-4.1-mini",
    model_temperature: 0,
    tool_call_strict_mode: true,
    general_prompt: [
      "You are Ferocity's customer-facing AI service coordinator calling a person who consented to this call.",
      "This is always an OUTBOUND call. The person did not call you, so never open with or fall back to 'What can I help you with?' before you have clearly explained why you called.",
      "Introduce yourself as Ferocity's AI assistant calling on behalf of {{business_name}}. Never pretend to be human.",
      "You are calling {{contact_name}} for this exact reason: {{call_purpose}}.",
      "The call scenario is {{call_scenario}} and the intended outcome is {{desired_outcome}}.",
      "Verified business context: {{business_context}}.",
      "Verified contact, job, estimate, invoice, or prior-conversation context: {{contact_context}}.",
      "Allowed next steps: {{allowed_next_steps}}.",
      "Stay within the stated purpose. Be warm, concise, natural, and respectful of interruptions. Use short conversational turns and answer the person's question before asking another one.",
      "Your first spoken turn must include all five items in this order: the person's name when known, that you are Ferocity's AI assistant, the business you represent, the concrete call_purpose, and a brief permission question such as 'Is now an okay time?'. Do not replace this opening with a generic greeting.",
      "If the person asks why you called, answer immediately and directly with call_purpose and the relevant supplied contact_context. Do not ask what they need, what you can help with, or make them repeat the question.",
      "Do not make the person explain why Ferocity called. State the supplied reason clearly. When context_quality is limited, acknowledge that you have only a brief note, give the specific call_purpose, and ask one useful clarifying question.",
      "Do not invent prices, appointments, promises, policies, job details, or completed actions. Never use missing context as permission to guess.",
      "Do not promise that someone will call back. If the person actually requests a human callback, confirm their name, callback number, and reason, then use create_sales_callback. Say it is recorded only when the tool returns ok true.",
      "If the person asks not to receive AI calls, apologize, end promptly, and state that their preference will be recorded.",
      "Never request passwords, verification codes, full payment-card details, Social Security numbers, or banking credentials.",
      "Close with the agreed next step without claiming it is completed unless a connected Ferocity tool confirmed it.",
      "Keep the call useful and natural, not artificially long. Do not repeat the purpose, questions, or facts the person already confirmed.",
      "When the person says goodbye, declines the call or further help, asks not to be called, confirms nothing else is needed, or the agreed next step and brief recap are complete, apologize or close naturally as appropriate and use end_call. Do not end while the person is still asking a question or providing information."
    ].join("\n"),
    begin_message: "Hi {{contact_name}}. I'm Ferocity's AI service coordinator calling on behalf of {{business_name}}. The reason for my call is {{call_purpose}}. Is now an okay time?",
    default_dynamic_variables: {
      contact_name: "there",
      contact_type: "contact",
      business_name: "the business",
      call_purpose: "a service follow-up",
      call_scenario: "general_service",
      desired_outcome: "Explain the reason for the call and agree on one useful next step.",
      business_context: "Use only the business name and call purpose supplied for this call.",
      contact_context: "No additional customer or job facts were supplied. Clarify naturally without making the person explain why Ferocity called.",
      context_quality: "limited",
      allowed_next_steps: "Answer from supplied context, clarify naturally, and record a callback only through the connected tool."
    },
    general_tools: [{
      type: "end_call",
      name: "end_call",
      description: "Politely end after the person declines the call or further help, asks not to be called, says goodbye, confirms nothing else is needed, or the agreed next step and brief recap are complete."
    }, {
      type: "custom",
      name: "create_sales_callback",
      description: "Record a real human callback request after the person confirms their name, callback number, and reason. Use the returned ok value before saying it was recorded.",
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
          caller_name: { type: "string", description: "The person's confirmed name." },
          business_name: { type: "string", description: "The business name only when the person supplied it." },
          callback_number: { type: "string", description: "The callback number confirmed by the person." },
          email: { type: "string", description: "The person's email only when offered." },
          reason: { type: "string", description: "Why the person wants a human callback and the requested outcome." },
          urgency: { type: "string", enum: ["normal", "high"], description: "High only for a stated time-sensitive need." },
          preferred_time: { type: "string", description: "A preferred callback window only when stated; it is not a confirmed appointment." }
        }
      }
    }]
  };
  const outboundAgentPayload = {
    agent_name: "Ferocity Customer Follow-up",
    voice_id: runtimeEnv.RETELL_OUTBOUND_VOICE_ID?.trim() || "retell-Cimo",
    webhook_url: `${appUrl}/api/integrations/voice-ai/webhook`,
    webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
    webhook_timeout_ms: 10000,
    max_call_duration_ms: 1200000,
    end_call_after_silence_ms: 45000,
    reminder_trigger_ms: 12000,
    reminder_max_count: 1,
    data_storage_setting: "everything_except_pii",
    opt_in_signed_url: true,
    post_call_analysis_data: [
      {
        type: "system-presets",
        name: "call_summary",
        description: "Write a brief, factual summary of this outbound call. State why Ferocity called, whether the agent clearly explained that purpose, what the person actually said or requested, and the agreed next step. Do not describe the person as refusing information merely because they asked why the agent called. If the agent failed to explain the purpose, say that plainly and do not blame the person. Do not invent intent, consent, interest, or a completed follow-up."
      },
      {
        type: "system-presets",
        name: "call_successful",
        description: "Mark successful only if the agent clearly explained the supplied outbound call purpose and either answered the person's question, recorded a requested next step through a successful tool, or ended respectfully after the person declined. A connected call is not automatically successful."
      },
      {
        type: "system-presets",
        name: "user_sentiment",
        description: "Classify the person's sentiment from their words and tone. Treat reasonable confusion caused by an unclear agent opening as confusion, not hostility or unwillingness to cooperate."
      }
    ],
    metadata: { ferocityTenantId: tenantId, ferocityBrandId: profile.brand_id, purpose: "customer_outbound_followup" }
  };
  let outboundAssistantId = typeof providerMetadata.outboundAssistantId === "string"
    ? providerMetadata.outboundAssistantId
    : null;
  if (outboundAssistantId) {
    const current = await retell(`/get-agent/${encodeURIComponent(outboundAssistantId)}`);
    const llmId = current?.response_engine?.llm_id;
    if (!llmId) throw new Error("The existing customer outbound agent has no editable Retell LLM.");
    await Promise.all([
      retell(`/update-retell-llm/${encodeURIComponent(llmId)}`, "PATCH", outboundLlmPayload),
      retell(`/update-agent/${encodeURIComponent(outboundAssistantId)}`, "PATCH", outboundAgentPayload)
    ]);
  } else {
    const llm = await retell("/create-retell-llm", "POST", outboundLlmPayload);
    if (!llm?.llm_id) throw new Error("Retell did not return a customer outbound LLM id.");
    const agent = await retell("/create-agent", "POST", {
      ...outboundAgentPayload,
      response_engine: { type: "retell-llm", llm_id: llm.llm_id }
    });
    outboundAssistantId = agent?.agent_id;
    if (!outboundAssistantId) throw new Error("Retell did not return a customer outbound agent id.");
  }

  const verifiedOutboundAgent = await retell(`/get-agent/${encodeURIComponent(outboundAssistantId)}`);
  const verifiedOutboundLlmId = verifiedOutboundAgent?.response_engine?.llm_id;
  if (!verifiedOutboundLlmId) throw new Error("The synchronized customer outbound agent has no Retell LLM.");
  const verifiedOutboundLlm = await retell(`/get-retell-llm/${encodeURIComponent(verifiedOutboundLlmId)}`);
  if (verifiedOutboundLlm?.begin_message !== outboundLlmPayload.begin_message) {
    throw new Error("Retell did not retain the required customer outbound opening message.");
  }
  if (!String(verifiedOutboundLlm?.general_prompt || "").includes("This is always an OUTBOUND call")) {
    throw new Error("Retell did not retain the customer outbound purpose contract.");
  }

  await client.query("begin");
  try {
    await client.query(
      `update public.office_manager_profiles
       set metadata_json=metadata_json || $3::jsonb,updated_at=now()
       where tenant_id=$1 and id=$2`,
      [tenantId, profile.id, JSON.stringify({
        ownerVoiceAssistantId: assistantId,
        ownerVoiceAssistantStatus: "configured",
        ownerVoiceAssistantSyncedAt: new Date().toISOString()
      })]
    );
    await client.query(
      `update public.provider_accounts
       set metadata_json=metadata_json || $2::jsonb,updated_at=now()
       where tenant_id=$1 and provider_key='retell_voice'`,
      [tenantId, JSON.stringify({
        outboundAssistantId,
        outboundAssistantStatus: "configured",
        outboundAssistantSyncedAt: new Date().toISOString()
      })]
    );
    await client.query(
      `insert into public.office_manager_channel_configs (
         tenant_id,brand_id,profile_id,channel_key,provider_key,status,inbound_enabled,
         outbound_enabled,live_actions_enabled,approval_mode,setup_notes,metadata_json
       ) values ($1,$2,$3,'owner_command','retell_voice','ready',false,true,true,'approval_required',$4,$5::jsonb)
       on conflict (tenant_id,brand_id,channel_key) do update
       set provider_key='retell_voice',status='ready',outbound_enabled=true,
           live_actions_enabled=true,approval_mode='approval_required',setup_notes=excluded.setup_notes,
           metadata_json=public.office_manager_channel_configs.metadata_json || excluded.metadata_json,
           updated_at=now()`,
      [tenantId, profile.brand_id, profile.id,
        "Private outbound owner briefings are configured. Calls require a verified destination; external and high-impact actions require current strong owner verification.",
        JSON.stringify({ assistantId, purpose: "private_owner_office_manager", syncedAt: new Date().toISOString() })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    assistantId,
    outboundAssistantId,
    assistantPurpose: "private_owner_office_manager",
    publicReceptionistChanged: false,
    liveCallsRequireVerifiedOwnerDestination: true
  }, null, 2));
} finally {
  await client.end();
}
