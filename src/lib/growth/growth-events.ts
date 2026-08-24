import { queryPostgres } from "@/lib/db/postgres";

export type GrowthEventType =
  | "growth_objective_created" | "community_discovered" | "community_evaluated" | "community_rule_detected"
  | "opportunity_detected" | "opportunity_scored" | "content_generated" | "content_approved" | "content_rejected"
  | "publish_queued" | "publish_attempted" | "publish_succeeded" | "publish_failed" | "post_removed" | "admin_rejected"
  | "comment_sent" | "reply_sent" | "inbound_engagement" | "inbound_message" | "lead_created" | "lead_linked"
  | "owner_approval_requested" | "owner_approved" | "owner_rejected" | "owner_modified"
  | "connector_warning" | "connector_failure" | "verification_detected" | "restriction_detected"
  | "identity_throttled" | "identity_paused" | "cooldown_started" | "cooldown_completed"
  | "conversation_started" | "estimate_created" | "job_created" | "customer_won" | "revenue_attributed";

export type GrowthEventInput = {
  tenantId: string;
  brandId?: string | null;
  objectiveId?: string | null;
  identityId?: string | null;
  communityId?: string | null;
  opportunityId?: string | null;
  actionAttemptId?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  eventType: GrowthEventType;
  channelKey?: string | null;
  contentReference?: string | null;
  campaignReference?: string | null;
  actionType?: string | null;
  automationMode?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  strategyVersion?: string | null;
  promptVersion?: string | null;
  outcome?: string | null;
  failureReason?: string | null;
  ownerIntervention?: string | null;
  attribution?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
  rawEvent?: Record<string, unknown>;
  idempotencyKey?: string | null;
  occurredAt?: string | null;
};

export async function recordGrowthEvent(input: GrowthEventInput) {
  const result = await queryPostgres<{ id: string }>(`
    insert into public.growth_events (
      tenant_id, brand_id, objective_id, identity_id, community_id, opportunity_id, action_attempt_id,
      conversation_id, lead_id, customer_id, event_type, channel_key, content_reference, campaign_reference,
      action_type, automation_mode, model_provider, model_name, strategy_version, prompt_version, outcome,
      failure_reason, owner_intervention, attribution_json, dimensions_json, raw_event_json, idempotency_key, occurred_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
      $24::jsonb,$25::jsonb,$26::jsonb,$27,coalesce($28::timestamptz,now())
    ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
    returning id
  `, [
    input.tenantId, input.brandId ?? null, input.objectiveId ?? null, input.identityId ?? null, input.communityId ?? null,
    input.opportunityId ?? null, input.actionAttemptId ?? null, input.conversationId ?? null, input.leadId ?? null,
    input.customerId ?? null, input.eventType, input.channelKey ?? null, input.contentReference ?? null,
    input.campaignReference ?? null, input.actionType ?? null, input.automationMode ?? null, input.modelProvider ?? null,
    input.modelName ?? null, input.strategyVersion ?? null, input.promptVersion ?? null, input.outcome ?? null,
    input.failureReason ?? null, input.ownerIntervention ?? null, JSON.stringify(input.attribution ?? {}),
    JSON.stringify(input.dimensions ?? {}), JSON.stringify(input.rawEvent ?? {}), input.idempotencyKey ?? null, input.occurredAt ?? null
  ]);
  return result?.rows[0]?.id ?? null;
}
