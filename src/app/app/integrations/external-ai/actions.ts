"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import {
  createExternalAiCredential,
  authenticateExternalAiBearer,
  externalAiScopeCatalog,
  revokeExternalAiCredential,
} from "@/lib/mcp/credentials";
import { handleFerocityMcpRequest } from "@/lib/mcp/server";

export type ExternalAiCredentialActionState = {
  ok: boolean;
  message: string;
  token?: string;
  credentialId?: string;
  tokenPrefix?: string;
  expiresAt?: string | null;
  providerKey?: "muse" | "generic_mcp";
};

export type ExternalAiTestState = { ok: boolean; message: string };

const createSchema = z.object({
  label: z.string().trim().min(2).max(180),
  providerKey: z.enum(["muse", "generic_mcp"]).default("generic_mcp"),
  expirationDays: z.coerce.number().int().min(1).max(365).default(90),
  scopes: z.array(z.enum(externalAiScopeCatalog)).min(1),
  consentAcknowledged: z.literal("yes"),
  dailyRequestLimit: z.coerce.number().int().min(25).max(10_000).default(500),
  dailyRecordLimit: z.coerce.number().int().min(100).max(100_000).default(2_500),
});

function formScopes(formData: FormData) {
  return formData.getAll("scopes").filter((value): value is string => typeof value === "string");
}

export async function createExternalAiCredentialAction(
  _previous: ExternalAiCredentialActionState,
  formData: FormData,
): Promise<ExternalAiCredentialActionState> {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return { ok: false, message: "Sign in with a workspace user account to create a user-bound credential." };
  const parsed = createSchema.safeParse({
    label: formData.get("label"),
    providerKey: formData.get("providerKey") ?? "generic_mcp",
    expirationDays: formData.get("expirationDays") ?? 90,
    scopes: formScopes(formData),
    consentAcknowledged: formData.get("consentAcknowledged"),
    dailyRequestLimit: formData.get("dailyRequestLimit") ?? 500,
    dailyRecordLimit: formData.get("dailyRecordLimit") ?? 2500,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the credential settings." };
  try {
    const created = await createExternalAiCredential({
      tenantId: actor.workspace.id,
      authorizedUserId: actor.userId,
      actorUserId: actor.userId,
      providerKey: parsed.data.providerKey,
      label: parsed.data.label,
      scopes: parsed.data.scopes,
      expiresAt: new Date(Date.now() + parsed.data.expirationDays * 86_400_000).toISOString(),
      consentAcknowledged: true,
      dailyRequestLimit: parsed.data.dailyRequestLimit,
      dailyRecordLimit: parsed.data.dailyRecordLimit,
    });
    revalidatePath("/app/integrations/external-ai");
    return { ok: true, message: "Credential created. Copy it now; Ferocity cannot show it again.", providerKey: parsed.data.providerKey, ...created };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Credential creation failed safely." };
  }
}

export async function testExternalAiTokenAction(
  _previous: ExternalAiTestState,
  formData: FormData,
): Promise<ExternalAiTestState> {
  const actor = await requirePermission("tenant:manage");
  const token = z.string().trim().min(40).max(200).safeParse(formData.get("token"));
  if (!token.success) return { ok: false, message: "The one-time token is missing or invalid." };
  try {
    const credential = await authenticateExternalAiBearer({
      authorizationHeader: `Bearer ${token.data}`,
      userAgent: "Ferocity connection test authorization",
    });
    if (!credential || credential.tenantId !== actor.workspace.id) {
      return { ok: false, message: "This token is invalid or belongs to a different workspace." };
    }
    const response = await handleFerocityMcpRequest(new Request("https://api.ferocity.live/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.data}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
        "user-agent": "Ferocity read-only connection test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call",
        params: { name: "get_business_summary", arguments: {} } }),
    }));
    const body = await response.json() as { result?: { structuredContent?: { status?: string } }; error?: { message?: string } };
    if (!response.ok || body.error) return { ok: false, message: body.error?.message ?? "The read-only MCP test failed safely." };
    const status = body.result?.structuredContent?.status;
    return status === "completed" || status === "needs_review"
      ? { ok: true, message: "Connection verified: the token authenticated and get_business_summary completed through MCP." }
      : { ok: false, message: `The MCP call returned ${status ?? "an unknown state"}. Review the connection before relying on it.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The read-only MCP test failed safely." };
  }
}

export async function rotateExternalAiCredentialAction(
  _previous: ExternalAiCredentialActionState,
  formData: FormData,
): Promise<ExternalAiCredentialActionState> {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return { ok: false, message: "Sign in with a workspace user account to rotate a user-bound credential." };
  const credentialId = z.string().uuid().safeParse(formData.get("credentialId"));
  if (!credentialId.success) return { ok: false, message: "The credential reference is invalid." };
  const current = await queryPostgres<{
    label: string; provider_key: string; scopes: string[]; authorized_user_id: string;
    daily_request_limit: number; daily_record_limit: number;
  }>(
    `select label,provider_key,scopes,authorized_user_id,daily_request_limit,daily_record_limit from public.external_ai_credentials
     where tenant_id=$1 and id=$2 and status='active' limit 1`,
    [actor.workspace.id, credentialId.data],
  );
  const row = current?.rows[0];
  if (!row) return { ok: false, message: "The credential is no longer active." };
  try {
    const created = await createExternalAiCredential({
      tenantId: actor.workspace.id,
      authorizedUserId: row.authorized_user_id,
      actorUserId: actor.userId,
      providerKey: row.provider_key,
      label: `${row.label} rotated`.slice(0, 180),
      scopes: row.scopes,
      expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      rotatedFromId: credentialId.data,
      dailyRequestLimit: row.daily_request_limit,
      dailyRecordLimit: row.daily_record_limit,
    });
    revalidatePath("/app/integrations/external-ai");
    return { ok: true, message: "Credential rotated. The prior token is revoked. Copy the replacement now.",
      providerKey: row.provider_key === "muse" ? "muse" : "generic_mcp", ...created };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Credential rotation failed safely." };
  }
}

export async function revokeExternalAiCredentialAction(formData: FormData) {
  const actor = await requirePermission("tenant:manage");
  if (actor.userId === "admin-token") return;
  const credentialId = z.string().uuid().safeParse(formData.get("credentialId"));
  if (!credentialId.success) return;
  await revokeExternalAiCredential({ tenantId: actor.workspace.id, credentialId: credentialId.data, actorUserId: actor.userId });
  revalidatePath("/app/integrations/external-ai");
}
