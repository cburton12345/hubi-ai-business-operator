import { createHash, randomBytes, randomUUID } from "node:crypto";
import { queryPostgres, withPostgresTransactionResult } from "@/lib/db/postgres";
import type { BusinessActionPrincipal } from "@/lib/business-actions/principal-policy";
import { EXTERNAL_AI_CONSENT_SUMMARY, EXTERNAL_AI_CONSENT_VERSION } from "@/lib/mcp/consent-policy";

export const externalAiScopeCatalog = [
  "business:read",
  "customers:read",
  "jobs:read",
  "invoices:read",
  "commitments:read",
  "commitments:write",
  "workflows:read",
  "workflows:write",
] as const;

export type ExternalAiScope = (typeof externalAiScopeCatalog)[number];

export type AuthenticatedExternalAiCredential = {
  credentialId: string;
  tenantId: string;
  userId: string;
  providerKey: string;
  label: string;
  scopes: string[];
  dailyRequestLimit: number;
  dailyRecordLimit: number;
  principal: BusinessActionPrincipal;
};

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeScopes(scopes: string[]) {
  const allowed = new Set<string>(externalAiScopeCatalog);
  return [...new Set(scopes.map((scope) => scope.trim()).filter((scope) => allowed.has(scope)))].sort();
}

function createToken() {
  return `fer_mcp_${randomBytes(32).toString("base64url")}`;
}

async function recordCredentialLifecycle(input: {
  tenantId: string;
  credentialId: string;
  eventType: "created" | "rotated" | "revoked";
  label?: string;
}) {
  const title = input.eventType === "revoked" ? "External AI access revoked" : input.eventType === "rotated" ? "External AI access rotated" : "External AI access connected";
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,
       severity,status,owner_attention,ai_handled,ai_summary,recommended_action,action_href,
       risk_type,confidence_score,metadata_json
     ) values ($1,'external-ai','External AI',$2,$3,$4,$5,'info','watching',false,true,$6,$7,
       '/app/integrations/external-ai','automation',100,$8::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing`,
    [input.tenantId, `credential:${input.credentialId}:${input.eventType}`, `external_ai.credential_${input.eventType}`,
      title, `${input.label ?? "An external assistant"} credential was ${input.eventType}.`,
      "Ferocity recorded the credential lifecycle event without storing its plaintext token.",
      "Review or revoke this connection from Authorized AI Assistants if it is no longer expected.",
      JSON.stringify({ credentialId: input.credentialId, lifecycle: input.eventType })],
  );
}

export async function createExternalAiCredential(input: {
  tenantId: string;
  authorizedUserId: string;
  actorUserId: string;
  providerKey?: string;
  label: string;
  scopes: string[];
  expiresAt?: string | null;
  rotatedFromId?: string | null;
  consentAcknowledged?: boolean;
  dailyRequestLimit?: number;
  dailyRecordLimit?: number;
}) {
  const scopes = normalizeScopes(input.scopes);
  if (!scopes.length) throw new Error("At least one supported scope is required.");
  const label = input.label.trim().slice(0, 180);
  if (!label) throw new Error("A credential label is required.");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
    throw new Error("Credential expiration must be in the future.");
  }
  const token = createToken();
  const dailyRequestLimit = Math.min(10_000, Math.max(1, Math.trunc(input.dailyRequestLimit ?? 500)));
  const dailyRecordLimit = Math.min(100_000, Math.max(1, Math.trunc(input.dailyRecordLimit ?? 2_500)));
  const id = randomUUID();
  const tokenPrefix = token.slice(0, 20);
  const result = await withPostgresTransactionResult(async (client) => {
    const actor = await client.query<{ role: string }>(
      `select role from public.tenant_users where tenant_id=$1 and user_id=$2 and status='active' and role in ('owner','admin') limit 1`,
      [input.tenantId, input.actorUserId],
    );
    if (!actor.rows[0]) throw new Error("Only an active workspace owner or admin can create integration credentials.");
    const authorized = await client.query<{ role: string }>(
      `select role from public.tenant_users where tenant_id=$1 and user_id=$2 and status='active' limit 1`,
      [input.tenantId, input.authorizedUserId],
    );
    if (!authorized.rows[0]) throw new Error("The authorized user is not an active workspace member.");
    let inheritedConsent: { consent_version: string; consented_at: string; consent_summary: string } | null = null;
    if (input.rotatedFromId) {
      const rotated = await client.query<{ id: string; consent_version: string; consented_at: string; consent_summary: string }>(
        `select id,consent_version,consented_at,consent_summary from public.external_ai_credentials where id=$1 and tenant_id=$2 and status='active' for update`,
        [input.rotatedFromId, input.tenantId],
      );
      if (!rotated.rows[0]) throw new Error("The credential being rotated is not active in this workspace.");
      inheritedConsent = rotated.rows[0];
    }
    if (!inheritedConsent && input.consentAcknowledged !== true) {
      throw new Error("Explicit external AI data-sharing consent is required before creating a credential.");
    }
    const consentVersion = inheritedConsent?.consent_version ?? EXTERNAL_AI_CONSENT_VERSION;
    const consentedAt = inheritedConsent?.consented_at ?? new Date().toISOString();
    const consentSummary = inheritedConsent?.consent_summary ?? EXTERNAL_AI_CONSENT_SUMMARY;
    await client.query(
      `insert into public.external_ai_credentials
         (id,tenant_id,authorized_user_id,provider_key,label,token_prefix,token_hash,scopes,
          daily_request_limit,daily_record_limit,consent_version,consented_at,consent_summary,expires_at,rotated_from_id,metadata_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [id, input.tenantId, input.authorizedUserId, (input.providerKey ?? "generic_mcp").trim().slice(0, 80),
        label, tokenPrefix, hashToken(token), scopes, dailyRequestLimit, dailyRecordLimit, consentVersion, consentedAt, consentSummary,
        expiresAt?.toISOString() ?? null, input.rotatedFromId ?? null,
        JSON.stringify({ createdByUserId: input.actorUserId, plaintextStored: false, consentVersion, consentedAt })],
    );
    if (input.rotatedFromId) {
      await client.query(
        `update public.external_ai_credentials set status='revoked',revoked_at=now(),revoked_by_user_id=$3,updated_at=now()
         where id=$1 and tenant_id=$2`,
        [input.rotatedFromId, input.tenantId, input.actorUserId],
      );
    }
    return { id };
  });
  if (!result.ok) throw result.error;
  await recordCredentialLifecycle({ tenantId: input.tenantId, credentialId: result.value.id,
    eventType: input.rotatedFromId ? "rotated" : "created", label }).catch(() => undefined);
  return { credentialId: result.value.id, token, tokenPrefix, scopes, dailyRequestLimit, dailyRecordLimit,
    expiresAt: expiresAt?.toISOString() ?? null };
}

