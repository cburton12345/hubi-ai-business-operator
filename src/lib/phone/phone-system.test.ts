import { beforeEach, describe, expect, it, vi } from "vitest";

const { evaluateVoiceAccessMock, queryPostgresMock } = vi.hoisted(() => ({
  evaluateVoiceAccessMock: vi.fn(),
  queryPostgresMock: vi.fn()
}));

vi.mock("@/lib/usage/managed-voice", () => ({
  evaluateVoiceAccess: evaluateVoiceAccessMock,
  validVoicePricingSnapshot: (value: unknown) => value
}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
import { capabilitiesForPhonePath, inferNorthAmericanAreaCode } from "@/lib/phone/phone-connections";
import { getPhoneProvider, listPhoneProviders } from "@/lib/phone/provider-registry";
import { ProviderBackedVoiceAgent } from "@/lib/phone/voice-agent";
import type { VoiceAgentProvider } from "@/lib/providers/interfaces";

describe("provider-independent phone architecture", () => {
  beforeEach(() => {
    evaluateVoiceAccessMock.mockReset();
    queryPostgresMock.mockReset();
    evaluateVoiceAccessMock.mockResolvedValue({
      allowed: true,
      reason: "Authorized test call passed managed-voice admission checks.",
      errorCategory: "",
      maxDurationSeconds: 600,
      ownershipMode: "ferocity_managed",
      pricingSnapshot: {
        policyId: "policy-1",
        planKey: "starter",
        includedMinutes: 25,
        unitPriceCents: 25,
        pricingDisclosed: true,
        autoBillDisclosedOverage: true,
        sponsoredByFerocity: false,
        capturedAt: "2026-10-22T00:00:00.000Z"
      }
    });
    queryPostgresMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("with inserted as")) {
        return { rows: [{
          id: "reservation-1",
          provider_call_id: values[3],
          status: "received",
          admission_pricing_snapshot_json: JSON.parse(String(values[7])),
          inserted: true
        }] };
      }
      if (sql.includes("returning id")) return { rows: [{ id: "reservation-1" }] };
      return { rows: [] };
    });
  });

  it("infers a local NANP area code when managed-number setup leaves it blank", () => {
    expect(inferNorthAmericanAreaCode("+1 (715) 308-5984")).toBe("715");
    expect(inferNorthAmericanAreaCode("+442079460123")).toBeNull();
    expect(inferNorthAmericanAreaCode("+11235550123")).toBeNull();
  });

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
        status: "ringing",
        usagePricingSnapshot: expect.objectContaining({ policyId: "policy-1", unitPriceCents: 25 })
      }
    });
    expect(startOutboundCall).toHaveBeenCalledOnce();
    expect(startOutboundCall.mock.calls[0][0]).toEqual(expect.objectContaining({
      voiceReservationId: "reservation-1"
    }));
    const reservationCall = queryPostgresMock.mock.calls.find(([sql]) => String(sql).includes("with inserted as"));
    expect(reservationCall).toBeDefined();
    expect(reservationCall?.[1]?.[7]).toContain('"policyId":"policy-1"');
    expect(queryPostgresMock.mock.invocationCallOrder[0]).toBeLessThan(startOutboundCall.mock.invocationCallOrder[0]);
    expect(evaluateVoiceAccessMock).toHaveBeenCalledWith({
      tenantId: "tenant",
      providerKey: "test_voice",
      purpose: "authorized_test",
      callDirection: "outbound"
    });
    expect(startOutboundCall.mock.calls[0][0]).not.toHaveProperty("usagePricingSnapshot");
  });

  it("does not let authorized_test bypass managed-voice admission", async () => {
    evaluateVoiceAccessMock.mockResolvedValueOnce({
      allowed: false,
      reason: "Managed voice pricing is not configured for this workspace.",
      errorCategory: "managed_voice_allowance_missing",
      maxDurationSeconds: 0,
      ownershipMode: "ferocity_managed"
    });
    const startOutboundCall = vi.fn();
    const engine = {
      providerKey: "test_voice",
      startOutboundCall
    } as unknown as VoiceAgentProvider;

    const result = await new ProviderBackedVoiceAgent(engine).startConversation(
      {
        tenantId: "tenant",
        correlationId: "correlation",
        idempotencyKey: "test-call",
        liveActionsEnabled: false,
        purpose: "authorized_test"
      },
      { toNumber: "+15555550123", fromNumber: "+15555550124", assistantId: "assistant" }
    );

    expect(result).toEqual({
      ok: false,
      errorCategory: "managed_voice_allowance_missing",
      safeMessage: "Managed voice pricing is not configured for this workspace.",
      retryable: false
    });
    expect(startOutboundCall).not.toHaveBeenCalled();
    expect(queryPostgresMock).not.toHaveBeenCalled();
  });

  it("fails closed before dispatch when trusted admission evidence cannot be persisted", async () => {
    queryPostgresMock.mockResolvedValueOnce(null);
    const startOutboundCall = vi.fn();
    const engine = { providerKey: "test_voice", startOutboundCall } as unknown as VoiceAgentProvider;

    const result = await new ProviderBackedVoiceAgent(engine).startConversation(
      {
        tenantId: "tenant",
        correlationId: "correlation",
        idempotencyKey: "persist-first",
        liveActionsEnabled: true,
        purpose: "production"
      },
      { toNumber: "+15555550123", fromNumber: "+15555550124", assistantId: "assistant" }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      errorCategory: "voice_admission_persistence_failed"
    }));
    expect(startOutboundCall).not.toHaveBeenCalled();
  });

  it("returns an already-bound idempotent call without dispatching a second paid call", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{
      id: "reservation-existing",
      provider_call_id: "provider-existing",
      status: "ringing",
      admission_pricing_snapshot_json: {
        policyId: "policy-original",
        planKey: "starter",
        includedMinutes: 25,
        unitPriceCents: 25,
        pricingDisclosed: true,
        autoBillDisclosedOverage: true,
        sponsoredByFerocity: false,
        capturedAt: "2026-10-22T00:00:00.000Z"
      },
      inserted: false
    }] });
    const startOutboundCall = vi.fn();
    const engine = { providerKey: "test_voice", startOutboundCall } as unknown as VoiceAgentProvider;

    const result = await new ProviderBackedVoiceAgent(engine).startConversation(
      {
        tenantId: "tenant",
        correlationId: "correlation",
        idempotencyKey: "same-request",
        liveActionsEnabled: true,
        purpose: "production"
      },
      { toNumber: "+15555550123", fromNumber: "+15555550124", assistantId: "assistant" }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ providerCallId: "provider-existing" })
    }));
    expect(startOutboundCall).not.toHaveBeenCalled();
  });

  it("accepts a verified-webhook bind that wins the race and keeps retries idempotent", async () => {
    let reservationRead = 0;
    queryPostgresMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("with inserted as")) {
        reservationRead += 1;
        return { rows: [{
          id: "reservation-race",
          provider_call_id: reservationRead === 1 ? values[3] : "provider-race",
          status: reservationRead === 1 ? "received" : "ringing",
          admission_pricing_snapshot_json: JSON.parse(String(values[7])),
          inserted: reservationRead === 1
        }] };
      }
      if (sql.includes("update public.receptionist_calls") && sql.includes("returning id")) return { rows: [] };
      if (sql.includes("select id from public.receptionist_calls")) return { rows: [{ id: "reservation-race" }] };
      return { rows: [] };
    });
    const startOutboundCall = vi.fn().mockResolvedValue({
      ok: true,
      data: { providerCallId: "provider-race", status: "ringing" }
    });
    const engine = { providerKey: "test_voice", startOutboundCall } as unknown as VoiceAgentProvider;
    const agent = new ProviderBackedVoiceAgent(engine);
    const context = {
      tenantId: "tenant",
      correlationId: "correlation",
      idempotencyKey: "webhook-race",
      liveActionsEnabled: true,
      purpose: "production" as const
    };
    const input = { toNumber: "+15555550123", fromNumber: "+15555550124", assistantId: "assistant" };

    await expect(agent.startConversation(context, input)).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(agent.startConversation(context, input)).resolves.toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ providerCallId: "provider-race" })
    }));
    expect(startOutboundCall).toHaveBeenCalledOnce();
  });

  it("does not redispatch an ambiguous provider success whose binding cannot yet be confirmed", async () => {
    let reservationRead = 0;
    queryPostgresMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("with inserted as")) {
        reservationRead += 1;
        return { rows: [{
          id: "reservation-ambiguous",
          provider_call_id: values[3],
          status: "received",
          admission_pricing_snapshot_json: JSON.parse(String(values[7])),
          inserted: reservationRead === 1
        }] };
      }
      return { rows: [] };
    });
    const startOutboundCall = vi.fn().mockResolvedValue({
      ok: true,
      data: { providerCallId: "provider-ambiguous", status: "ringing" }
    });
    const engine = { providerKey: "test_voice", startOutboundCall } as unknown as VoiceAgentProvider;
    const agent = new ProviderBackedVoiceAgent(engine);
    const context = {
      tenantId: "tenant",
      correlationId: "correlation",
      idempotencyKey: "ambiguous-bind",
      liveActionsEnabled: true,
      purpose: "production" as const
    };
    const input = { toNumber: "+15555550123", fromNumber: "+15555550124", assistantId: "assistant" };

    await expect(agent.startConversation(context, input)).resolves.toEqual(expect.objectContaining({
      ok: false,
      errorCategory: "voice_dispatch_binding_failed"
    }));
    await expect(agent.startConversation(context, input)).resolves.toEqual(expect.objectContaining({
      ok: false,
      errorCategory: "voice_dispatch_pending"
    }));
    expect(startOutboundCall).toHaveBeenCalledOnce();
  });
});
