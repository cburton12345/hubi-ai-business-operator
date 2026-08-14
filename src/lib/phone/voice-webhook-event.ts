import type { InboundCallEvent } from "@/lib/providers/interfaces";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Converts a trusted, provider-normalized event into the shared Ferocity voice
 * webhook contract. Provider analysis is preserved, but it cannot override
 * tenant, provider, call, status, or media fields established by the adapter.
 */
export function voiceWebhookBodyFromEvent(event: InboundCallEvent): Record<string, unknown> {
  const metadata = record(event.metadata);
  const structuredData = record(metadata.structuredData);

  return {
    ...structuredData,
    tenantId: metadata.tenantId,
    brandId: metadata.brandId,
    customerId: metadata.customerId,
    leadId: metadata.leadId,
    provider: event.providerKey,
    providerEventId: event.providerEventId,
    providerCallId: event.providerCallId,
    eventType: metadata.eventType,
    callerNumber: event.callerNumber,
    calledNumber: event.calledNumber,
    status: event.status,
    occurredAt: event.occurredAt,
    durationSeconds: event.durationSeconds,
    recordingUrl: event.recordingUrl,
    providerRecordingId: metadata.providerRecordingId,
    transcriptText: event.transcriptText,
    transcriptTurns: event.transcriptTurns,
    redactedTranscriptText: metadata.redactedTranscriptText,
    summary: metadata.summary,
    providerCostCents: metadata.providerCostCents,
    providerCostRaw: metadata.providerCostRaw,
    direction: metadata.direction,
    endedReason: metadata.endedReason
  };
}
