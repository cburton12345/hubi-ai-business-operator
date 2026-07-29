import { describe, expect, it, vi } from "vitest";
import { capabilitiesForPhonePath } from "@/lib/phone/phone-connections";
import { getPhoneProvider, listPhoneProviders } from "@/lib/phone/provider-registry";
import { ProviderBackedVoiceAgent } from "@/lib/phone/voice-agent";
import type { VoiceAgentProvider } from "@/lib/providers/interfaces";

describe("provider-independent phone architecture", () => {
  it("keeps the fast forwarding path intentionally simple", () => {
    const capabilities = capabilitiesForPhonePath("keep_number_forwarding");
    expect(capabilities).toContain("inbound_call");
    expect(capabilities).toContain("call_forwarding");
    expect(capabilities).not.toContain("number_porting");
    expect(capabilities).not.toContain("sip");
  });

  it("models full integration without choosing a provider", () => {
    const capabilities = capabilitiesForPhonePath("keep_number_full");
    expect(capabilities).toEqual(expect.arrayContaining([
      "inbound_call",
      "outbound_call",
      "number_porting",
      "call_transfer",
      "sms",
      "mms",
      "sip",
      "multi_user"
    ]));
  });

  it("registers phone providers behind the same contract", () => {
    const providers = listPhoneProviders();
    expect(providers.map((provider) => provider.providerKey)).toEqual(expect.arrayContaining([
      "twilio_phone",
      "telnyx_phone",
      "signalwire_phone",
      "vonage_phone",
      "generic_sip",
      "ferocity_managed_phone"
    ]));
    expect(getPhoneProvider("telnyx_phone")?.descriptor.capabilities).toContain("sms");
  });

  it("lets business logic start a conversation through VoiceAgent instead of a specific engine", async () => {
    const startOutboundCall = vi.fn().mockResolvedValue({
      ok: true,
      data: { providerCallId: "call_123", status: "ringing" }
    });
    const engine = {
      providerKey: "test_voice",
      displayName: "Test voice",
      adapterStatus: "live",
      matchesWebhook: vi.fn(),
      getConnection: vi.fn(),
      verifyConnection: vi.fn(),
      createOrUpdateAssistant: vi.fn(),
      startOutboundCall,
      normalizeWebhook: vi.fn()
    } as unknown as VoiceAgentProvider;
    const agent = new ProviderBackedVoiceAgent(engine);

    const result = await agent.startConversation(
      {
        tenantId: "tenant",
        correlationId: "correlation",
        idempotencyKey: "idempotency",
        liveActionsEnabled: false,
        purpose: "authorized_test"
      },
      {
        toNumber: "+15555550123",
        fromNumber: "+15555550124",
        assistantId: "assistant"
      }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId: "call_123",
        providerCallId: "call_123",
        status: "ringing"
      }
    });
    expect(startOutboundCall).toHaveBeenCalledOnce();
  });
});
