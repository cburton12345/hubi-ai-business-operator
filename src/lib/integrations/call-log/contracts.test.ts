import { describe, expect, it } from "vitest";
import { externalCallLogPayloadSchema, formatExternalCallLogNote } from "./contracts";

const payload = externalCallLogPayloadSchema.parse({
  schemaVersion: 1,
  callId: "11111111-1111-4111-8111-111111111111",
  providerCallId: "provider-call-1",
  direction: "inbound",
  status: "completed",
  outcome: "appointment_requested",
  summary: "Caller asked for a roof inspection.",
  durationSeconds: 203,
  callerNumber: "+17155550100",
  qualification: "warm",
  nextSteps: ["Confirm Tuesday availability"],
  appointmentId: null,
  customerId: "22222222-2222-4222-8222-222222222222",
  leadId: null,
  ferocityUrl: "https://ferocity.live/app/calls/11111111-1111-4111-8111-111111111111",
  completedAt: "2026-08-14T12:00:00.000Z"
});

describe("external call log contract", () => {
  it("keeps the handoff concise and links to the canonical Ferocity call", () => {
    const note = formatExternalCallLogNote(payload);
    expect(note).toContain("Duration: 3m 23s");
    expect(note).toContain("Confirm Tuesday availability");
    expect(note).toContain(payload.ferocityUrl);
    expect(note).not.toContain("Transcript:");
  });

  it("rejects a handoff without the canonical call URL", () => {
    expect(externalCallLogPayloadSchema.safeParse({ ...payload, ferocityUrl: "" }).success).toBe(false);
  });
});
