import { createHmac } from "node:crypto";
import { externalCallLogPayloadSchema, type ExternalCallLogProvider } from "@/lib/integrations/call-log/contracts";

export async function deliverSignedExternalCallLog(input: {
  providerKey: ExternalCallLogProvider;
  destinationUrl: string;
  signingSecret: string;
  externalContactId: string;
  payload: unknown;
  fetchImpl?: typeof fetch;
}) {
  const payload = externalCallLogPayloadSchema.parse(input.payload);
  const envelope = JSON.stringify({
    eventType: "ferocity.call.completed",
    provider: input.providerKey,
    externalContactId: input.externalContactId,
    idempotencyKey: `external-call-log:${input.providerKey}:${payload.callId}`,
    data: payload
  });
  const signature = createHmac("sha256", input.signingSecret).update(envelope).digest("hex");
  const response = await (input.fetchImpl ?? fetch)(input.destinationUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ferocity-event": "ferocity.call.completed",
      "x-ferocity-signature": `sha256=${signature}`
    },
    body: envelope,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Call-log bridge returned HTTP ${response.status}.`);
  const body = await response.json().catch(() => null) as { id?: string; externalRecordId?: string } | null;
  return {
    externalRecordId: body?.externalRecordId ?? body?.id ?? null,
    providerResponse: { status: response.status, signed: true }
  };
}
