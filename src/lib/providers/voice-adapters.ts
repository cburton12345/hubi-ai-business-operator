import crypto from "node:crypto";
import type {
  InboundCallEvent,
  ProviderContext,
  ProviderResult,
  VoiceAgentProvider,
  VoiceProviderConnection
} from "@/lib/providers/interfaces";
import { resolveVapiConfiguration, resolveVapiWebhookTenant } from "@/lib/providers/vapi-config";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { retellBusinessTools } from "@/lib/phone/retell-tool-definitions";
import {
  abandonOutboundCapacityReservation,
  activateOutboundCapacityReservation,
  reserveOutboundCapacity
} from "@/lib/phone/outbound-capacity";

function notConfigured(providerKey: string): ProviderResult<never> {
  return {
    ok: false,
    errorCategory: "provider_not_configured",
    safeMessage: `${providerKey} is not configured or live actions are disabled. Add encrypted provider credentials and approve the route first.`,
    retryable: false
  };
}

function safeJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function genericNormalizedEvent(providerKey: string, body: Record<string, unknown>): InboundCallEvent {
  const providerCallId = text(body.call_id) ?? text(body.callId) ?? text(body.id) ?? `${providerKey}-${Date.now()}`;
  const providerEventId = text(body.event_id) ?? text(body.eventId) ?? text(body.id) ?? providerCallId;
  return {
    providerKey,
    providerCallId,
    providerEventId,
    callerNumber: text(body.from) ?? text(body.callerNumber),
    calledNumber: text(body.to) ?? text(body.calledNumber),
    status: "received",
    occurredAt: new Date().toISOString(),
    metadata: { normalizedBy: "ferocity_voice_adapter" }
  };
}

abstract class PlannedVoiceAdapter implements VoiceAgentProvider {
  abstract providerKey: string;
  abstract displayName: string;
  adapterStatus = "planned" as const;

  matchesWebhook(_payload: Record<string, unknown>) {
    return false;
  }

  async getConnection(_context: ProviderContext, _requireLiveActions: boolean) {
    return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
  }

  async verifyConnection(_context: ProviderContext, _input: { assistantId: string; webhookUrl: string; inboundWebhookUrl?: string }) {
    return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
  }

  async createOrUpdateAssistant(_context: ProviderContext, _config: Record<string, unknown>) {
    return notConfigured(this.providerKey) as ProviderResult<{ assistantId: string; status: string }>;
  }

  async startOutboundCall(_context: ProviderContext, _input: {
    toNumber: string;
    fromNumber: string;
    assistantId: string;
    dynamicVariables?: Record<string, string>;
  }) {
    return notConfigured(this.providerKey) as ProviderResult<{ providerCallId: string; status: string }>;
  }

  async normalizeWebhook(_headers: Headers, rawBody: string) {
    return {
      ok: true,
      data: genericNormalizedEvent(this.providerKey, safeJson(rawBody))
    } as ProviderResult<InboundCallEvent>;
  }
}

async function vapiRequest(
  apiKey: string,
  path: string,
  method: "POST" | "PATCH",
  payload: Record<string, unknown>
) {
  const response = await resilientFetch(`https://api.vapi.ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { timeoutMs: 15_000 });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}

function assistantPayload(context: ProviderContext, config: Record<string, unknown>) {
  const allowed = [
    "name",
    "firstMessage",
    "firstMessageMode",
    "model",
    "voice",
    "transcriber",
    "server",
    "serverMessages",
    "clientMessages",
    "endCallMessage",
    "endCallPhrases",
    "silenceTimeoutSeconds",
    "maxDurationSeconds",
    "backgroundSound",
    "analysisPlan",
    "artifactPlan"
  ];
  const payload: Record<string, unknown> = {};
  for (const key of allowed) {
    if (config[key] !== undefined) payload[key] = config[key];
  }
  payload.metadata = {
    ...record(config.metadata),
    ferocityTenantId: context.tenantId,
    ferocityBrandId: context.brandId ?? null
  };
  return payload;
}

function vapiStatus(messageType: string | null, rawStatus: string | null, endedReason: string | null): InboundCallEvent["status"] {
  if (messageType === "end-of-call-report" || rawStatus === "ended" || rawStatus === "completed") {
    return endedReason?.includes("customer-did-not-answer") ? "missed" : "completed";
  }
  if (rawStatus === "ringing" || rawStatus === "queued") return "ringing";
  if (rawStatus === "in-progress" || rawStatus === "in_progress") return "in_progress";
  if (rawStatus === "failed" || endedReason?.includes("error")) return "failed";
  return "received";
}

async function retellRequest(
  apiKey: string,
  path: string,
  method: "GET" | "POST" | "PATCH",
  payload?: Record<string, unknown>
) {
  const response = await resilientFetch(`https://api.retellai.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(payload ? { "Content-Type": "application/json" } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store"
  }, { timeoutMs: 15_000, retries: method === "GET" ? 1 : 0 });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}

