import { queryPostgres } from "@/lib/db/postgres";
import { recordAuthenticatedConversationalAction } from "@/lib/office-manager/conversational-actions";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { verifyRetellSignature } from "@/lib/providers/voice-adapters";

type JsonRecord = Record<string, unknown>;

type OwnerToolDependencies = {
  resolveTenant: (agentId: string | null, phoneNumber: string | null) => Promise<string | null>;
  resolveApiKey: (tenantId: string) => Promise<string | null>;
  verifySignature: (rawBody: string, apiKey: string, signature: string | null) => boolean;
  resolveSession: (tenantId: string, providerCallId: string) => Promise<{
    authSessionId: string;
    conversationSessionId: string | null;
    brandId: string | null;
  } | null>;
  recordAction: typeof recordAuthenticatedConversationalAction;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function cleanText(value: unknown, max = 2_000) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, max);
  return cleaned || null;
}

function boolean(value: unknown) {
  return value === true || value === "true";
}

function parseAction(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function processRetellOwnerCommandTool(
  rawBody: string,
  signature: string | null,
  dependencies: OwnerToolDependencies
) {
  let payload: JsonRecord;
  try {
    payload = JSON.parse(rawBody || "{}") as JsonRecord;
  } catch {
    return { ok: false, status: "clarification_required", message: "I could not understand that action request." };
  }
  if (cleanText(payload.name, 80) !== "owner_business_action") {
    return { ok: false, status: "blocked", message: "That owner action is not supported." };
  }

  const call = record(payload.call);
  const args = record(payload.args);
  const providerCallId = cleanText(call.call_id, 200);
  const tenantId = await dependencies.resolveTenant(
    cleanText(call.agent_id, 200),
    cleanText(call.to_number ?? call.from_number, 40)
  );
  if (!tenantId || !providerCallId) {
    return { ok: false, status: "blocked", message: "I cannot connect this call to a Ferocity workspace." };
  }
  const apiKey = await dependencies.resolveApiKey(tenantId);
  if (!apiKey || !dependencies.verifySignature(rawBody, apiKey, signature)) {
    return { ok: false, status: "blocked", message: "I cannot authenticate the voice provider for this request." };
  }

  const ownerSession = await dependencies.resolveSession(tenantId, providerCallId);
  if (!ownerSession) {
    return {
      ok: false,
      status: "blocked",
      message: "This is not an active private owner session. I can discuss general information, but I cannot change the business."
    };
  }
  const action = parseAction(args.action_payload ?? args.action);
  const originalInstruction = cleanText(args.original_instruction, 2_000);
  const toolCallId = cleanText(payload.tool_call_id ?? args.tool_call_id, 200);
  if (!action || !originalInstruction || !toolCallId) {
    return {
      ok: false,
      status: "clarification_required",
      message: "Repeat the requested action clearly before I prepare or perform it."
    };
  }

  return dependencies.recordAction({
    tenantId,
    brandId: ownerSession.brandId,
    authSessionId: ownerSession.authSessionId,
    conversationSessionId: ownerSession.conversationSessionId,
    providerKey: "retell_voice",
    providerSessionId: providerCallId,
    idempotencyKey: `retell-owner:${providerCallId}:${toolCallId}`,
    originalInstruction,
    action,
    explicitApproval: boolean(args.explicit_approval),
    secondaryConfirmation: boolean(args.secondary_confirmation)
  });
}

async function resolveOwnerSession(tenantId: string, providerCallId: string) {
  const result = await queryPostgres<{
    id: string;
    conversation_session_id: string | null;
    brand_id: string | null;
  }>(
    `select s.id, s.conversation_session_id, c.brand_id
     from public.owner_conversation_auth_sessions s
     left join public.office_manager_conversation_sessions c
       on c.tenant_id=s.tenant_id and c.id=s.conversation_session_id
     where s.tenant_id=$1 and s.provider_key='retell_voice'
       and s.provider_session_id=$2 and s.status='verified' and s.expires_at>now()
     limit 1`,
    [tenantId, providerCallId]
  );
  const row = result?.rows[0];
  return row ? {
    authSessionId: row.id,
    conversationSessionId: row.conversation_session_id,
    brandId: row.brand_id
  } : null;
}

export const retellOwnerCommandDependencies: OwnerToolDependencies = {
  resolveTenant: resolveRetellWebhookTenant,
  resolveApiKey: async (tenantId) => (await resolveRetellConfiguration(tenantId, false))?.apiKey ?? null,
  verifySignature: verifyRetellSignature,
  resolveSession: resolveOwnerSession,
  recordAction: recordAuthenticatedConversationalAction
};
