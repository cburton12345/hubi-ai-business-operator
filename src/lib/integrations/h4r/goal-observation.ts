import { captureIntegrationGoalObservation } from "@/lib/integrations/goal-observation";

type H4rOwnerEvent = {
  tenantId: string;
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

function text(value: unknown, max = 240) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function metadataValue(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(metadata[key]);
    if (value) return value;
  }
  return null;
}

export function classifyH4rGoal(input: Pick<H4rOwnerEvent, "eventType" | "title" | "summary" | "metadata">) {
  const context = `${input.eventType} ${input.title} ${input.summary} ${JSON.stringify(input.metadata)}`.toLowerCase();
  if (/(furnace|heat|water|electric|maintenance|repair|work.?order|safety|emergency)/.test(context)) {
    return { goalType: "maintenance_resolution", desiredOutcome: "Resolve the property issue and verify the tenant or property is safe and operational." };
  }
  if (/(balance|rent|payment|promise|collection|late fee|delinquen)/.test(context)) {
    return { goalType: "collection_resolution", desiredOutcome: "Resolve the balance in authoritative H4R records through payment, an authorized arrangement, or an owner-approved next step." };
  }
  if (/(application|applicant|showing|vacan|listing|lease|move.?in|occup)/.test(context)) {
    return { goalType: "leasing_outcome", desiredOutcome: "Advance the property or applicant to a verified leasing outcome without bypassing screening or owner-selection policy." };
  }
  if (/(tenant|onboard|deposit|document|signature)/.test(context)) {
    return { goalType: "tenant_onboarding", desiredOutcome: "Complete the tenant setup and move-in requirements in authoritative H4R records." };
  }
  return { goalType: "h4r_exception_resolution", desiredOutcome: "Resolve the Homes4Rent exception and verify the authoritative H4R state reflects the outcome." };
}

export function h4rGoalIdentity(event: H4rOwnerEvent) {
  const workspaceId = metadataValue(event.metadata, ["sourceWorkspaceId", "workspaceId", "workspace_id"]);
  const contextDomain = metadataValue(event.metadata, ["contextDomain", "context_domain"]);
  if (contextDomain) {
    return {
      workspaceId,
      entityType: "workspace_domain",
      entityId: `${workspaceId ?? "workspace-unknown"}:${contextDomain}`,
      goalKey: `h4r:${workspaceId ?? "workspace-unknown"}:domain:${contextDomain}`,
    };
  }
  const entityCandidates: Array<[string, string[]]> = [
    ["collection_case", ["collectionCaseId", "collection_case_id"]],
    ["lease", ["leaseId", "lease_id"]],
    ["application", ["applicationId", "application_id"]],
    ["tenant", ["tenantId", "tenant_id"]],
    ["unit", ["unitId", "unit_id"]],
    ["property", ["propertyId", "property_id"]],
  ];
  for (const [entityType, keys] of entityCandidates) {
    const entityId = metadataValue(event.metadata, keys);
    if (entityId) {
      return {
        workspaceId,
        entityType,
        entityId,
        goalKey: `h4r:${workspaceId ?? "workspace-unknown"}:${entityType}:${entityId}`,
      };
    }
  }
  const eventId = text(event.externalEventId, 180) || `${event.eventType}:${event.title}`;
  return {
    workspaceId,
    entityType: "owner_event",
    entityId: eventId,
    goalKey: `h4r:${workspaceId ?? "workspace-unknown"}:owner-event:${eventId}`,
  };
}

export async function captureH4rGoalObservation(event: H4rOwnerEvent) {
  const classification = classifyH4rGoal(event);
  const identity = h4rGoalIdentity(event);
  return captureIntegrationGoalObservation({
    ...event,
    platformKey: "h4r",
    platformName: "Homes4Rent",
  }, {
    classification,
    identity,
    completionRules: { ownerEventResolutionAloneIsNotCompletion: true },
    constraints: {
      preserveH4rAuthority: true,
      screeningAndLegalDecisionsRemainPolicyGated: true,
      outboundCommunicationUsesExistingApprovalAndConsentGates: true,
    },
  });
}