function retellSystemPrompt(config: Record<string, unknown>) {
  const model = record(config.model);
  const messages = Array.isArray(model.messages) ? model.messages : [];
  const systemMessage = messages.find((message) => record(message).role === "system");
  const base = text(record(systemMessage).content)
    ?? "Act as the business's AI receptionist. Collect only necessary information and escalate uncertain, financial, legal, or safety matters.";
  return [
    base,
    "Keep the conversation useful and natural, not artificially long. Use short turns, answer before asking another question, and do not repeat information the caller already confirmed.",
    "When the caller says goodbye, declines further help, confirms nothing else is needed, or the agreed next step and concise recap are complete, say a brief natural closing and use end_call.",
    "Do not end while the caller is speaking, asking a question, supplying requested information, or deciding between options. Never invent urgency merely to shorten the call."
  ].join("\n");
}

export function verifyRetellSignature(rawBody: string, apiKey: string, signature: string | null) {
  const match = signature?.match(/^v=(\d+),d=([a-f0-9]+)$/i);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(`${rawBody}${match[1]}`).digest("hex");
  return constantTimeEqual(expected, match[2].toLowerCase());
}

function retellStatus(event: string | null, callStatus: string | null, reason: string | null): InboundCallEvent["status"] {
  if (event?.startsWith("transfer_") || reason === "call_transfer") return "transferred";
  if (["dial_no_answer", "dial_busy", "user_declined"].includes(reason ?? "")) return "missed";
  if (callStatus === "not_connected" || callStatus === "error" || reason?.startsWith("error_") || reason === "dial_failed") return "failed";
  if (event === "call_ended" || event === "call_analyzed" || callStatus === "ended") return "completed";
  if (event === "call_started" || callStatus === "ongoing") return "in_progress";
  return "received";
}

export class VapiVoiceAdapter implements VoiceAgentProvider {
  providerKey = "vapi_voice";
  displayName = "Vapi";
  adapterStatus = "live" as const;

  matchesWebhook(payload: Record<string, unknown>) {
    const message = record(payload.message);
    return payload.provider === this.providerKey || Boolean(message.call);
  }

  async getConnection(
    context: ProviderContext,
    requireLiveActions: boolean
  ): Promise<ProviderResult<VoiceProviderConnection>> {
    const credentials = await resolveVapiConfiguration(context.tenantId, requireLiveActions);
    if (!credentials?.phoneNumber || !credentials.phoneNumberId) {
      return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
    }
    return {
      ok: true,
      data: {
        phoneNumber: credentials.phoneNumber,
        providerResourceId: credentials.phoneNumberId
      }
    };
  }

