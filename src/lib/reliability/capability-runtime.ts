import { queryPostgres } from "@/lib/db/postgres";
import {
  assertCapabilityActionTransition,
  authorizeCapabilityExecution,
  classifyProviderFailure,
  evaluateCapabilityReadiness,
  nextCircuitState,
  recommendTrustChange,
  type CapabilityActionState,
  type CapabilityDependency,
  type CapabilityHealthState,
  type CapabilityTrustLevel,
  type FailureReasonCategory
} from "./capability-trust";

type ProfileRow = {
  capability_key: string;
  display_name: string;
  trust_level: CapabilityTrustLevel;
  recommended_trust_level: CapabilityTrustLevel;
  health_state: CapabilityHealthState;
  enforcement_mode: "observe" | "enforce";
  emergency_paused: boolean;
  verified_successes: number;
  failures: number;
  meaningful_corrections: number;
};

type DependencyRow = {
  dependency_type: CapabilityDependency["dependencyType"];
  dependency_key: string;
  required: boolean;
  health_state: CapabilityHealthState;
  reason: string | null;
};

export function capabilityForQueuedAction(input: { actionType: string; targetType?: string | null; workflowType?: string | null }) {
  if (input.actionType === "voice_call") return "ai_calling";
  if (input.targetType === "review_request_workflow" || input.actionType === "review_request") return "review_requests";
  if (input.targetType === "service_invoice" || input.workflowType === "invoice_followup" || input.actionType === "billing_sync") return "payment_collection";
  if (input.targetType === "estimate" || input.workflowType === "estimate_followup") return "estimate_follow_up";
  if (input.actionType === "calendar_sync") return "appointment_scheduling";
  if (input.actionType === "sms_send") return "sms_follow_up";
  if (input.actionType === "email_send") return "email_follow_up";
  if (input.actionType === "publish_content") return "growth_distribution";
  return "workflow_execution";
}

function dependencyFromRow(row: DependencyRow): CapabilityDependency {
  return {
    dependencyType: row.dependency_type,
    dependencyKey: row.dependency_key,
    required: row.required,
    health: row.health_state,
    reason: row.reason
  };
}

function providerAliases(providerKey: string) {
  const aliases = new Set([providerKey]);
  if (providerKey === "resend_shared") aliases.add("resend_email");
  if (providerKey === "resend_email") aliases.add("resend_shared");
  if (providerKey === "twilio_shared") aliases.add("twilio_sms");
  if (providerKey === "twilio_sms") aliases.add("twilio_shared");
  return [...aliases];
}

