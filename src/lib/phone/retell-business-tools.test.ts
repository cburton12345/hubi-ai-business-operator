import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryPostgresMock,
  reconcileCallContactMock,
  resolveRetellConfigurationMock,
  resolveRetellWebhookTenantMock,
  verifyRetellSignatureMock,
  submitMarketplaceProPhoneIntakeMock
} = vi.hoisted(() => ({
  queryPostgresMock: vi.fn(),
  reconcileCallContactMock: vi.fn(),
  resolveRetellConfigurationMock: vi.fn(),
  resolveRetellWebhookTenantMock: vi.fn(),
  verifyRetellSignatureMock: vi.fn(),
  submitMarketplaceProPhoneIntakeMock: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));
vi.mock("@/lib/phone/call-contact-reconciliation", () => ({ reconcileCallContact: reconcileCallContactMock }));
vi.mock("@/lib/providers/retell-config", () => ({
  resolveRetellConfiguration: resolveRetellConfigurationMock,
  resolveRetellWebhookTenant: resolveRetellWebhookTenantMock
}));
vi.mock("@/lib/providers/voice-adapters", () => ({ verifyRetellSignature: verifyRetellSignatureMock }));
vi.mock("@/lib/integrations/marketplacepro-network-outbound", () => ({
  submitMarketplaceProPhoneIntake: submitMarketplaceProPhoneIntakeMock
}));
vi.mock("@/lib/phone/voice-scheduling", () => ({ createVoiceAppointment: vi.fn() }));
vi.mock("@/lib/support/create-support-issue", () => ({ createSupportIssue: vi.fn() }));
vi.mock("@/lib/support/self-service", () => ({ supportGuidanceFor: vi.fn() }));

import { processRetellBusinessTool } from "./retell-business-tools";

function payload() {
  return JSON.stringify({
    name: "record_marketplacepro_intake",
    call: {
      call_id: "call-123",
      agent_id: "diamond-agent",
      from_number: "+17155550123",
      to_number: "+17155554498",
      metadata: { ferocityBrandId: "diamond-brand" }
    },
    args: {
      intake_type: "contractor",
      caller_name: "Contractor Caller",
      phone: "+17155550123",
      city: "Eau Claire",
      state: "WI",
      trades: ["plumbing"],
      summary: "Interested in maintenance opportunities.",
      urgency: "normal",
      consent_to_contact: true
    }
  });
}

describe("Retell MarketplacePro business tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRetellWebhookTenantMock.mockResolvedValue("tenant-a");
    resolveRetellConfigurationMock.mockResolvedValue({ apiKey: "retell-signing-key" });
    verifyRetellSignatureMock.mockReturnValue(true);
    reconcileCallContactMock.mockResolvedValue({ customerId: null, leadId: "lead-a" });
    submitMarketplaceProPhoneIntakeMock.mockResolvedValue({
      intakeId: "46bfab36-77b5-4bcb-a0f0-810b2ef28e5b",
      intakeType: "contractor",
      status: "routed",
      duplicate: false,
      bindingWorkOrderAccepted: false
    });
    queryPostgresMock.mockImplementation(async (text: string) => {
      if (text.includes("from public.brands")) return { rows: [{ id: "diamond-brand", slug: "diamond-homes" }] };
      if (text.includes("insert into public.operator_schedule_events")) return { rows: [{ id: "follow-up-a" }] };
      return { rows: [] };
    });
  });

  it("routes a signed Diamond call once and records owner follow-up", async () => {
    const result = await processRetellBusinessTool(payload(), "signed");
    expect(result).toMatchObject({ ok: true, status: "routed", duplicate: false });
    expect(submitMarketplaceProPhoneIntakeMock).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "retell:call-123:contractor",
      externalCallId: "call-123",
      intakeType: "contractor",
      consentToContact: true
    }));
    expect(queryPostgresMock.mock.calls.some(([text]) => String(text).includes("insert into public.operator_schedule_events"))).toBe(true);
  });

  it("rejects the tool on a different brand before creating a local contact", async () => {
    queryPostgresMock.mockImplementation(async (text: string) => {
      if (text.includes("from public.brands")) return { rows: [{ id: "ferocity-brand", slug: "ferocity" }] };
      return { rows: [] };
    });
    const result = await processRetellBusinessTool(payload(), "signed");
    expect(result).toMatchObject({ ok: false, status: "wrong_business_line" });
    expect(reconcileCallContactMock).not.toHaveBeenCalled();
    expect(submitMarketplaceProPhoneIntakeMock).not.toHaveBeenCalled();
  });

  it("never claims MPP success when the downstream intake fails", async () => {
    submitMarketplaceProPhoneIntakeMock.mockRejectedValue(new Error("downstream unavailable"));
    const result = await processRetellBusinessTool(payload(), "signed");
    expect(result).toMatchObject({ ok: false, status: "not_recorded" });
    expect(String(result.message)).toContain("did not confirm");
  });
});