  async verifyConnection(
    context: ProviderContext,
    input: { assistantId: string; webhookUrl: string; inboundWebhookUrl?: string }
  ): Promise<ProviderResult<VoiceProviderConnection>> {
    const credentials = await resolveVapiConfiguration(context.tenantId, false);
    if (!credentials?.phoneNumber || !credentials.phoneNumberId || !credentials.webhookCredentialId) {
      return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
    }
    const assistantResponse = await fetch(
      `https://api.vapi.ai/assistant/${encodeURIComponent(input.assistantId)}`,
      {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        cache: "no-store"
      }
    );
    if (!assistantResponse.ok) {
      return {
        ok: false,
        errorCategory: assistantResponse.status === 401 || assistantResponse.status === 403
          ? "provider_authentication"
          : "provider_error",
        safeMessage: `Vapi verification failed with HTTP ${assistantResponse.status}.`,
        retryable: assistantResponse.status === 429 || assistantResponse.status >= 500
      };
    }
    const phoneUpdate = await vapiRequest(
      credentials.apiKey,
      `/phone-number/${encodeURIComponent(credentials.phoneNumberId)}`,
      "PATCH",
      {
        assistantId: input.assistantId,
        server: {
          url: input.webhookUrl,
          credentialId: credentials.webhookCredentialId
        }
      }
    );
    if (!phoneUpdate.response.ok) {
      return {
        ok: false,
        errorCategory: phoneUpdate.response.status === 401 || phoneUpdate.response.status === 403
          ? "provider_authentication"
          : "provider_error",
        safeMessage: `Vapi phone assignment failed with HTTP ${phoneUpdate.response.status}.`,
        retryable: phoneUpdate.response.status === 429 || phoneUpdate.response.status >= 500
      };
    }
    return {
      ok: true,
      data: {
        phoneNumber: credentials.phoneNumber,
        providerResourceId: credentials.phoneNumberId
      }
    };
  }

  async createOrUpdateAssistant(
    context: ProviderContext,
    config: Record<string, unknown>
  ): Promise<ProviderResult<{ assistantId: string; status: string }>> {
    const credentials = await resolveVapiConfiguration(context.tenantId, false);
    if (!credentials) return notConfigured(this.providerKey) as ProviderResult<{ assistantId: string; status: string }>;
    const assistantId = text(config.assistantId);
    const payload = assistantPayload(context, config);
    const server = record(payload.server);
    if (text(server.url) && credentials.webhookCredentialId) {
      payload.server = { ...server, credentialId: credentials.webhookCredentialId };
    }
    const { response, body } = await vapiRequest(
      credentials.apiKey,
      assistantId ? `/assistant/${encodeURIComponent(assistantId)}` : "/assistant",
      assistantId ? "PATCH" : "POST",
      payload
    );
    const returnedId = text(body?.id) ?? assistantId;
    if (!response.ok || !returnedId) {
      return {
        ok: false,
        errorCategory: response.status === 401 || response.status === 403 ? "provider_authentication" : "provider_error",
        safeMessage: `Vapi assistant setup failed with HTTP ${response.status}.`,
        retryable: response.status === 429 || response.status >= 500
      };
    }
    const phoneNumberId = text(config.phoneNumberId);
    if (phoneNumberId) {
      const phoneUpdate = await vapiRequest(
        credentials.apiKey,
        `/phone-number/${encodeURIComponent(phoneNumberId)}`,
        "PATCH",
        {
          assistantId: returnedId,
          ...(config.server ? { server: config.server } : {})
        }
      );
      if (!phoneUpdate.response.ok) {
        return {
          ok: false,
          errorCategory: phoneUpdate.response.status === 401 || phoneUpdate.response.status === 403
            ? "provider_authentication"
            : "provider_error",
          safeMessage: `Vapi assistant was saved, but phone-number assignment failed with HTTP ${phoneUpdate.response.status}.`,
          retryable: phoneUpdate.response.status === 429 || phoneUpdate.response.status >= 500
        };
      }
    }
    return {
      ok: true,
      data: { assistantId: returnedId, status: text(body?.status) ?? "configured" },
      providerRequestId: response.headers.get("x-request-id") ?? undefined
    };
  }