async function selectedProviderDependency(tenantId: string, capabilityKey: string, providerKey?: string | null): Promise<CapabilityDependency | null> {
  if (!providerKey) return null;
  if (["manual_sms", "manual_phone", "copy_message"].includes(providerKey)) {
    return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "healthy", reason: "This route requires a person to complete the action." };
  }
  const aliases = providerAliases(providerKey);
  const result = await queryPostgres<{
    source: "messaging" | "account" | "lane";
    connection_status: string;
    credentials_status: string;
    live_enabled: boolean;
    outbound_enabled: boolean;
    emergency_paused: boolean;
    reason: string | null;
    circuit_state: string | null;
    circuit_reason: string | null;
  }>(
    `with candidates as (
       select 'messaging'::text as source, connection_status, credentials_status,
         live_sending_enabled as live_enabled, outbound_enabled, emergency_paused,
         null::text as reason, 0 as priority, updated_at
       from public.tenant_messaging_accounts
       where tenant_id=$1 and provider_key=any($3::text[])
       union all
       select 'account', status, credentials_status, live_actions_enabled, live_actions_enabled,
         false, null::text, 1, updated_at
       from public.provider_accounts
       where tenant_id=$1 and provider_key=any($3::text[])
       union all
       select 'lane', connection_status, credentials_status, live_actions_enabled, live_actions_enabled,
         false, plain_language_status, 2, updated_at
       from public.provider_connection_lanes
       where tenant_id=$1 and provider_key=any($3::text[])
     )
     select candidates.*,
       (select state from public.capability_circuit_breakers
        where tenant_id=$1 and capability_key=$2 and scope_type='provider' and scope_key=any($3::text[])
        order by updated_at desc limit 1) as circuit_state,
       (select reason from public.capability_circuit_breakers
        where tenant_id=$1 and capability_key=$2 and scope_type='provider' and scope_key=any($3::text[])
        order by updated_at desc limit 1) as circuit_reason
     from candidates order by priority, updated_at desc limit 1`,
    [tenantId, capabilityKey, aliases]
  );
  const candidate = result?.rows[0];
  if (candidate?.circuit_state === "open") {
    return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "unavailable", reason: candidate.circuit_reason || "The provider circuit breaker is open." };
  }
  if (candidate) {
    if (candidate.emergency_paused || candidate.connection_status === "blocked") return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "suspended", reason: candidate.reason || "The selected provider route is paused for safety." };
    if (["expired", "revoked", "invalid"].includes(candidate.credentials_status)) return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "verification_required", reason: candidate.reason || "Provider credentials must be renewed." };
    if (["paused"].includes(candidate.connection_status)) return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "unavailable", reason: candidate.reason || "The selected provider is paused." };
    if (["error", "needs_attention"].includes(candidate.connection_status)) return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "degraded", reason: candidate.reason || "The selected provider needs attention." };
    const connected = candidate.source === "messaging"
      ? ["active", "configured"].includes(candidate.connection_status)
      : candidate.source === "account"
        ? candidate.connection_status === "connected"
        : ["connected", "available"].includes(candidate.connection_status);
    if (connected && candidate.live_enabled && candidate.outbound_enabled) return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "healthy", reason: candidate.reason };
    return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "configuration_required", reason: candidate.reason || "The selected provider is not enabled for live outbound actions." };
  }
  return { dependencyType: "provider", dependencyKey: providerKey, required: true, health: "configuration_required", reason: "The selected provider is not configured for this workspace." };
}

export async function getCapabilityTrustStatus(tenantId: string, capabilityKey: string) {
  const [profileResult, dependenciesResult] = await Promise.all([
    queryPostgres<ProfileRow>(
      `select capability_key, display_name, trust_level, recommended_trust_level, health_state,
        enforcement_mode, emergency_paused, verified_successes, failures, meaningful_corrections
       from public.capability_trust_profiles where tenant_id=$1 and capability_key=$2 limit 1`,
      [tenantId, capabilityKey]
    ),
    queryPostgres<DependencyRow>(
      `select dependency_type, dependency_key, required, health_state, reason
       from public.capability_dependencies where tenant_id=$1 and capability_key=$2
       order by required desc, dependency_type, dependency_key`,
      [tenantId, capabilityKey]
    )
  ]);
  const profile = profileResult?.rows[0] ?? null;
  const dependencies = (dependenciesResult?.rows ?? []).map(dependencyFromRow);
  return { profile, dependencies, readiness: evaluateCapabilityReadiness(dependencies) };
}

export type CapabilityTrustOverviewItem = {
  capabilityKey: string;
  displayName: string;
  trustLevel: CapabilityTrustLevel;
  recommendedTrustLevel: CapabilityTrustLevel;
  healthState: CapabilityHealthState;
  enforcementMode: "observe" | "enforce";
  emergencyPaused: boolean;
  blockerCount: number;
  lastFailureAt: Date | null;
  lastRegressionReason: string | null;
};

