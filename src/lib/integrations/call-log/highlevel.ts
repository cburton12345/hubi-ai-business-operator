import {
  externalCallLogPayloadSchema,
  formatExternalCallLogNote,
  type ExternalCallLogAdapter
} from "@/lib/integrations/call-log/contracts";

const HIGHLEVEL_API_BASE = "https://services.leadconnectorhq.com";
const HIGHLEVEL_API_VERSION = "2021-07-28";

export const highLevelCallLogAdapter: ExternalCallLogAdapter = {
  providerKey: "highlevel",
  async deliver(input) {
    const payload = externalCallLogPayloadSchema.parse(input.payload);
    const response = await (input.fetchImpl ?? fetch)(
      `${HIGHLEVEL_API_BASE}/contacts/${encodeURIComponent(input.externalContactId)}/notes`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json",
          version: HIGHLEVEL_API_VERSION
        },
        body: JSON.stringify({ body: formatExternalCallLogNote(payload) }),
        cache: "no-store"
      }
    );
    const body = await response.json().catch(() => null) as {
      note?: { id?: string };
      id?: string;
      message?: string | string[];
      error?: string;
    } | null;
    if (!response.ok) {
      const message = Array.isArray(body?.message) ? body?.message.join("; ") : body?.message;
      throw new Error(message || body?.error || `HighLevel returned HTTP ${response.status}.`);
    }
    return {
      externalRecordId: body?.note?.id ?? body?.id ?? null,
      providerResponse: { status: response.status }
    };
  }
};