  async startOutboundCall(
    context: ProviderContext,
    input: { toNumber: string; fromNumber: string; assistantId: string; dynamicVariables?: Record<string, string> }
  ): Promise<ProviderResult<{ providerCallId: string; status: string }>> {
    const authorizedTest = context.purpose === "authorized_test";
    if (!context.liveActionsEnabled && !authorizedTest) {
      return {
        ok: false,
        errorCategory: "live_actions_disabled",
        safeMessage: "Outbound voice actions are disabled for this request.",
        retryable: false
      } satisfies ProviderResult<never>;
    }
    const credentials = await resolveVapiConfiguration(context.tenantId, !authorizedTest);
    if (!credentials?.phoneNumberId) {
      return notConfigured(this.providerKey) as ProviderResult<{ providerCallId: string; status: string }>;
    }
    const { response, body } = await vapiRequest(credentials.apiKey, "/call", "POST", {
      assistantId: input.assistantId,
      phoneNumberId: credentials.phoneNumberId,
      customer: { number: input.toNumber },
      ...(input.dynamicVariables ? {
        assistantOverrides: { variableValues: input.dynamicVariables }
      } : {}),
      metadata: {
        ferocityTenantId: context.tenantId,
        ferocityBrandId: context.brandId ?? null,
        ferocityCorrelationId: context.correlationId,
        ferocityIdempotencyKey: context.idempotencyKey
      }
    });
    const callId = text(body?.id);
    if (!response.ok || !callId) {
      return {
        ok: false,
        errorCategory: response.status === 401 || response.status === 403 ? "provider_authentication" : "provider_error",
        safeMessage: `Vapi call creation failed with HTTP ${response.status}.`,
        retryable: response.status === 429 || response.status >= 500
      };
    }
    return {
      ok: true,
      data: { providerCallId: callId, status: text(body?.status) ?? "queued" },
      providerRequestId: response.headers.get("x-request-id") ?? undefined
    };
  }

  async normalizeWebhook(headers: Headers, rawBody: string): Promise<ProviderResult<InboundCallEvent>> {
    const payload = safeJson(rawBody);
    const message = record(payload.message);
    const call = record(message.call ?? payload.call);
    const assistant = record(call.assistant);
    const phoneNumber = record(call.phoneNumber);
    const metadata = {
      ...record(assistant.metadata),
      ...record(phoneNumber.metadata),
      ...record(call.metadata ?? message.metadata ?? payload.metadata)
    };
    const assistantId = text(call.assistantId ?? assistant.id);
    const phoneNumberId = text(call.phoneNumberId ?? phoneNumber.id);
    const tenantId =
      text(metadata.ferocityTenantId ?? metadata.tenantId)
      ?? await resolveVapiWebhookTenant(assistantId, phoneNumberId);
    if (!tenantId) {
      return {
        ok: false,
        errorCategory: "untrusted_tenant",
        safeMessage: "Vapi webhook is missing trusted Ferocity tenant metadata.",
        retryable: false
      };
    }
    const credentials = await resolveVapiConfiguration(tenantId, false);
    const configuredSecret = credentials?.webhookSecret;
    const authorization = headers.get("authorization");
    const receivedSecret =
      (authorization?.startsWith("Bearer ") ? authorization.slice(7) : null)
      ?? headers.get("x-vapi-secret");
    if (!configuredSecret || !receivedSecret || !constantTimeEqual(configuredSecret, receivedSecret)) {
      return {
        ok: false,
        errorCategory: "invalid_signature",
        safeMessage: "Vapi webhook authentication failed.",
        retryable: false
      };
    }

    const artifact = record(message.artifact ?? call.artifact);
    const analysis = record(message.analysis ?? call.analysis);
    const customer = record(call.customer);
    const messageType = text(message.type ?? payload.type);
    const providerCallId = text(call.id);
    if (!providerCallId) {
      return {
        ok: false,
        errorCategory: "invalid_payload",
        safeMessage: "Vapi webhook is missing a call ID.",
        retryable: false
      };
    }
    const startedAt = text(call.startedAt);
    const endedAt = text(call.endedAt);
    const calculatedDuration =
      startedAt && endedAt ? Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt)) / 1000) : null;
    const endedReason = text(message.endedReason ?? call.endedReason);
    return {
      ok: true,
      data: {
        providerKey: this.providerKey,
        providerCallId,
        providerEventId:
          text(message.id ?? payload.id)
          ?? `${providerCallId}:${messageType ?? "event"}:${text(message.timestamp) ?? endedAt ?? startedAt ?? "unknown"}`,
        callerNumber: text(customer.number ?? call.customerNumber),
        calledNumber: text(phoneNumber.number ?? call.phoneNumber),
        status: vapiStatus(messageType, text(message.status ?? call.status), endedReason),
        occurredAt: text(message.timestamp) ?? endedAt ?? startedAt ?? new Date().toISOString(),
        durationSeconds: Math.round(number(message.durationSeconds ?? call.durationSeconds) ?? calculatedDuration ?? 0),
        recordingUrl: text(artifact.recordingUrl ?? message.recordingUrl),
        transcriptText: text(artifact.transcript ?? message.transcript),
        metadata: {
          tenantId,
          brandId: text(metadata.ferocityBrandId),
          eventType: messageType,
          direction: text(call.type)?.toLowerCase().includes("outbound") ? "outbound" : "inbound",
          endedReason,
          summary: text(analysis.summary ?? message.summary),
          structuredData: record(analysis.structuredData)
        }
      }
    };
  }
}