export async function getTenantCapabilityTrustOverview(tenantId: string): Promise<CapabilityTrustOverviewItem[]> {
  const result = await queryPostgres<{
    capability_key: string;
    display_name: string;
    trust_level: CapabilityTrustLevel;
    recommended_trust_level: CapabilityTrustLevel;
    health_state: CapabilityHealthState;
    enforcement_mode: "observe" | "enforce";
    emergency_paused: boolean;
    blocker_count: string;
    last_failure_at: Date | null;
    last_regression_reason: string | null;
  }>(
    `select p.capability_key, p.display_name, p.trust_level, p.recommended_trust_level,
       p.health_state, p.enforcement_mode, p.emergency_paused, p.last_failure_at,
       p.last_regression_reason,
       count(d.id) filter (where d.required and d.health_state <> 'healthy')::text as blocker_count
     from public.capability_trust_profiles p
     left join public.capability_dependencies d
       on d.tenant_id=p.tenant_id and d.capability_key=p.capability_key
     where p.tenant_id=$1 and p.intended_enabled=true
     group by p.id
     order by case p.health_state when 'suspended' then 0 when 'verification_required' then 1
       when 'configuration_required' then 2 when 'unavailable' then 3 when 'degraded' then 4
       when 'unknown' then 5 else 6 end, p.display_name`,
    [tenantId]
  );
  return (result?.rows ?? []).map((row) => ({
    capabilityKey: row.capability_key,
    displayName: row.display_name,
    trustLevel: row.trust_level,
    recommendedTrustLevel: row.recommended_trust_level,
    healthState: row.health_state,
    enforcementMode: row.enforcement_mode,
    emergencyPaused: row.emergency_paused,
    blockerCount: Number(row.blocker_count ?? 0),
    lastFailureAt: row.last_failure_at,
    lastRegressionReason: row.last_regression_reason
  }));
}

export type CapabilityReliabilityMetrics = {
  actions: number;
  verifiedSuccesses: number;
  failures: number;
  blocked: number;
  delayedOrUnknown: number;
  retries: number;
  fallbacks: number;
  ownerCorrections: number;
  successRate: number;
  providerFailureRate: number;
};

export async function getTenantCapabilityReliabilityMetrics(tenantId: string): Promise<CapabilityReliabilityMetrics> {
  const result = await queryPostgres<{
    actions: string;
    verified_successes: string;
    failures: string;
    blocked: string;
    delayed_unknown: string;
    retries: string;
    fallbacks: string;
    owner_corrections: string;
  }>(
    `select
       count(a.id)::text as actions,
       count(a.id) filter (where a.state in ('delivered','confirmed','completed'))::text as verified_successes,
       count(a.id) filter (where a.state='failed')::text as failures,
       count(a.id) filter (where a.state='blocked')::text as blocked,
       count(a.id) filter (where a.state in ('delayed','unknown','needs_attention'))::text as delayed_unknown,
       coalesce(sum(a.retry_count),0)::text as retries,
       coalesce(sum(a.fallback_count),0)::text as fallbacks,
       coalesce((select sum(p.meaningful_corrections) from public.capability_trust_profiles p where p.tenant_id=$1),0)::text as owner_corrections
     from public.capability_execution_audits a
     where a.tenant_id=$1 and a.created_at >= now() - interval '30 days'`,
    [tenantId]
  );
  const row = result?.rows[0];
  const actions = Number(row?.actions ?? 0);
  const verifiedSuccesses = Number(row?.verified_successes ?? 0);
  const failures = Number(row?.failures ?? 0);
  return {
    actions,
    verifiedSuccesses,
    failures,
    blocked: Number(row?.blocked ?? 0),
    delayedOrUnknown: Number(row?.delayed_unknown ?? 0),
    retries: Number(row?.retries ?? 0),
    fallbacks: Number(row?.fallbacks ?? 0),
    ownerCorrections: Number(row?.owner_corrections ?? 0),
    successRate: actions ? Math.round((verifiedSuccesses / actions) * 1000) / 10 : 0,
    providerFailureRate: actions ? Math.round((failures / actions) * 1000) / 10 : 0
  };
}

