import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { deliverSignedExternalCallLog } from "@/lib/integrations/call-log/signed-webhook";

const payload = {
  schemaVersion: 1 as const,
  callId: "11111111-1111-4111-8111-111111111111",
  providerCallId: "provider-call-1",
  direction: "inbound" as const,
  status: "completed",
  outcome: "qualified",
  summary: "Caller requested an estimate.",
  durationSeconds: 87,
  callerNumber: "+17155550100",
  qualification: "qualified",
  nextSteps: ["Prepare estimate"],
  appointmentId: null,
  customerId: null,
  leadId: null,
  ferocityUrl: "https://ferocity.live/app/calls/11111111-1111-4111-8111-111111111111",
  completedAt: "2026-08-14T12:00:00.000Z"
};

describe("deliverSignedExternalCallLog", () => {
  it("sends a canonical, signed event without a transcript", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      const headers = init?.headers as Record<string, string>;
      expect(JSON.parse(body)).toMatchObject({
        eventType: "ferocity.call.completed",
        provider: "jobber",
        externalContactId: "jobber-client-9",
        data: payload
      });
      expect(body).not.toContain("transcript");
      expect(headers["x-ferocity-signature"]).toBe(
        `sha256=${createHmac("sha256", "bridge-secret").update(body).digest("hex")}`
      );
      return new Response(JSON.stringify({ externalRecordId: "note-9" }), { status: 200 });
    });

    await expect(deliverSignedExternalCallLog({
      providerKey: "jobber",
      destinationUrl: "https://hooks.example.com/call-log",
      signingSecret: "bridge-secret",
      externalContactId: "jobber-client-9",
      payload,
      fetchImpl: fetchImpl as typeof fetch
    })).resolves.toMatchObject({ externalRecordId: "note-9" });
  });

  it("rejects provider failures so the outbox can retry", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await expect(deliverSignedExternalCallLog({
      providerKey: "housecall_pro",
      destinationUrl: "https://hooks.example.com/call-log",
      signingSecret: "bridge-secret",
      externalContactId: "hcp-customer-3",
      payload,
      fetchImpl: fetchImpl as typeof fetch
    })).rejects.toThrow("HTTP 503");
  });
});
