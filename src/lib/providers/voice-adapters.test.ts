import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

vi.mock("./vapi-config", () => ({
  resolveVapiWebhookTenant: vi.fn().mockResolvedValue(null),
  resolveVapiConfiguration: vi.fn().mockResolvedValue({
    apiKey: "vapi-key",
    phoneNumberId: "phone-id",
    phoneNumber: "+15550002222",
    webhookSecret: "webhook-secret",
    webhookCredentialId: "credential-id"
  })
}));

vi.mock("./retell-config", () => ({
  resolveRetellWebhookTenant: vi.fn().mockResolvedValue(null),
  resolveRetellConfiguration: vi.fn().mockResolvedValue({
    apiKey: "retell-api-key",
    webhookApiKey: "retell-webhook-key",
    phoneNumber: "+15550003333",
    voiceId: "retell-Cimo"
  })
}));

import {
  findVoiceAgentProviderForWebhook,
  listVoiceAgentProviders,
  RetellVoiceAdapter,
  verifyRetellSignature,
  VapiVoiceAdapter
} from "./voice-adapters";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vapi voice adapter", () => {
  it("registers live and planned adapters without treating the planned adapter as webhook-ready", () => {
    expect(listVoiceAgentProviders()).toEqual([
      { providerKey: "vapi_voice", displayName: "Vapi", adapterStatus: "live" },
      { providerKey: "retell_voice", displayName: "Retell AI", adapterStatus: "live" }
    ]);
    expect(findVoiceAgentProviderForWebhook({ provider: "vapi_voice" })?.providerKey).toBe("vapi_voice");
    expect(findVoiceAgentProviderForWebhook({ provider: "retell_voice" })?.providerKey).toBe("retell_voice");
  });

  it("blocks outbound calls when live actions are disabled", async () => {
    const adapter = new VapiVoiceAdapter();
    const result = await adapter.startOutboundCall(
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        correlationId: "test",
        idempotencyKey: "test-call",
        liveActionsEnabled: false
      },
      { toNumber: "+15550001111", fromNumber: "+15550002222", assistantId: "assistant-id" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCategory).toBe("live_actions_disabled");
  });

  it("allows only an explicitly marked authorized test while the provider is paused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "call-id", status: "queued" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )));
    const adapter = new VapiVoiceAdapter();
    const result = await adapter.startOutboundCall(
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        correlationId: "test",
        idempotencyKey: "authorized-test-call",
        liveActionsEnabled: false,
        purpose: "authorized_test"
      },
      { toNumber: "+15550001111", fromNumber: "+15550002222", assistantId: "assistant-id" }
    );
    expect(result.ok).toBe(true);
  });

  it("authenticates and normalizes a Vapi end-of-call webhook", async () => {
    const adapter = new VapiVoiceAdapter();
    const result = await adapter.normalizeWebhook(
      new Headers({ Authorization: "Bearer webhook-secret" }),
      JSON.stringify({
        message: {
          id: "event-id",
          type: "end-of-call-report",
          timestamp: "2026-07-28T20:00:00.000Z",
          analysis: {
            summary: "Caller requested an estimate.",
            structuredData: { outcome: "new_lead", leadQualification: "hot" }
          },
          artifact: { transcript: "I need a roof estimate.", recordingUrl: "https://example.test/recording" },
          call: {
            id: "call-id",
            type: "inboundPhoneCall",
            status: "ended",
            startedAt: "2026-07-28T19:59:00.000Z",
            endedAt: "2026-07-28T20:00:00.000Z",
            customer: { number: "+15550001111" },
            phoneNumber: { number: "+15550002222" },
            metadata: {
              ferocityTenantId: "11111111-1111-4111-8111-111111111111",
              ferocityBrandId: "22222222-2222-4222-8222-222222222222"
            }
          }
        }
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.providerCallId).toBe("call-id");
      expect(result.data.status).toBe("completed");
      expect(result.data.durationSeconds).toBe(60);
      expect(result.data.transcriptText).toBe("I need a roof estimate.");
      expect(result.data.metadata?.tenantId).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("rejects a Vapi webhook with the wrong tenant secret", async () => {
    const adapter = new VapiVoiceAdapter();
    const result = await adapter.normalizeWebhook(
      new Headers({ Authorization: "Bearer wrong-secret" }),
      JSON.stringify({
        message: {
          type: "status-update",
          call: {
            id: "call-id",
            metadata: { ferocityTenantId: "11111111-1111-4111-8111-111111111111" }
          }
        }
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCategory).toBe("invalid_signature");
  });
});

describe("Retell voice adapter", () => {
  it("verifies Retell's timestamped raw-body HMAC and rejects stale signatures", () => {
    const body = JSON.stringify({ event: "call_started", call: { call_id: "call-id" } });
    const timestamp = Date.now().toString();
    const digest = crypto.createHmac("sha256", "retell-webhook-key").update(`${body}${timestamp}`).digest("hex");
    expect(verifyRetellSignature(body, "retell-webhook-key", `v=${timestamp},d=${digest}`)).toBe(true);
    expect(verifyRetellSignature(body, "wrong-key", `v=${timestamp},d=${digest}`)).toBe(false);
    expect(verifyRetellSignature(body, "retell-webhook-key", `v=${Date.now() - 360_001},d=${digest}`)).toBe(false);
  });

  it("recognizes a signed workspace webhook test before an agent is mapped", () => {
    expect(findVoiceAgentProviderForWebhook({
      event: "call_started",
      call: { call_id: "retell-workspace-test" }
    })?.providerKey).toBe("retell_voice");
  });

  it("normalizes an authenticated analyzed call", async () => {
    const body = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: "retell-call",
        agent_id: "retell-agent",
        direction: "inbound",
        from_number: "+15550001111",
        to_number: "+15550003333",
        call_status: "ended",
        start_timestamp: 1000,
        end_timestamp: 61000,
        transcript: "I need an estimate.",
        metadata: { ferocityTenantId: "11111111-1111-4111-8111-111111111111" },
        call_analysis: {
          call_summary: "Caller requested an estimate.",
          user_sentiment: "Positive",
          custom_analysis_data: { outcome: "new_lead", leadQualification: "hot" }
        },
        call_cost: { combined_cost: 47 }
      }
    });
    const timestamp = Date.now().toString();
    const digest = crypto.createHmac("sha256", "retell-webhook-key").update(`${body}${timestamp}`).digest("hex");
    const result = await new RetellVoiceAdapter().normalizeWebhook(
      new Headers({ "X-Retell-Signature": `v=${timestamp},d=${digest}` }),
      body
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.providerCallId).toBe("retell-call");
      expect(result.data.status).toBe("completed");
      expect(result.data.durationSeconds).toBe(60);
      expect(result.data.metadata?.summary).toBe("Caller requested an estimate.");
      expect(result.data.metadata?.providerCostCents).toBe(47);
    }
  });

  it("creates a Retell response engine and agent behind the common assistant contract", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ llm_id: "retell-llm" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ agent_id: "retell-agent" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      ));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new RetellVoiceAdapter().createOrUpdateAssistant(
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        correlationId: "assistant-sync",
        idempotencyKey: "assistant-sync",
        liveActionsEnabled: false
      },
      {
        name: "Ferocity Receptionist",
        firstMessage: "Thanks for calling.",
        model: { messages: [{ role: "system", content: "Help callers and escalate uncertainty." }] },
        server: { url: "https://ferocity.live/api/integrations/voice-ai/webhook" },
        maxDurationSeconds: 1800
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.assistantId).toBe("retell-agent");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.retellai.com/create-retell-llm");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.retellai.com/create-agent");
  });
});
