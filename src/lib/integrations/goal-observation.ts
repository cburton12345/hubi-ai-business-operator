import { queryPostgres } from "@/lib/db/postgres";
import { safeLogAppError } from "@/lib/observability/log-error";
import { mapGoalIntegrationHealth } from "@/lib/operations/goal-integration-health";
import {
  addOperatingGoalDependency,
  createOperatingGoal,
  recordOperatingGoalObservation,
  recordOperatingGoalOutcome,
} from "@/lib/operations/goal-engine";

export type IntegrationGoalObservation = {
  tenantId: string;
  platformKey: string;
  platformName: string;
  ownerEventId?: string | null;
  externalEventId?: string | null;
  eventType: string;
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status?: "open" | "needs_owner" | "critical" | "ai_handled" | "watching" | "resolved" | "archived";
  ownerAttention?: boolean;
  occurredAt?: string | null;
  riskType?: string | null;
  moneyCents?: number;
  recommendedAction?: string | null;
  metadata: Record<string, unknown>;
};

export type IntegrationGoalClassification = {
  goalType: string;
  desiredOutcome: string;
};

export type IntegrationGoalIdentity = {
  workspaceId: string | null;
  entityType: string;
  entityId: string;
  goalKey: string;
};

type ObservationOverrides = {
  classification?: IntegrationGoalClassification;
  identity?: IntegrationGoalIdentity;
  completionRules?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
};

function text(value: unknown, max = 240) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function slug(value: string, fallback: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function metadataValue(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(metadata[key]);
    if (value) return value;
  }
  return null;
}

export function classifyIntegrationGoal(
  input: Pick<IntegrationGoalObservation, "eventType" | "title" | "summary" | "metadata">,
): IntegrationGoalClassification {
  const context = `${input.eventType} ${input.title} ${input.summary} ${JSON.stringify(input.metadata)}`.toLowerCase();
  if (/(invoice|payment|payout|charge|deposit|balance|collection|past.?due|refund|dispute)/.test(context)) {
    return { goalType: "financial_outcome", desiredOutcome: "Resolve the financial exception and verify the authoritative payment or accounting record reflects the outcome." };
  }
  if (/(lead|estimate|quote|proposal|opportunit|sale|booking|conversion)/.test(context)) {
    return { goalType: "revenue_outcome", desiredOutcome: "Advance the opportunity to a verified next outcome while preserving consent, pricing, and approval controls." };
  }
  if (/(job|work.?order|dispatch|appointment|schedule|service|project|maintenance|repair)/.test(context)) {
    return { goalType: "service_outcome", desiredOutcome: "Advance the work to a verified operational outcome in the authoritative service system." };
  }
  if (/(message|email|sms|call|voicemail|conversation|delivery|reply|response)/.test(context)) {
    return { goalType: "communication_outcome", desiredOutcome: "Reach a verified communication outcome without treating provider acceptance as delivery or response." };
  }
  if (/(review|reputation|rating|complaint|feedback)/.test(context)) {
    return { goalType: "reputation_outcome", desiredOutcome: "Resolve the customer or reputation issue through an authorized, policy-compliant response and verify the result." };
  }
  if (/(campaign|advert|content|publish|traffic|seo|listing|profile)/.test(context)) {
    return { goalType: "growth_outcome", desiredOutcome: "Advance the growth work to a measurable, provider-verified outcome without bypassing approval or spend controls." };
  }
  if (/(credential|oauth|connection|integration|webhook|sync|provider|offline|expired|revoked)/.test(context)) {
    return { goalType: "integration_recovery", desiredOutcome: "Restore and verify the connected system without weakening its credential, approval, or execution controls." };
  }
  return { goalType: "integration_exception_resolution", desiredOutcome: "Resolve the connected-system exception and verify the authoritative system reflects the intended outcome." };
}