export async function beginCapabilityExecution(input: {
  tenantId: string;
  capabilityKey: string;
  idempotencyKey: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  providerKey?: string | null;
  humanApproved: boolean;
  policyAllowsAutomatic: boolean;
  consequential: boolean;
  initiatorType?: "human" | "ai" | "automation" | "provider" | "system";
  requestedByUserId?: string | null;
  confirmationRequired?: boolean;
  retryCount?: number;
  expectedEventType?: string | null;
  expectedEventAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const status = await getCapabilityTrustStatus(input.tenantId, input.capabilityKey);
  const selectedProvider = await selectedProviderDependency(input.tenantId, input.capabilityKey, input.providerKey);
  const dependencies = selectedProvider ? [...status.dependencies, selectedProvider] : status.dependencies;
  const readiness = evaluateCapabilityReadiness(dependencies);
  const authorization = status.profile
    ? authorizeCapabilityExecution({
        trustLevel: status.profile.trust_level,
        readiness,
        humanApproved: input.humanApproved,
        policyAllowsAutomatic: input.policyAllowsAutomatic,
        consequential: input.consequential,
        emergencyPaused: status.profile.emergency_paused
      })
    : { allowed: false as const, reason: "Capability trust has not been configured." };
  const enforced = status.profile?.enforcement_mode === "enforce";
  const shouldProceed = authorization.allowed || !enforced;
  const initialState: CapabilityActionState = shouldProceed ? "queued" : "blocked";
  const authorizationBasis = authorization.allowed
    ? authorization.basis
    : status.profile ? "system_observation" : "none";
  const result = await queryPostgres<{ id: string }>(
    `insert into public.capability_execution_audits (
       tenant_id, capability_key, source_table, source_id, idempotency_key, state,
       provider_key, authorization_basis, initiator_type, requested_by_user_id,
       consequential, confirmation_required, retry_count,
       dependency_snapshot_json, expected_event_type, expected_event_at, queued_at,
       last_error, metadata_json
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19::jsonb)
     on conflict (tenant_id, idempotency_key) do update set
       dependency_snapshot_json=excluded.dependency_snapshot_json,
       provider_key=coalesce(excluded.provider_key, public.capability_execution_audits.provider_key),
       retry_count=greatest(public.capability_execution_audits.retry_count, excluded.retry_count),
       metadata_json=public.capability_execution_audits.metadata_json || excluded.metadata_json,
       updated_at=now()
     returning id`,
    [
      input.tenantId,
      input.capabilityKey,
      input.sourceTable ?? null,
      input.sourceId ?? null,
      input.idempotencyKey,
      initialState,
      input.providerKey ?? null,
      authorizationBasis,
      input.initiatorType ?? "system",
      input.requestedByUserId ?? null,
      input.consequential,
      Boolean(input.confirmationRequired),
      Math.max(0, input.retryCount ?? 0),
      JSON.stringify(dependencies),
      input.expectedEventType ?? null,
      input.expectedEventAt?.toISOString() ?? null,
      shouldProceed ? new Date().toISOString() : null,
      authorization.allowed ? null : authorization.reason,
      JSON.stringify({ ...(input.metadata ?? {}), enforcementMode: status.profile?.enforcement_mode ?? "missing", wouldBlock: !authorization.allowed })
    ]
  );
  return {
    auditId: result?.rows[0]?.id ?? null,
    shouldProceed,
    enforced,
    authorization,
    readiness,
    trustLevel: status.profile?.trust_level ?? "unverified"
  };
}

export async function syncCapabilityTrustHealthForTenant(tenantId: string) {
  await queryPostgres(
    `update public.capability_dependencies d set
       health_state=case
         when lane.connection_status='blocked' then 'suspended'
         when lane.credentials_status in ('expired','revoked') then 'verification_required'
         when lane.connection_status='needs_attention' then 'degraded'
         when lane.connection_status='paused' then 'unavailable'
         when lane.connection_status in ('connected','available') and lane.live_actions_enabled then 'healthy'
         when lane.credentials_status='not_configured' then 'configuration_required'
         else 'unknown'
       end,
       reason=lane.plain_language_status, last_checked_at=now(), updated_at=now()
     from public.provider_connection_lanes lane
     where d.tenant_id=$1 and d.tenant_id=lane.tenant_id
       and d.source_table='provider_connection_lanes' and d.source_id=lane.id`,
    [tenantId]
  );
  const profilesResult = await queryPostgres<{ capability_key: string; trust_level: CapabilityTrustLevel; verified_successes: number; failures: number; meaningful_corrections: number }>(
    `select capability_key, trust_level, verified_successes, failures, meaningful_corrections
     from public.capability_trust_profiles where tenant_id=$1 and intended_enabled=true`,
    [tenantId]
  );
  let regressed = 0;
  for (const profile of profilesResult?.rows ?? []) {
    const status = await getCapabilityTrustStatus(tenantId, profile.capability_key);
    const recommendation = recommendTrustChange({
      current: profile.trust_level,
      health: status.readiness.health,
      verifiedSuccesses: profile.verified_successes,
      failures: profile.failures,
      meaningfulCorrections: profile.meaningful_corrections
    });
    await queryPostgres(
      `update public.capability_trust_profiles set health_state=$3,
         recommended_trust_level=$4, last_health_check_at=now(), updated_at=now()
       where tenant_id=$1 and capability_key=$2`,
      [tenantId, profile.capability_key, status.readiness.health, recommendation.recommendedLevel]
    );
    if (recommendation.direction === "regress" && recommendation.automatic && recommendation.recommendedLevel !== profile.trust_level) {
      await regressCapabilityTrust(tenantId, profile.capability_key, recommendation.recommendedLevel, `dependency health is ${status.readiness.health}`);
      regressed += 1;
    }
  }
  return { checked: profilesResult?.rows.length ?? 0, regressed };
}

export async function recordCapabilityExecutionState(input: {
  tenantId: string;
  auditId?: string | null;
  idempotencyKey?: string | null;
  state: CapabilityActionState;
  providerEvidence?: Record<string, unknown> | null;
  outcomeEvidence?: Record<string, unknown> | null;
  failureCategory?: FailureReasonCategory | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  fallbackIncrement?: number;
}) {
  const currentResult = await queryPostgres<{ id: string; capability_key: string; state: CapabilityActionState; confirmation_required: boolean }>(
    `select id, capability_key, state, confirmation_required from public.capability_execution_audits
     where tenant_id=$1 and (($2::uuid is not null and id=$2) or ($3::text is not null and idempotency_key=$3))
     order by created_at desc limit 1`,
    [input.tenantId, input.auditId ?? null, input.idempotencyKey ?? null]
  );
  const current = currentResult?.rows[0];
  if (!current) return { updated: false, reason: "Execution audit was not found." };
  const transition = assertCapabilityActionTransition({
    from: current.state,
    to: input.state,
    providerEvidence: Boolean(input.providerEvidence && Object.keys(input.providerEvidence).length),
    completionEvidence: Boolean(input.outcomeEvidence && Object.keys(input.outcomeEvidence).length),
    confirmationRequired: current.confirmation_required
  });
  if (!transition.allowed) return { updated: false, reason: transition.reason };
  await queryPostgres(
    `update public.capability_execution_audits set
       state=$3,
       attempt_count=attempt_count + case when $3='attempted' and state <> 'attempted' then 1 else 0 end,
       provider_evidence_json=provider_evidence_json || $4::jsonb,
       outcome_evidence_json=outcome_evidence_json || $5::jsonb,
       failure_category=coalesce($6,failure_category), last_error=$7,
       attempted_at=case when $3='attempted' then now() else attempted_at end,
       provider_accepted_at=case when $3='provider_accepted' then now() else provider_accepted_at end,
       delivered_at=case when $3='delivered' then now() else delivered_at end,
       confirmed_at=case when $3='confirmed' then now() else confirmed_at end,
       completed_at=case when $3='completed' then now() else completed_at end,
       failed_at=case when $3='failed' then now() else failed_at end,
       fallback_count=fallback_count + $8,
       metadata_json=metadata_json || $9::jsonb, updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, current.id, input.state, JSON.stringify(input.providerEvidence ?? {}), JSON.stringify(input.outcomeEvidence ?? {}), input.failureCategory ?? null, input.error ?? null, Math.max(0, input.fallbackIncrement ?? 0), JSON.stringify(input.metadata ?? {})]
  );
  const verifiedSuccessTransition = input.state === "delivered" || (input.state === "completed" && current.state !== "delivered");
  if (current.state !== input.state && (verifiedSuccessTransition || input.state === "failed")) {
    const profileResult = await queryPostgres<ProfileRow>(
      `update public.capability_trust_profiles set
         verified_successes=verified_successes + case when $3 in ('delivered','completed') then 1 else 0 end,
         failures=failures + case when $3='failed' then 1 else 0 end,
         last_success_at=case when $3 in ('delivered','completed') then now() else last_success_at end,
         last_failure_at=case when $3='failed' then now() else last_failure_at end,
         updated_at=now()
       where tenant_id=$1 and capability_key=$2
       returning capability_key, display_name, trust_level, recommended_trust_level, health_state,
         enforcement_mode, emergency_paused, verified_successes, failures, meaningful_corrections`,
      [input.tenantId, current.capability_key, input.state]
    );
    const profile = profileResult?.rows[0];
    if (profile) {
      const recommendation = recommendTrustChange({
        current: profile.trust_level,
        health: profile.health_state,
        verifiedSuccesses: profile.verified_successes,
        failures: profile.failures,
        meaningfulCorrections: profile.meaningful_corrections
      });
      if (recommendation.direction === "regress" && recommendation.automatic && recommendation.recommendedLevel !== profile.trust_level) {
        await regressCapabilityTrust(input.tenantId, current.capability_key, recommendation.recommendedLevel, input.error ?? `execution entered ${input.state}`);
      } else {
        await queryPostgres(
          `update public.capability_trust_profiles set recommended_trust_level=$3, updated_at=now()
           where tenant_id=$1 and capability_key=$2`,
          [input.tenantId, current.capability_key, recommendation.recommendedLevel]
        );
      }
    }
  }
  return { updated: true, auditId: current.id };
}

export async function recordCapabilityProviderResult(input: {
  tenantId: string;
  auditId: string | null;
  providerKey: string;
  ok: boolean;
  providerReference?: string | null;
  retryable?: boolean;
  status?: number;
  blockedBy?: string | null;
  error?: string | null;
}) {
  if (!input.auditId) return { updated: false, reason: "Execution audit was not created." };
  await recordCapabilityExecutionState({ tenantId: input.tenantId, auditId: input.auditId, state: "attempted" });
  if (input.ok) {
    return recordCapabilityExecutionState({
      tenantId: input.tenantId,
      auditId: input.auditId,
      state: "provider_accepted",
      providerEvidence: { providerKey: input.providerKey, providerReference: input.providerReference ?? null }
    });
  }
  const failureCategory = classifyProviderFailure(input);
  return recordCapabilityExecutionState({
    tenantId: input.tenantId,
    auditId: input.auditId,
    state: input.blockedBy ? "blocked" : "failed",
    failureCategory,
    error: input.error ?? "Provider action failed.",
    metadata: { retryable: Boolean(input.retryable), providerKey: input.providerKey }
  });
}

export async function recordCapabilityDeliveryEvidence(input: {
  tenantId: string;
  providerKey: string;
  providerReference: string;
  state: "delivered" | "confirmed" | "completed" | "failed" | "unknown";
  evidence: Record<string, unknown>;
  error?: string | null;
}) {
  const result = await queryPostgres<{ id: string }>(
    `select id from public.capability_execution_audits
     where tenant_id=$1 and provider_key=$2
       and provider_evidence_json->>'providerReference'=$3
     order by created_at desc limit 1`,
    [input.tenantId, input.providerKey, input.providerReference]
  );
  const id = result?.rows[0]?.id;
  if (!id) return { updated: false, reason: "No matching capability execution was found." };
  return recordCapabilityExecutionState({
    tenantId: input.tenantId,
    auditId: id,
    state: input.state,
    providerEvidence: input.state === "completed" ? null : input.evidence,
    outcomeEvidence: input.state === "completed" ? input.evidence : null,
    error: input.error ?? null
  });
}

export async function recordCapabilityCorrection(input: { tenantId: string; capabilityKey: string; meaningful: boolean; reason: string; userId?: string | null }) {
  if (!input.meaningful) return { recorded: false };
  const result = await queryPostgres<ProfileRow>(
    `update public.capability_trust_profiles set meaningful_corrections=meaningful_corrections+1,
       last_correction_at=now(), metadata_json=metadata_json || $3::jsonb, updated_at=now()
     where tenant_id=$1 and capability_key=$2
     returning capability_key, display_name, trust_level, recommended_trust_level, health_state,
       enforcement_mode, emergency_paused, verified_successes, failures, meaningful_corrections`,
    [input.tenantId, input.capabilityKey, JSON.stringify({ lastCorrectionReason: input.reason, lastCorrectedBy: input.userId ?? null })]
  );
  const profile = result?.rows[0];
  if (!profile) return { recorded: false };
  const recommendation = recommendTrustChange({
    current: profile.trust_level,
    health: profile.health_state,
    verifiedSuccesses: profile.verified_successes,
    failures: profile.failures,
    meaningfulCorrections: profile.meaningful_corrections
  });
  if (recommendation.direction === "regress" && recommendation.automatic) {
    await regressCapabilityTrust(input.tenantId, input.capabilityKey, recommendation.recommendedLevel, input.reason);
  }
  return { recorded: true, recommendation };
}

async function regressCapabilityTrust(tenantId: string, capabilityKey: string, nextLevel: CapabilityTrustLevel, reason: string) {
  const updateResult = await queryPostgres<{ trust_level: CapabilityTrustLevel }>(
    `update public.capability_trust_profiles set trust_level=$3, recommended_trust_level=$3,
       last_regressed_at=now(), last_regression_reason=$4, updated_at=now()
     where tenant_id=$1 and capability_key=$2
       and array_position(array['unverified','observing','assisted','trusted','autonomous']::text[], trust_level)
         > array_position(array['unverified','observing','assisted','trusted','autonomous']::text[], $3)
     returning trust_level`,
    [tenantId, capabilityKey, nextLevel, reason]
  );
  if (!updateResult?.rows[0]) return;
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
       severity, status, owner_attention, ai_handled, recommended_action, action_href,
       risk_type, confidence_score, metadata_json
     ) values ($1,'ferocity','Ferocity',$2,'capability.trust_regressed','Automation trust was reduced',$3,
       'high','needs_owner',true,false,'Review recent failures or corrections before restoring trust.',
       '/app/owner-command-center','automation',95,$4::jsonb)
     on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
     do update set summary=excluded.summary, severity='high', status='needs_owner', owner_attention=true,
       occurred_at=now(), metadata_json=public.owner_command_events.metadata_json || excluded.metadata_json, updated_at=now()`,
    [tenantId, `capability-regression:${capabilityKey}`, `${capabilityKey.replaceAll("_", " ")} was returned to ${nextLevel} because ${reason}`, JSON.stringify({ capabilityKey, nextLevel, reason })]
  );
}

export async function recordCapabilityCircuitResult(input: {
  tenantId: string;
  capabilityKey: string;
  scopeType: "provider" | "integration" | "workflow" | "capability";
  scopeKey: string;
  success: boolean;
  reason?: string | null;
}) {
  const existingResult = await queryPostgres<{ state: "closed" | "open" | "half_open"; consecutive_failures: number; failure_threshold: number }>(
    `select state, consecutive_failures, failure_threshold from public.capability_circuit_breakers
     where tenant_id=$1 and capability_key=$2 and scope_type=$3 and scope_key=$4 limit 1`,
    [input.tenantId, input.capabilityKey, input.scopeType, input.scopeKey]
  );
  const existing = existingResult?.rows[0] ?? { state: "closed" as const, consecutive_failures: 0, failure_threshold: 3 };
  const next = nextCircuitState({
    state: existing.state,
    event: input.success ? "success" : "failure",
    consecutiveFailures: existing.consecutive_failures,
    failureThreshold: existing.failure_threshold
  });
  await queryPostgres(
    `insert into public.capability_circuit_breakers (
       tenant_id, capability_key, scope_type, scope_key, state, consecutive_failures,
       opened_at, next_probe_at, last_failure_at, last_success_at, reason
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (tenant_id, capability_key, scope_type, scope_key) do update set
       state=excluded.state, consecutive_failures=excluded.consecutive_failures,
       opened_at=case when excluded.state='open' then coalesce(public.capability_circuit_breakers.opened_at,now()) else null end,
       next_probe_at=excluded.next_probe_at, last_failure_at=coalesce(excluded.last_failure_at,public.capability_circuit_breakers.last_failure_at),
       last_success_at=coalesce(excluded.last_success_at,public.capability_circuit_breakers.last_success_at),
       reason=excluded.reason, updated_at=now()`,
    [
      input.tenantId, input.capabilityKey, input.scopeType, input.scopeKey, next.state,
      input.success ? 0 : existing.consecutive_failures + 1,
      next.state === "open" ? new Date().toISOString() : null,
      next.state === "open" ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
      input.success ? null : new Date().toISOString(), input.success ? new Date().toISOString() : null,
      input.success ? null : input.reason ?? "Repeated provider failure"
    ]
  );
  if (next.state === "open") await regressCapabilityTrust(input.tenantId, input.capabilityKey, "assisted", input.reason ?? "the circuit breaker opened");
  return next;
}

export async function runCapabilityReliabilityWatchdog(input: { tenantId?: string | null; limit?: number } = {}) {
  const overdueResult = await queryPostgres<{ id: string; tenant_id: string; capability_key: string; state: CapabilityActionState; expected_event_type: string | null }>(
    `select id, tenant_id, capability_key, state, expected_event_type
     from public.capability_execution_audits
     where state in ('attempted','provider_accepted','delayed','unknown')
       and expected_event_at is not null and expected_event_at < now()
       and ($1::uuid is null or tenant_id=$1)
     order by expected_event_at asc limit $2`,
    [input.tenantId ?? null, input.limit ?? 100]
  );
  for (const row of overdueResult?.rows ?? []) {
    const nextState: CapabilityActionState = row.state === "delayed" || row.state === "unknown" ? "needs_attention" : "delayed";
    await recordCapabilityExecutionState({
      tenantId: row.tenant_id,
      auditId: row.id,
      state: nextState,
      error: `Expected ${row.expected_event_type ?? "completion evidence"} did not arrive on time.`,
      metadata: { watchdogCheckedAt: new Date().toISOString() }
    });
    if (nextState === "needs_attention") {
      await queryPostgres(
        `insert into public.owner_command_events (
           tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
           severity, status, owner_attention, ai_handled, recommended_action, action_href,
           risk_type, confidence_score, metadata_json
         ) values ($1,'ferocity','Ferocity',$2,'capability.expected_event_missing','An expected result did not arrive',$3,
           'high','needs_owner',true,false,'Review the action and retry only after checking provider evidence.',
           '/app/automation-timeline','automation',96,$4::jsonb)
         on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
         do update set summary=excluded.summary,status='needs_owner',owner_attention=true,occurred_at=now(),updated_at=now()`,
        [row.tenant_id, `capability-watchdog:${row.id}`, `${row.capability_key.replaceAll("_", " ")} is missing ${row.expected_event_type ?? "completion evidence"}.`, JSON.stringify({ auditId: row.id, capabilityKey: row.capability_key })]
      );
    }
  }
  return { checked: overdueResult?.rows.length ?? 0 };
}