export class RetellVoiceAdapter implements VoiceAgentProvider {
  providerKey = "retell_voice";
  displayName = "Retell AI";
  adapterStatus = "live" as const;

  matchesWebhook(payload: Record<string, unknown>) {
    const call = record(payload.call);
    const event = text(payload.event);
    return payload.provider === this.providerKey
      || (
        Boolean(event && (event.startsWith("call_") || event.startsWith("transfer_") || event === "transcript_updated"))
        && Boolean(text(call.call_id))
      );
  }

  async getConnection(
    context: ProviderContext,
    requireLiveActions: boolean
  ): Promise<ProviderResult<VoiceProviderConnection>> {
    const credentials = await resolveRetellConfiguration(context.tenantId, requireLiveActions);
    if (!credentials?.phoneNumber) return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
    if (
      requireLiveActions
      && context.purpose !== "authorized_test"
      && (!credentials.outboundEnabled || credentials.callbackStatus !== "certified")
    ) {
      return {
        ok: false,
        errorCategory: "callback_route_not_certified",
        safeMessage: "This caller ID has not passed its callback routing test, so Ferocity will not use it for customer calls.",
        retryable: false
      };
    }
    return {
      ok: true,
      data: {
        phoneNumber: credentials.phoneNumber,
        providerResourceId: credentials.phoneNumber
      }
    };
  }

  async verifyConnection(
    context: ProviderContext,
    input: { assistantId: string; webhookUrl: string; inboundWebhookUrl?: string }
  ): Promise<ProviderResult<VoiceProviderConnection>> {
    const credentials = await resolveRetellConfiguration(context.tenantId, false);
    if (!credentials?.phoneNumber) return notConfigured(this.providerKey) as ProviderResult<VoiceProviderConnection>;
    const agent = await retellRequest(
      credentials.apiKey,
      `/get-agent/${encodeURIComponent(input.assistantId)}`,
      "GET"
    );
    if (!agent.response.ok) {
      return {
        ok: false,
        errorCategory: agent.response.status === 401 ? "provider_authentication" : "provider_error",
        safeMessage: `Retell agent verification failed with HTTP ${agent.response.status}.`,
        retryable: agent.response.status === 429 || agent.response.status >= 500
      };
    }
    const number = await retellRequest(
      credentials.apiKey,
      `/update-phone-number/${encodeURIComponent(credentials.phoneNumber)}`,
      "PATCH",
      {
        // Keep a bound inbound agent even when dynamic inbound routing is in
        // use. Retell falls back to this agent if the webhook times out or
        // fails, avoiding a silent callback.
        inbound_agents: [{ agent_id: input.assistantId, weight: 1 }],
        outbound_agents: [{ agent_id: input.assistantId, weight: 1 }],
        ...(input.inboundWebhookUrl ? { inbound_webhook_url: input.inboundWebhookUrl } : {}),
        nickname: "Ferocity AI Receptionist"
      }
    );
    if (!number.response.ok) {
      return {
        ok: false,
        errorCategory: number.response.status === 401 ? "provider_authentication" : "provider_error",
        safeMessage: `Retell phone assignment failed with HTTP ${number.response.status}.`,
        retryable: number.response.status === 429 || number.response.status >= 500
      };
    }
    return {
      ok: true,
      data: {
        phoneNumber: credentials.phoneNumber,
        providerResourceId: credentials.phoneNumber
      }
    };
  }