const ENTITY_CANDIDATES: Array<[string, string[]]> = [
  ["invoice", ["invoiceId", "invoice_id", "paymentIntentId", "payment_intent_id"]],
  ["payment", ["paymentId", "payment_id", "chargeId", "charge_id", "payoutId", "payout_id"]],
  ["job", ["jobId", "job_id", "workOrderId", "work_order_id", "projectId", "project_id"]],
  ["appointment", ["appointmentId", "appointment_id", "eventId", "event_id"]],
  ["lead", ["leadId", "lead_id", "opportunityId", "opportunity_id"]],
  ["customer", ["customerId", "customer_id", "contactId", "contact_id"]],
  ["conversation", ["conversationId", "conversation_id", "threadId", "thread_id", "messageId", "message_id"]],
  ["call", ["callId", "call_id", "providerCallId", "provider_call_id"]],
  ["campaign", ["campaignId", "campaign_id", "adAccountId", "ad_account_id"]],
  ["review", ["reviewId", "review_id"]],
  ["device", ["deviceId", "device_id"]],
  ["connection", ["connectionId", "connection_id", "providerAccountId", "provider_account_id"]],
];

export function integrationGoalIdentity(event: IntegrationGoalObservation): IntegrationGoalIdentity {
  const platformKey = slug(event.platformKey, "integration");
  const workspaceId = metadataValue(event.metadata, ["sourceWorkspaceId", "workspaceId", "workspace_id", "accountId", "account_id"]);
  for (const [entityType, keys] of ENTITY_CANDIDATES) {
    const entityId = metadataValue(event.metadata, keys);
    if (entityId) {
      return {
        workspaceId,
        entityType,
        entityId,
        goalKey: `${platformKey}:${workspaceId ?? "workspace-default"}:${entityType}:${entityId}`,
      };
    }
  }
  const eventId = text(event.externalEventId, 180) || text(event.ownerEventId, 180) || `${event.eventType}:${event.title}`;
  return {
    workspaceId,
    entityType: "integration_event",
    entityId: eventId,
    goalKey: `${platformKey}:${workspaceId ?? "workspace-default"}:event:${eventId}`,
  };
}

export function isActionableIntegrationObservation(event: IntegrationGoalObservation) {
  if (["resolved", "archived"].includes(event.status ?? "open")) return false;
  if (event.ownerAttention || ["needs_owner", "critical"].includes(event.status ?? "")) return true;
  if (["high", "critical"].includes(event.severity)) return true;
  if ((event.moneyCents ?? 0) > 0 || Boolean(event.riskType) || Boolean(text(event.recommendedAction))) return true;
  return /(failed|failure|error|blocked|missed|overdue|past.?due|dispute|complaint|urgent|needs.?attention|new.?lead|reply.?needed)/i.test(
    `${event.eventType} ${event.title} ${event.summary}`,
  );
}

function authoritativeOutcome(event: IntegrationGoalObservation) {
  const evidence = event.metadata.outcomeEvidence;
  const evidenceObject = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : null;
  return {
    verified:
      event.status === "resolved" &&
      event.metadata.authoritativeOutcomeVerified === true &&
      Boolean(evidenceObject && Object.keys(evidenceObject).length > 0),
    evidence: evidenceObject,
  };
}

async function connectedSource(tenantId: string, platformKey: string) {
  const result = await queryPostgres<{
    id: string;
    reference_table: string;
    connection_status: string;
    credentials_status: string | null;
  }>(
    `select id,reference_table,connection_status,credentials_status from (
       select id,'owner_platform_connections'::text as reference_table,connection_status,
         null::text as credentials_status,0 as priority,updated_at
       from public.owner_platform_connections where tenant_id=$1 and platform_key=$2
       union all
       select id,'integration_connections',status,credentials_status,1,updated_at
       from public.integration_connections where tenant_id=$1 and provider=$2
       union all
       select id,'provider_accounts',status,credentials_status,2,updated_at
       from public.provider_accounts where tenant_id=$1 and provider_key=$2
       union all
       select id,'provider_connection_lanes',connection_status,credentials_status,3,updated_at
       from public.provider_connection_lanes where tenant_id=$1 and provider_key=$2
     ) source order by priority,updated_at desc limit 1`,
    [tenantId, platformKey],
  );
  return result?.rows[0] ?? null;
}

