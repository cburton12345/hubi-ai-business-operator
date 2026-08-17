import {
  externalCallLogPayloadSchema,
  formatExternalCallLogNote,
  type ExternalCallLogAdapter
} from "@/lib/integrations/call-log/contracts";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const HUBSPOT_CALL_TO_CONTACT_ASSOCIATION_ID = 194;

function normalizedPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function resolveHubSpotContactByPhone(input: {
  accessToken: string;
  phone: string;
  fetchImpl?: typeof fetch;
}) {
  const target = normalizedPhone(input.phone);
  if (target.length < 7) return null;
  const response = await (input.fetchImpl ?? fetch)(`${HUBSPOT_API_BASE}/crm/objects/2026-03/contacts/search`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query: input.phone, limit: 10, properties: ["phone", "mobilephone"] }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as {
    results?: Array<{ id?: string; properties?: { phone?: string | null; mobilephone?: string | null } }>;
    message?: string;
    category?: string;
  } | null;
  if (!response.ok) throw new Error(body?.message || body?.category || `HubSpot contact lookup returned HTTP ${response.status}.`);
  const matches = (body?.results ?? []).filter((candidate) => {
    const phones = [candidate.properties?.phone, candidate.properties?.mobilephone].map(normalizedPhone).filter(Boolean);
    return phones.includes(target);
  });
  return matches.length === 1 ? matches[0]?.id ?? null : null;
}

export const hubSpotCallLogAdapter: ExternalCallLogAdapter = {
  providerKey: "hubspot",
  async deliver(input) {
    const payload = externalCallLogPayloadSchema.parse(input.payload);
    const response = await (input.fetchImpl ?? fetch)(`${HUBSPOT_API_BASE}/crm/objects/2026-03/calls`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        properties: {
          hs_timestamp: payload.completedAt,
          hs_call_title: `Ferocity ${payload.direction} call`,
          hs_call_body: formatExternalCallLogNote(payload),
          hs_call_duration: String(payload.durationSeconds * 1_000),
          hs_call_direction: payload.direction.toUpperCase(),
          hs_call_status: "COMPLETED",
          hs_call_callee_object_id: input.externalContactId
        },
        associations: [{
          to: { id: input.externalContactId },
          types: [{
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: HUBSPOT_CALL_TO_CONTACT_ASSOCIATION_ID
          }]
        }]
      }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => null) as {
      id?: string;
      message?: string;
      category?: string;
    } | null;
    if (!response.ok) throw new Error(body?.message || body?.category || `HubSpot returned HTTP ${response.status}.`);
    return {
      externalRecordId: body?.id ?? null,
      providerResponse: { status: response.status, objectType: "call" }
    };
  }
};
