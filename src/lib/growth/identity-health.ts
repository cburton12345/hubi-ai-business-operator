import { queryPostgres } from "@/lib/db/postgres";
import type { GrowthRiskState } from "./distribution-engine";
import { recordGrowthEvent, type GrowthEventType } from "./growth-events";
import { transitionIdentityHealth, type IdentityHealthEvent } from "./growth-policy";

const eventType: Partial<Record<IdentityHealthEvent, GrowthEventType>> = {
  rate_limited: "identity_throttled",
  verification_required: "verification_detected",
  restricted: "restriction_detected",
  owner_paused: "identity_paused",
  verification_cleared: "cooldown_started",
  cooldown_elapsed: "cooldown_completed",
  connector_incompatible: "connector_warning",
  transient_failure: "connector_failure"
};

export async function applyIdentityHealthEvent(input: {
  tenantId: string;
  identityId: string;
  event: IdentityHealthEvent;
  reason?: string;
  providerCode?: string;
  idempotencyKey?: string;
  rawEvent?: Record<string, unknown>;
}) {
  const current = await queryPostgres<{ brand_id: string; channel_key: string; risk_state: GrowthRiskState }>(`
    select brand_id, channel_key, risk_state from public.growth_distribution_identities
    where tenant_id = $1 and id = $2
  `, [input.tenantId, input.identityId]);
  const row = current?.rows[0];
  if (!row) return null;
  const next = transitionIdentityHealth(row.risk_state, input.event);
  const cooldownMinutes = input.event === "verification_cleared" ? 15 : input.event === "transient_failure" && next === "cooldown" ? 10 : null;
  await queryPostgres(`
    update public.growth_distribution_identities set
      risk_state = $3,
      authorization_status = case when $4 = 'verification_required' then 'verification_required' when $4 = 'verification_cleared' then 'connected' else authorization_status end,
      verification_status = case when $4 = 'verification_required' then 'pending' when $4 = 'verification_cleared' then 'verified' else verification_status end,
      cooldown_until = case when $5::integer is null then case when $4 = 'cooldown_elapsed' then null else cooldown_until end else now() + ($5::text || ' minutes')::interval end,
      last_health_check_at = now(),
      last_warning_at = case when $3 <> 'healthy' then now() else last_warning_at end,
      last_success_at = case when $4 = 'success' then now() else last_success_at end,
      last_failure_at = case when $4 in ('transient_failure','rate_limited','restricted','connector_incompatible') then now() else last_failure_at end,
      last_failure_code = case when $4 in ('transient_failure','rate_limited','restricted','connector_incompatible') then $6 else last_failure_code end,
      updated_at = now()
    where tenant_id = $1 and id = $2
  `, [input.tenantId, input.identityId, next, input.event, cooldownMinutes, input.providerCode ?? null]);
  const type = eventType[input.event];
  if (type) await recordGrowthEvent({ tenantId: input.tenantId, brandId: row.brand_id, identityId: input.identityId,
    eventType: type, channelKey: row.channel_key, outcome: next, failureReason: input.reason,
    rawEvent: input.rawEvent, idempotencyKey: input.idempotencyKey ?? `identity-health:${input.identityId}:${input.event}:${input.providerCode ?? "none"}:${Date.now()}` });
  return next;
}
