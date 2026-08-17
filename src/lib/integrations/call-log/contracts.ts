import { z } from "zod";

export const externalCallLogProviderSchema = z.enum([
  "highlevel",
  "jobber",
  "housecall_pro",
  "hubspot",
  "servicetitan"
]);

export type ExternalCallLogProvider = z.infer<typeof externalCallLogProviderSchema>;

export const externalCallLogPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  callId: z.string().uuid(),
  providerCallId: z.string().trim().min(1).max(500),
  direction: z.enum(["inbound", "outbound"]),
  status: z.string().trim().min(1).max(80),
  outcome: z.string().trim().max(120).nullable(),
  summary: z.string().trim().min(1).max(2_000),
  durationSeconds: z.number().int().min(0),
  callerNumber: z.string().trim().max(80).nullable(),
  qualification: z.string().trim().max(80).nullable(),
  nextSteps: z.array(z.string().trim().min(1).max(500)).max(20),
  appointmentId: z.string().uuid().nullable(),
  customerId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  ferocityUrl: z.string().url(),
  completedAt: z.string().datetime()
});

export type ExternalCallLogPayload = z.infer<typeof externalCallLogPayloadSchema>;

export type ExternalCallLogDeliveryResult = {
  externalRecordId: string | null;
  providerResponse?: Record<string, unknown>;
};

export type ExternalCallLogAdapter = {
  providerKey: ExternalCallLogProvider;
  deliver(input: {
    accessToken: string;
    externalContactId: string;
    payload: ExternalCallLogPayload;
    fetchImpl?: typeof fetch;
  }): Promise<ExternalCallLogDeliveryResult>;
};

export function formatExternalCallLogNote(payload: ExternalCallLogPayload) {
  const duration = payload.durationSeconds > 0
    ? `${Math.floor(payload.durationSeconds / 60)}m ${payload.durationSeconds % 60}s`
    : "No connected duration";
  const lines = [
    `Ferocity ${payload.direction} call — ${payload.status}`,
    `Outcome: ${payload.outcome ?? "Not classified"}`,
    `Duration: ${duration}`,
    `Summary: ${payload.summary}`,
    payload.qualification ? `Lead qualification: ${payload.qualification}` : null,
    payload.nextSteps.length ? `Next steps: ${payload.nextSteps.join("; ")}` : null,
    `View the complete call in Ferocity: ${payload.ferocityUrl}`,
    `Ferocity call ID: ${payload.callId}`
  ];
  return lines.filter(Boolean).join("\n").slice(0, 5_000);
}
