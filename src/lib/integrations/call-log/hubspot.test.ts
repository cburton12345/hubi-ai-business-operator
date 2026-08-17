import { describe, expect, it, vi } from "vitest";
import { externalCallLogPayloadSchema } from "./contracts";
import { hubSpotCallLogAdapter, resolveHubSpotContactByPhone } from "./hubspot";

const payload = externalCallLogPayloadSchema.parse({
  schemaVersion: 1,
  callId: "11111111-1111-4111-8111-111111111111",
  providerCallId: "provider-call-1",
  direction: "inbound",
  status: "completed",
  outcome: "qualified",
  summary: "Caller requested a service estimate.",
  durationSeconds: 73,
  callerNumber: "+17155550100",
  qualification: "qualified",
  nextSteps: ["Prepare estimate"],
  appointmentId: null,
  customerId: "22222222-2222-4222-8222-222222222222",
  leadId: null,
  ferocityUrl: "https://ferocity.live/app/calls/11111111-1111-4111-8111-111111111111",
  completedAt: "2026-08-14T12:00:00.000Z"
});

describe("HubSpot call-log adapter", () => {
  it("resolves only one exact normalized phone match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { id: "contact-88", properties: { phone: "(715) 555-0100" } },
        { id: "contact-99", properties: { phone: "715-555-9999" } }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(resolveHubSpotContactByPhone({
      accessToken: "hubspot-token",
      phone: "+1 715 555 0100",
      fetchImpl
    })).resolves.toBe("contact-88");
  });

  it("does not guess when more than one contact has the same number", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { id: "contact-88", properties: { phone: "7155550100" } },
        { id: "contact-89", properties: { mobilephone: "7155550100" } }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(resolveHubSpotContactByPhone({
      accessToken: "hubspot-token",
      phone: "+17155550100",
      fetchImpl
    })).resolves.toBeNull();
  });

  it("creates a native call associated with the mapped contact", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "hubspot-call-1" }), {
      status: 201,
      headers: { "content-type": "application/json" }
    }));
    const result = await hubSpotCallLogAdapter.deliver({
      accessToken: "hubspot-token",
      externalContactId: "contact-88",
      payload,
      fetchImpl
    });
    expect(result.externalRecordId).toBe("hubspot-call-1");
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.hubapi.com/crm/objects/2026-03/calls");
    expect((options.headers as Record<string, string>).authorization).toBe("Bearer hubspot-token");
    const body = JSON.parse(String(options.body));
    expect(body.properties).toMatchObject({
      hs_call_duration: "73000",
      hs_call_direction: "INBOUND",
      hs_call_status: "COMPLETED",
      hs_call_callee_object_id: "contact-88"
    });
    expect(body.associations[0]).toEqual({
      to: { id: "contact-88" },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 194 }]
    });
    expect(String(options.body)).not.toContain("transcript");
  });

  it("returns a safe provider error for retry handling", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Missing required scope" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    }));
    await expect(hubSpotCallLogAdapter.deliver({
      accessToken: "restricted-token",
      externalContactId: "contact-88",
      payload,
      fetchImpl
    })).rejects.toThrow("Missing required scope");
  });
});
