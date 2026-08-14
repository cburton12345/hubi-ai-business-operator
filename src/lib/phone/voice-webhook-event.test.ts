import { describe, expect, it } from "vitest";
import { voiceWebhookBodyFromEvent } from "./voice-webhook-event";

describe("voiceWebhookBodyFromEvent", () => {
  it("preserves business action fields without allowing them to replace trusted routing fields", () => {
    const body = voiceWebhookBodyFromEvent({
      providerKey: "retell_voice",
      providerCallId: "call-1",
      providerEventId: "event-1",
      callerNumber: "+17155550100",
      calledNumber: "+18885550100",
      status: "completed",
      occurredAt: "2026-08-13T12:00:00.000Z",
      durationSeconds: 90,
      recordingUrl: "https://example.test/recording",
      transcriptText: "Caller booked an estimate.",
      metadata: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        brandId: "22222222-2222-4222-8222-222222222222",
        customerId: "33333333-3333-4333-8333-333333333333",
        eventType: "call_analyzed",
        summary: "Qualified and booked.",
        structuredData: {
          tenantId: "untrusted-override",
          outcome: "scheduled",
          appointmentStart: "2026-08-14T16:00:00.000Z",
          appointmentConfirmed: true,
          transferResult: "not_requested",
          estimatedValueCents: 250000,
          ownerRequested: false
        }
      }
    });

    expect(body.tenantId).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.outcome).toBe("scheduled");
    expect(body.appointmentStart).toBe("2026-08-14T16:00:00.000Z");
    expect(body.appointmentConfirmed).toBe(true);
    expect(body.customerId).toBe("33333333-3333-4333-8333-333333333333");
  });
});