export async function captureIntegrationGoalObservation(
  event: IntegrationGoalObservation,
  overrides: ObservationOverrides = {},
) {
  const externalEventId = text(event.externalEventId, 180) || text(event.ownerEventId, 180);
  if (!externalEventId) return { captured: false as const, reason: "missing_external_event_id" as const };
  const identity = overrides.identity ?? integrationGoalIdentity(event);
  const classification = overrides.classification ?? classifyIntegrationGoal(event);
  const resolved = ["resolved", "archived"].includes(event.status ?? "open");

  let goalId: string | null = null;
  if (resolved) {
    const existing = await queryPostgres<{ id: string }>(
      `select id from public.operating_goals where tenant_id=$1 and goal_key=$2 limit 1`,
      [event.tenantId, identity.goalKey],
    );
    goalId = existing?.rows[0]?.id ?? null;
    if (!goalId) return { captured: false as const, reason: "no_existing_goal" as const };
  } else {
    if (!isActionableIntegrationObservation(event)) {
      return { captured: false as const, reason: "informational_event" as const };
    }
    const goal = await createOperatingGoal({
      tenantId: event.tenantId,
      goalKey: identity.goalKey,
      goalType: classification.goalType,
      title: event.title,
      desiredOutcome: classification.desiredOutcome,
      priority: event.severity === "critical" ? "critical" : event.severity === "high" ? "high" : "normal",
      authorityMode: "observe",
      domainSystem: slug(event.platformKey, "integration"),
      sourceType: "integration_owner_event",
      externalWorkspaceId: identity.workspaceId,
      externalEntityType: identity.entityType,
      externalEntityId: identity.entityId,
      completionRules: {
        authoritativeSystem: event.platformKey,
        requiresOutcomeEvidence: true,
        resolvedEventAloneIsNotCompletion: true,
        providerAcceptanceIsNotCompletion: true,
        ...(overrides.completionRules ?? {}),
      },
      constraints: {
        preserveProviderAuthority: true,
        liveActionsUseExistingApprovalConsentSpendAndPolicyGates: true,
        ...(overrides.constraints ?? {}),
      },
    });
    goalId = goal.id;
  }

  const connection = await connectedSource(event.tenantId, event.platformKey);
  if (connection) {
    const health = mapGoalIntegrationHealth({
      referenceTable: connection.reference_table,
      connectionStatus: connection.connection_status,
      credentialsStatus: connection.credentials_status,
    });
    await addOperatingGoalDependency({
      tenantId: event.tenantId,
      goalId,
      dependencyKey: `integration:${event.platformKey}`,
      dependencyType: "integration",
      title: `${event.platformName} connection is available`,
      status: health.status,
      required: true,
      ownerActionRequired: false,
      referenceTable: connection.reference_table,
      referenceId: connection.id,
      externalReference: event.platformKey,
      evidence: {
        connectionStatus: connection.connection_status,
        credentialsStatus: connection.credentials_status,
        healthReason: health.reason,
        checkedAt: new Date().toISOString(),
      },
      metadata: { platformKey: event.platformKey },
    });
  }

  const observation = await recordOperatingGoalObservation({
    tenantId: event.tenantId,
    goalId,
    eventType: event.eventType,
    eventKey: `${slug(event.platformKey, "integration")}:${externalEventId}:${event.status ?? "open"}`,
    sourceSystem: slug(event.platformKey, "integration"),
    sourceTable: event.ownerEventId ? "owner_command_events" : null,
    sourceId: event.ownerEventId ?? externalEventId,
    materialChange: true,
    evidence: {
      externalEventId,
      occurredAt: event.occurredAt ?? null,
      summary: event.summary,
      severity: event.severity,
      status: event.status ?? "open",
      authoritativeEntityType: identity.entityType,
      authoritativeEntityId: identity.entityId,
    },
  });

  const outcome = authoritativeOutcome(event);
  let outcomeRecorded = false;
  if (outcome.verified && outcome.evidence) {
    const recorded = await recordOperatingGoalOutcome({
      tenantId: event.tenantId,
      goalId,
      outcomeVerified: true,
      eventKey: `${slug(event.platformKey, "integration")}:${externalEventId}:verified-outcome`,
      sourceSystem: slug(event.platformKey, "integration"),
      evidence: {
        ...outcome.evidence,
        externalEventId,
        authoritativeSystem: event.platformKey,
      },
    });
    outcomeRecorded = recorded.recorded;
  }

  return { captured: true as const, goalId, observationRecorded: observation.recorded, outcomeRecorded };
}