  async createOrUpdateAssistant(
    context: ProviderContext,
    config: Record<string, unknown>
  ): Promise<ProviderResult<{ assistantId: string; status: string }>> {
    const credentials = await resolveRetellConfiguration(context.tenantId, false);
    if (!credentials) return notConfigured(this.providerKey) as ProviderResult<{ assistantId: string; status: string }>;
    const assistantId = text(config.assistantId);
    const server = record(config.server);
    let toolOrigin: string | null = null;
    try { toolOrigin = text(server.url) ? new URL(text(server.url)!).origin : null; } catch { toolOrigin = null; }
    const llmPayload = {
      model: "gpt-4.1-mini",
      general_prompt: retellSystemPrompt(config),
      begin_message: text(config.firstMessage) ?? "Thank you for calling. How can I help you today?",
      tool_call_strict_mode: true,
      ...(toolOrigin ? { general_tools: retellBusinessTools(toolOrigin, text(config.transferNumber)) } : {})
    };
    const agentPayload: Record<string, unknown> = {
      agent_name: text(config.name) ?? "Ferocity AI Receptionist",
      voice_id: credentials.voiceId,
      webhook_url: text(server.url),
      webhook_events: ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
      webhook_timeout_ms: 10000,
      max_call_duration_ms: Math.min(1_200_000, Math.max(60, number(config.maxDurationSeconds) ?? 1200) * 1000),
      end_call_after_silence_ms: 60000,
      reminder_trigger_ms: 15000,
      reminder_max_count: 1,
      data_storage_setting: "everything_except_pii",
      opt_in_signed_url: true,
      handbook_config: {
        conversational_personality: true,
        natural_filler_words: true,
        high_empathy: true,
        ai_disclosure: true,
        scope_boundaries: true
      }
    };

    let returnedId = assistantId;
    if (assistantId) {
      const current = await retellRequest(
        credentials.apiKey,
        `/get-agent/${encodeURIComponent(assistantId)}`,
        "GET"
      );
      const llmId = text(record(current.body?.response_engine).llm_id);
      if (!current.response.ok || !llmId) {
        return {
          ok: false,
          errorCategory: current.response.status === 401 ? "provider_authentication" : "provider_error",
          safeMessage: `Retell agent lookup failed with HTTP ${current.response.status}.`,
          retryable: current.response.status === 429 || current.response.status >= 500
        };
      }
      const [llmUpdate, agentUpdate] = await Promise.all([
        retellRequest(credentials.apiKey, `/update-retell-llm/${encodeURIComponent(llmId)}`, "PATCH", llmPayload),
        retellRequest(credentials.apiKey, `/update-agent/${encodeURIComponent(assistantId)}`, "PATCH", agentPayload)
      ]);
      if (!llmUpdate.response.ok || !agentUpdate.response.ok) {
        const status = !llmUpdate.response.ok ? llmUpdate.response.status : agentUpdate.response.status;
        const failedBody = !llmUpdate.response.ok ? llmUpdate.body : agentUpdate.body;
        const providerDetail = text(failedBody?.message ?? failedBody?.error)?.slice(0, 240);
        return {
          ok: false,
          errorCategory: status === 401 ? "provider_authentication" : "provider_error",
          safeMessage: `Retell assistant update failed with HTTP ${status}${providerDetail ? `: ${providerDetail}` : "."}`,
          retryable: status === 429 || status >= 500
        };
      }
    } else {
      const llm = await retellRequest(credentials.apiKey, "/create-retell-llm", "POST", llmPayload);
      const llmId = text(llm.body?.llm_id);
      if (!llm.response.ok || !llmId) {
        return {
          ok: false,
          errorCategory: llm.response.status === 401 ? "provider_authentication" : "provider_error",
          safeMessage: `Retell response-engine creation failed with HTTP ${llm.response.status}.`,
          retryable: llm.response.status === 429 || llm.response.status >= 500
        };
      }
      const agent = await retellRequest(credentials.apiKey, "/create-agent", "POST", {
        ...agentPayload,
        response_engine: { type: "retell-llm", llm_id: llmId }
      });
      returnedId = text(agent.body?.agent_id);
      if (!agent.response.ok || !returnedId) {
        return {
          ok: false,
          errorCategory: agent.response.status === 401 ? "provider_authentication" : "provider_error",
          safeMessage: `Retell agent creation failed with HTTP ${agent.response.status}.`,
          retryable: agent.response.status === 429 || agent.response.status >= 500
        };
      }
    }
    return { ok: true, data: { assistantId: returnedId!, status: "configured" } };
  }