export async function revokeExternalAiCredential(input: {
  tenantId: string;
  credentialId: string;
  actorUserId: string;
}) {
  const result = await queryPostgres<{ id: string }>(
    `update public.external_ai_credentials credential set status='revoked',revoked_at=now(),revoked_by_user_id=$3,updated_at=now()
     where credential.id=$1 and credential.tenant_id=$2 and credential.status='active'
       and exists (select 1 from public.tenant_users actor where actor.tenant_id=$2 and actor.user_id=$3 and actor.status='active' and actor.role in ('owner','admin'))
     returning id`,
    [input.credentialId, input.tenantId, input.actorUserId],
  );
  const revoked = Boolean(result?.rows[0]);
  if (revoked) await recordCredentialLifecycle({ tenantId: input.tenantId, credentialId: input.credentialId, eventType: "revoked" }).catch(() => undefined);
  return revoked;
}

export async function authenticateExternalAiBearer(input: {
  authorizationHeader: string | null;
  userAgent?: string | null;
}): Promise<AuthenticatedExternalAiCredential | null> {
  const match = input.authorizationHeader?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length < 40 || match[1].length > 200) return null;
  const result = await queryPostgres<{
    id: string;
    tenant_id: string;
    authorized_user_id: string;
    provider_key: string;
    label: string;
    scopes: string[];
    daily_request_limit: number;
    daily_record_limit: number;
  }>(
    `select credential.id,credential.tenant_id,credential.authorized_user_id,credential.provider_key,credential.label,credential.scopes,
       credential.daily_request_limit,credential.daily_record_limit
     from public.external_ai_credentials credential
     join public.tenants tenant on tenant.id=credential.tenant_id and tenant.status in ('active','trial')
     join public.tenant_users membership on membership.tenant_id=credential.tenant_id
       and membership.user_id=credential.authorized_user_id and membership.status='active'
     where credential.token_hash=$1 and credential.status='active'
       and (credential.expires_at is null or credential.expires_at>now()) limit 1`,
    [hashToken(match[1])],
  );
  const row = result?.rows[0];
  if (!row) return null;
  await queryPostgres(
    `update public.external_ai_credentials set last_used_at=now(),last_used_user_agent=$2,updated_at=now()
     where id=$1 and status='active'`,
    [row.id, input.userAgent?.trim().slice(0, 500) ?? null],
  );
  return {
    credentialId: row.id,
    tenantId: row.tenant_id,
    userId: row.authorized_user_id,
    providerKey: row.provider_key,
    label: row.label,
    scopes: row.scopes,
    dailyRequestLimit: row.daily_request_limit,
    dailyRecordLimit: row.daily_record_limit,
    principal: {
      principalId: `external:${row.id}`,
      principalType: "external_agent",
      tenantId: row.tenant_id,
      userId: row.authorized_user_id,
      providerKey: row.provider_key,
      scopes: row.scopes,
      authorization: { verified: true, source: "stored_agent_grant", grantId: row.id },
      metadata: { credentialLabel: row.label, transport: "mcp_streamable_http" },
    },
  };
}
