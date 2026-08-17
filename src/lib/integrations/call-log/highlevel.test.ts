import { describe, expect, it, vi } from "vitest";
import { externalCallLogPayloadSchema } from "./contracts";
import { highLevelCallLogAdapter } from "./highlevel";

const payload = externalCallLogPayloadSchema.parse({
  schemaVersion: 1,
  callId: "11111111-1111-4111-8111-111111111111",
  providerCallId: "provider-call-1",
  direction: "outbound",
  status: "completed",
  outcome: "followup_needed",
  summary: "Customer requested a revised estimate.",
  durationSeconds: 61,
  callerNumber: "+17155550100",
  qualification: null,
  nextSteps: ["Prepare revision"],
  appointmentId: null,
  customerId: null,
  leadId: "22222222-2222-4222-8222-222222222222",
  ferocityUrl: "https://ferocity.live/app/calls/11111111-1111-4111-8111-111111111111",
  completedAt: "2026-08-14T12:00:00.000Z"
});

describe("HighLevel call-log adapter", () => {
  it("creates a note on an already-mapped contact", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ note: { id: "note-1" } }), {
      status: 201,
      headers: { "content-type": "application/json" }
    }));
    const result = await highLevelCallLogAdapter.deliver({
      accessToken: "secret-token",
      externalContactId: "contact/with spaces",
      payload,
      fetchImpl
    });
    expect(result.externalRecordId).toBe("note-1");
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/contact%2Fwith%20spaces/notes");
    expect((options.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(options.body)).body).toContain("View the complete call in Ferocity");
    expect(String(options.body)).not.toContain("transcript");
  });

  it("returns a safe provider error for retry handling", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Token is not authorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    }));
    await expect(highLevelCallLogAdapter.deliver({
      accessToken: "expired",
      externalContactId: "contact-1",
      payload,
      fetchImpl
    })).rejects.toThrow("Token is not authorized");
  });
});