  async startOutboundCall(
    context: ProviderContext,
    input: { toNumber: string; fromNumber: string; assistantId: string; dynamicVariables?: Record<string, string> }
  ): Promise<ProviderResult<{ providerCallId: string; status: string }>> {
    const authorizedTest = context.purpose === "authorized_test";
    if (!context.liveActionsEnabled && !authorizedTest) {
      return {
        ok: false,
        errorCategory: "live_actions_disabled",
        safeMessage: "Outbound voice actions are disabled for this request.",
        retryable: false
      };
    }
    const credentials = await resolveRetellConfiguration(context.tenantId, !authorizedTest);
    if (!credentials) return notConfigured(this.providerKey) as ProviderResult<{ providerCallId: string; status: string }>;
    if (credentials.phoneNumber !== input.fromNumber) {
      return {
        ok: false,
        errorCategory: "caller_id_mismatch",
        safeMessage: "Ferocity blocked an outbound call that attempted to use a caller ID outside this workspace.",
        retryable: false
      };
    }
    if (
      !authorizedTest
      && (!credentials.outboundEnabled || credentials.callbackStatus !== "certified")
    ) {
      return {
        ok: false,
        errorCategory: "callback_route_not_certified",
        safeMessage: "Ferocity will not place customer calls from this number until a real callback reaches the correct workspace and agent.",
        retryable: false
      };
    }
    const capacity = authorizedTest ? null : await reserveOutboundCapacity({
      tenantId: context.tenantId,
      providerKey: this.providerKey,
      correlationId: context.correlationId,
      priority: "routine"
    });
    if (!authorizedTest && !capacity) {
      return {
        ok: false,
        errorCategory: "voice_capacity_check_unavailable",
        safeMessage: "Ferocity could not safely verify shared phone capacity. The call was not started and can be retried.",
        retryable: true
      };
    }
    if (capacity && !capacity.allowed) {
      return {
        ok: false,
        errorCategory: "concurrent_call_limit",
        safeMessage: capacity.retryAt
          ? `Phone capacity is busy. Ferocity will automatically try again around ${new Date(capacity.retryAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
          : "Phone capacity is busy. Ferocity will automatically try again shortly.",
        retryable: true,
        retryAt: capacity.retryAt ?? undefined
      };
    }
    const call = await retellRequest(credentials.apiKey, "/v2/create-phone-call", "POST", {
      from_number: input.fromNumber,
      to_number: input.toNumber,
      override_agent_id: input.assistantId,
      ...(input.dynamicVariables ? { retell_llm_dynamic_variables: input.dynamicVariables } : {}),
      metadata: {
        ferocityTenantId: context.tenantId,
        ferocityBrandId: context.brandId ?? null,
        ferocityCorrelationId: context.correlationId,
        ferocityIdempotencyKey: context.idempotencyKey
      }
    });
    const callId = text(call.body?.call_id);
    if (!call.response.ok || !callId) {
      if (capacity?.reservationId) await abandonOutboundCapacityReservation(capacity.reservationId);
      return {
        ok: false,
        errorCategory: call.response.status === 401 ? "provider_authentication" : "provider_error",
        safeMessage: `Retell call creation failed with HTTP ${call.response.status}.`,
        retryable: call.response.status === 429 || call.response.status >= 500
      };
    }
    if (capacity?.reservationId) {
      const activated = await activateOutboundCapacityReservation(capacity.reservationId, callId);
      if (!activated) {
        console.error(`Retell call ${callId} started without a confirmed Ferocity capacity reservation.`);
      }
    }
    return {
      ok: true,
      data: { providerCallId: callId, status: text(call.body?.call_status) ?? "registered" }
    };
  }

  async normalizeWebhook(headers: Headers, rawBody: string): Promise<ProviderResult<InboundCallEvent>> {
    const payload = safeJson(rawBody);
    const call = record(payload.call);
    const metadata = record(call.metadata);
    const agentId = text(call.agent_id);
    const phoneNumber = text(call.to_number ?? call.from_number);
    const tenantId =
      text(metadata.ferocityTenantId ?? metadata.tenantId)
      ?? await resolveRetellWebhookTenant(agentId, phoneNumber);
    if (!tenantId) {
      return {
        ok: false,
        errorCategory: "untrusted_tenant",
        safeMessage: "Retell webhook could not be mapped to a Ferocity workspace.",
        retryable: false
      };
    }
    const credentials = await resolveRetellConfiguration(tenantId, false);
    if (!credentials || !verifyRetellSignature(rawBody, credentials.webhookApiKey, headers.get("x-retell-signature"))) {
      return {
        ok: false,
        errorCategory: "invalid_signature",
        safeMessage: "Retell webhook authentication failed.",
        retryable: false
      };
    }
    const callId = text(call.call_id);
    if (!callId) {
      return {
        ok: false,
        errorCategory: "invalid_payload",
        safeMessage: "Retell webhook is missing a call ID.",
        retryable: false
      };
    }
    const event = text(payload.event);
    const analysis = record(call.call_analysis);
    const callCost = record(call.call_cost);
    const customAnalysis = record(analysis.custom_analysis_data);
    const transcriptTurns = Array.isArray(call.transcript_object)
      ? call.transcript_object
          .map((turn) => {
            const item = record(turn);
            const role = text(item.role);
            const content = text(item.content);
            if (!content) return null;
            return {
              role: role === "agent" ? "agent" as const : role === "user" ? "customer" as const : "unknown" as const,
              content
            };
          })
          .filter((turn): turn is { role: "agent" | "customer" | "unknown"; content: string } => Boolean(turn))
      : undefined;
    const startTimestamp = number(call.start_timestamp);
    const endTimestamp = number(call.end_timestamp);
    const durationSeconds = number(call.duration_ms) !== null
      ? Math.round(number(call.duration_ms)! / 1000)
      : startTimestamp !== null && endTimestamp !== null
        ? Math.round((endTimestamp - startTimestamp) / 1000)
        : 0;
    return {
      ok: true,
      data: {
        providerKey: this.providerKey,
        providerCallId: callId,
        providerEventId: `${callId}:${event ?? "event"}:${endTimestamp ?? startTimestamp ?? "unknown"}`,
        callerNumber: text(call.from_number),
        calledNumber: text(call.to_number),
        status: retellStatus(event, text(call.call_status), text(call.disconnection_reason)),
        occurredAt: new Date(endTimestamp ?? startTimestamp ?? Date.now()).toISOString(),
        durationSeconds: Math.max(0, durationSeconds),
        recordingUrl: text(call.scrubbed_recording_url ?? call.recording_url),
        transcriptText: text(call.transcript),
        transcriptTurns,
        metadata: {
          tenantId,
          brandId: text(metadata.ferocityBrandId),
          customerId: text(metadata.ferocityCustomerId),
          leadId: text(metadata.ferocityLeadId),
          eventType: event,
          direction: text(call.direction) === "outbound" ? "outbound" : "inbound",
          endedReason: text(call.disconnection_reason),
          summary: text(analysis.call_summary),
          providerCostCents: Math.round(number(callCost.combined_cost) ?? 0),
          providerCostRaw: number(callCost.combined_cost) ?? 0,
          providerRecordingId: callId,
          structuredData: {
            ...customAnalysis,
            sentiment: text(analysis.user_sentiment)?.toLowerCase() ?? "unknown"
          }
        }
      }
    };
  }
}

const adapters = new Map<string, VoiceAgentProvider>([
  ["vapi_voice", new VapiVoiceAdapter()],
  ["retell_voice", new RetellVoiceAdapter()]
]);

export function getVoiceAgentProvider(providerKey: string) {
  return adapters.get(providerKey) ?? null;
}

export function listVoiceAgentProviders() {
  return [...adapters.values()].map((provider) => ({
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    adapterStatus: provider.adapterStatus
  }));
}

export function findVoiceAgentProviderForWebhook(payload: Record<string, unknown>) {
  return [...adapters.values()].find(
    (provider) => provider.adapterStatus === "live" && provider.matchesWebhook(payload)
  ) ?? null;
}
