import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveRetellInboundRouteMock,
  resolveRetellConfigurationMock,
  verifyRetellSignatureMock,
  evaluateVoiceAccessMock,
  prepareInboundCallContextMock
} = vi.hoisted(() => ({
  resolveRetellInboundRouteMock: vi.fn(),
  resolveRetellConfigurationMock: vi.fn(),
  verifyRetellSignatureMock: vi.fn(),
  evaluateVoiceAccessMock: vi.fn(),
  prepareInboundCallContextMock: vi.fn()
}));

vi.mock("@/lib/providers/retell-config", () => ({
  resolveRetellInboundRoute: resolveRetellInboundRouteMock,
  resolveRetellConfiguration: resolveRetellConfigurationMock
}));
vi.mock("@/lib/providers/voice-adapters", () => ({ verifyRetellSignature: verifyRetellSignatureMock }));
vi.mock("@/lib/usage/managed-voice", () => ({ evaluateVoiceAccess: evaluateVoiceAccessMock }));
vi.mock("@/lib/phone/inbound-call-context", () => ({ prepareInboundCallContext: prepareInboundCallContextMock }));

import { POST } from "./route";

function request(toNumber = "+15555554498") {
  return new Request("https://ferocity.live/api/integrations/voice-ai/inbound", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": "signed" },
    body: JSON.stringify({ event: "call_inbound", call_inbound: { from_number: "+15555550100", to_number: toNumber } })
  });
}

describe("Retell inbound number routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRetellConfigurationMock.mockResolvedValue({ webhookApiKey: "webhook-key" });
    verifyRetellSignatureMock.mockReturnValue(true);
    evaluateVoiceAccessMock.mockResolvedValue({ allowed: true, maxDurationSeconds: 1200, ownershipMode: "ferocity_managed" });
    prepareInboundCallContextMock.mockResolvedValue({
      brandId: "diamond-brand",
      customerId: null,
      leadId: null,
      variables: { business_name: "Diamond Homes" }
    });
  });

  it("uses the assistant and brand attached to the exact called line", async () => {
    resolveRetellInboundRouteMock.mockResolvedValue({
      tenantId: "internal-portfolio",
      brandId: "diamond-brand",
      assistantId: "diamond-agent",
      inboundEnabled: true
    });

    const response = await POST(request() as never);
    const body = await response.json();

    expect(body.call_inbound.override_agent_id).toBe("diamond-agent");
    expect(body.call_inbound.metadata.ferocityBrandId).toBe("diamond-brand");
    expect(prepareInboundCallContextMock).toHaveBeenCalledWith(expect.objectContaining({ brandId: "diamond-brand" }));
  });

  it("fails closed while a transferred line is staged but not provider-verified", async () => {
    resolveRetellInboundRouteMock.mockResolvedValue({
      tenantId: "internal-portfolio",
      brandId: "diamond-brand",
      assistantId: "diamond-agent",
      inboundEnabled: false
    });

    const response = await POST(request() as never);
    const body = await response.json();

    expect(body.call_inbound.metadata).toMatchObject({ ferocityAccepted: false, reason: "number_not_active" });
    expect(resolveRetellConfigurationMock).not.toHaveBeenCalled();
  });
});