export async function capturePendingIntegrationGoalObservationsForTenant(tenantId: string, limit = 100) {
  const result = await queryPostgres<{
    id: string;
    platform_key: string;
    platform_name: string;
    external_event_id: string | null;
    event_type: string;
    title: string;
    summary: string;
    severity: IntegrationGoalObservation["severity"];
    status: NonNullable<IntegrationGoalObservation["status"]>;
    owner_attention: boolean;
    occurred_at: Date;
    risk_type: string | null;
    money_cents: number;
    recommended_action: string | null;
    metadata_json: Record<string, unknown> | null;
  }>(
    `select event.id,event.platform_key,event.platform_name,event.external_event_id,event.event_type,
       event.title,event.summary,event.severity,event.status,event.owner_attention,event.occurred_at,
       event.risk_type,event.money_cents,event.recommended_action,event.metadata_json
     from public.owner_command_events event
     join public.owner_platform_connections connection
       on connection.tenant_id=event.tenant_id and connection.platform_key=event.platform_key
     where event.tenant_id=$1 and connection.connection_status in ('connected','needs_attention')
       and event.event_type not like 'operating_goal.%'
       and not (event.metadata_json ? 'goalObservationState')
       and not exists(
         select 1 from public.operating_goal_events goal_event
         where goal_event.tenant_id=event.tenant_id and goal_event.source_table='owner_command_events'
           and goal_event.source_id=event.id::text
       )
     order by event.occurred_at asc limit $2`,
    [tenantId, Math.max(1, Math.min(limit, 250))],
  );
  let captured = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of result?.rows ?? []) {
    try {
      const observation = await captureIntegrationGoalObservation({
        tenantId,
        platformKey: row.platform_key,
        platformName: row.platform_name,
        ownerEventId: row.id,
        externalEventId: row.external_event_id,
        eventType: row.event_type,
        title: row.title,
        summary: row.summary,
        severity: row.severity,
        status: row.status,
        ownerAttention: row.owner_attention,
        occurredAt: row.occurred_at.toISOString(),
        riskType: row.risk_type,
        moneyCents: row.money_cents,
        recommendedAction: row.recommended_action,
        metadata: row.metadata_json ?? {},
      });
      if (observation.captured) captured += 1;
      else skipped += 1;
      await queryPostgres(
        `update public.owner_command_events set metadata_json=metadata_json || $3::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2`,
        [tenantId, row.id, JSON.stringify({
          goalObservationState: observation.captured ? "captured" : "skipped",
          goalObservationReason: "reason" in observation ? observation.reason : null,
          goalObservationAt: new Date().toISOString(),
        })],
      );
    } catch (error) {
      failed += 1;
      await safeLogAppError({
        tenantId,
        source: "integrations.goal-observation.backfill",
        message: error instanceof Error ? error.message : "Integration goal observation failed.",
        severity: "warning",
        retryable: true,
        metadata: { ownerEventId: row.id, platformKey: row.platform_key },
      });
    }
  }
  return { checked: result?.rows.length ?? 0, captured, skipped, failed };
}
