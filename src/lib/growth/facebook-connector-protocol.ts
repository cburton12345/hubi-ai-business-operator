import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { issueGrowthConnectorSession, validateGrowthConnectorSession } from "./connector-session";

export const facebookConnectorScopes = [
  "facebook:observe", "facebook:health", "facebook:action:claim", "facebook:action:confirm"
] as const;

export const facebookObservationSchema = z.object({
  providerEventId: z.string().trim().min(1).max(300),
  externalConversationRef: z.string().trim().min(1).max(500),
  externalActorId: z.string().trim().min(1).max(300),
  displayName: z.string().trim().max(200).optional(),
  profileUrl: z.string().url().max(2000).optional(),
  body: z.string().trim().min(1).max(10_000),
  sourceUrl: z.string().url().max(2000),
  surface: z.enum(["page", "group", "messenger"]),
  connectorVersion: z.string().trim().min(1).max(50),
  observedAt: z.string().datetime().optional()
});

export const facebookHealthSchema = z.object({
  state: z.enum(["ready", "warning", "verification_required", "restricted", "connector_incompatible"]),
  reason: z.string().trim().max(1000).optional(),
  providerCode: z.string().trim().max(100).optional(),
  url: z.string().url().max(2000),
  connectorVersion: z.string().trim().min(1).max(50)
});

export const facebookActionConfirmationSchema = z.object({
  actionId: z.string().uuid(),
  outcome: z.enum(["succeeded", "failed", "blocked", "canceled"]),
  providerReference: z.string().trim().max(500).optional(),
  failureCode: z.string().trim().max(100).optional(),
  failureMessage: z.string().trim().max(1000).optional(),
  observedUrl: z.string().url().max(2000).optional()
}).superRefine((value, context) => {
  if (value.outcome !== "succeeded" && !value.failureMessage) {
    context.addIssue({ code: "custom", path: ["failureMessage"], message: "A non-success outcome requires a reason." });
  }
});

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePairingCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function issueFacebookPairingCode(input: {
  tenantId: string; identityId: string; issuedByUserId?: string | null; enableControlledTest: boolean;
}) {
  const identity = await queryPostgres<{ brand_id: string }>(`
    select brand_id from public.growth_distribution_identities
    where tenant_id = $1 and id = $2 and channel_key = 'facebook'
  `, [input.tenantId, input.identityId]);
  const row = identity?.rows[0];
  if (!row) return null;

  if (input.enableControlledTest) {
    const enabled = await queryPostgres<{ id: string }>(`
      update public.growth_policies set rollout_stage = greatest(rollout_stage, 3),
        action_policy_json = action_policy_json || '{"facebook":{"assistedApprovedActions":true,"humanConfirmationRequired":true}}'::jsonb,
        updated_at = now()
      where tenant_id = $1 and brand_id = $2 and policy_key = 'default' and status = 'active'
      returning id
    `, [input.tenantId, row.brand_id]);
    if (!enabled?.rows[0]) {
      await queryPostgres(`
        insert into public.growth_policies
          (tenant_id, brand_id, policy_key, rollout_stage, risk_tolerance, action_policy_json)
        values ($1,$2,'default',3,'conservative',
          '{"facebook":{"assistedApprovedActions":true,"humanConfirmationRequired":true}}'::jsonb)
      `, [input.tenantId, row.brand_id]);
    }
  }

  const raw = randomBytes(6).toString("hex").toUpperCase();
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  await queryPostgres(`
    update public.growth_connector_pairing_codes set revoked_at = now()
    where tenant_id = $1 and identity_id = $2 and used_at is null and revoked_at is null
  `, [input.tenantId, input.identityId]);
  await queryPostgres(`
    insert into public.growth_connector_pairing_codes
      (tenant_id, brand_id, identity_id, code_hash, issued_by_user_id, expires_at, metadata_json)
    values ($1,$2,$3,$4,$5,now() + interval '10 minutes',$6::jsonb)
  `, [input.tenantId, row.brand_id, input.identityId, hash(normalizePairingCode(code)), input.issuedByUserId ?? null,
    JSON.stringify({ channel: "facebook", singleUse: true })]);
  return { code, expiresInSeconds: 600 };
}

export async function exchangeFacebookPairingCode(input: {
  code: string; deviceId: string; connectorVersion: string;
}) {
  const normalized = normalizePairingCode(input.code);
  if (normalized.length !== 12) return null;
  const claimed = await queryPostgres<{ tenant_id: string; brand_id: string; identity_id: string }>(`
    update public.growth_connector_pairing_codes set used_at = now()
    where id = (
      select id from public.growth_connector_pairing_codes
      where code_hash = $1 and used_at is null and revoked_at is null and expires_at > now()
      for update skip locked limit 1
    ) returning tenant_id, brand_id, identity_id
  `, [hash(normalized)]);
  const row = claimed?.rows[0];
  if (!row) return null;
  const token = await issueGrowthConnectorSession({
    tenantId: row.tenant_id, brandId: row.brand_id, identityId: row.identity_id,
    deviceId: input.deviceId, connectorVersion: input.connectorVersion,
    scopes: [...facebookConnectorScopes], lifetimeMinutes: 720
  });
  await queryPostgres(`
    update public.growth_connector_sessions set paired_at = now()
    where token_hash = $1
  `, [hash(token)]);
  await queryPostgres(`
    update public.growth_distribution_identities set connection_mode = 'assisted_browser',
      authorization_status = 'connected',
      verification_status = case when verification_status = 'unknown' then 'not_required' else verification_status end,
      connector_version = $3, last_health_check_at = now(), updated_at = now()
    where tenant_id = $1 and id = $2 and channel_key = 'facebook'
  `, [row.tenant_id, row.identity_id, input.connectorVersion]);
  return { token, tenantId: row.tenant_id, brandId: row.brand_id, identityId: row.identity_id, expiresInSeconds: 43_200 };
}

export function readConnectorBearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const deviceId = request.headers.get("x-ferocity-device-id")?.trim() ?? "";
  return token && deviceId ? { token, deviceId } : null;
}

export async function authenticateFacebookConnector(request: Request, requiredScope: typeof facebookConnectorScopes[number]) {
  const credentials = readConnectorBearer(request);
  if (!credentials) return null;
  return validateGrowthConnectorSession({ ...credentials, requiredScope });
}
