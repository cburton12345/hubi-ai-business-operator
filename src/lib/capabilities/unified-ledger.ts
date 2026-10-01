import executionContractsJson from "@/lib/capabilities/execution-contracts.json";
import providerTruthJson from "@/lib/integrations/provider-capability-truth.json";
import { ferocityCommandCapabilities } from "@/lib/ai-workforce/command-understanding";
import { listBusinessActionDefinitions } from "@/lib/business-actions/catalog";
import { listServiceFeatureDefinitions } from "@/lib/controls/service-gates";
import { publicFerocityCapabilities } from "@/lib/public-site/ferocity-capabilities";

export const capabilityEvidenceStates = [
  "implemented_unverified",
  "locally_verified",
  "staging_certified",
  "production_certified",
  "customer_connection_required",
  "provider_approval_required",
  "degraded",
  "temporarily_unavailable",
] as const;

export type CapabilityEvidenceState = (typeof capabilityEvidenceStates)[number];
export type CapabilityLedgerSource =
  | "public_outcome"
  | "service_feature"
  | "command_family"
  | "business_action"
  | "execution_contract"
  | "provider";

export type UnifiedCapabilityLedgerEntry = {
  id: string;
  source: CapabilityLedgerSource;
  label: string;
  evidenceState: CapabilityEvidenceState;
  autonomy: "read" | "prepare" | "execute" | "provider_dependent" | "mixed";
  customerFacing: boolean;
  href: string | null;
  requirement: string | null;
  evidence: string | null;
  allowedClaim: string;
};

type ExecutionContract = {
  state?: string;
  control?: string;
  executor?: string;
  limitation?: string;
  evidence?: string;
};

type ProviderTruth = {
  label?: string;
  state?: string;
  summary?: string;
  fallback?: string;
};

function words(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

function contractEvidenceState(state: string | undefined): CapabilityEvidenceState {
  if (state === "certified_live") return "production_certified";
  if (state === "source_ready") return "locally_verified";
  if (state === "blocked") return "provider_approval_required";
  if (state === "limited") return "degraded";
  return "implemented_unverified";
}

function providerEvidenceState(state: string | undefined): CapabilityEvidenceState {
  if (state === "certified_live") return "production_certified";
  if (state === "connect_account") return "customer_connection_required";
  if (state === "approval_blocked") return "provider_approval_required";
  if (state === "limited" || state === "fallback_only") return "degraded";
  return "implemented_unverified";
}

function claimForState(state: CapabilityEvidenceState, label: string) {
  if (state === "production_certified") return `${label} is production-certified within its stated authority and setup requirements.`;
  if (state === "customer_connection_required") return `${label} is available after the customer connects and authorizes the required account.`;
  if (state === "provider_approval_required") return `${label} is not available for live execution until provider approval is complete.`;
  if (state === "degraded") return `${label} has limited or fallback behavior; describe the limitation before use.`;
  if (state === "temporarily_unavailable") return `${label} is temporarily unavailable.`;
  return `${label} is implemented but must not be presented as production-certified.`;
}

export function buildUnifiedCapabilityLedger(): UnifiedCapabilityLedgerEntry[] {
  const entries: UnifiedCapabilityLedgerEntry[] = [];

  for (const capability of publicFerocityCapabilities) {
    entries.push({
      id: `public:${capability.key}`,
      source: "public_outcome",
      label: capability.name,
      evidenceState: "implemented_unverified",
      autonomy: "mixed",
      customerFacing: true,
      href: capability.href,
      requirement: "Resolve this outcome to certified service features, actions, and providers before making execution claims.",
      evidence: capability.outcome,
      allowedClaim: `${capability.name} is a customer-facing outcome area; describe specific actions according to their individual evidence state.`,
    });
  }

  for (const feature of listServiceFeatureDefinitions()) {
    const label = words(feature.key);
    entries.push({
      id: `feature:${feature.key}`,
      source: "service_feature",
      label,
      evidenceState: "implemented_unverified",
      autonomy: "mixed",
      customerFacing: true,
      href: null,
      requirement: `Requires ${feature.minimumPlan} or an explicit entitlement; runtime and provider evidence are separate.`,
      evidence: "Registered in the service-gate catalog.",
      allowedClaim: claimForState("implemented_unverified", label),
    });
  }

  for (const capability of ferocityCommandCapabilities) {
    const label = words(capability);
    entries.push({
      id: `command:${capability}`,
      source: "command_family",
      label,
      evidenceState: "implemented_unverified",
      autonomy: "mixed",
      customerFacing: true,
      href: "/app/ferocity",
      requirement: "Must resolve to authorized business actions and verified data instead of keyword routing alone.",
      evidence: "Registered in Ferocity command understanding.",
      allowedClaim: claimForState("implemented_unverified", label),
    });
  }

  for (const action of listBusinessActionDefinitions()) {
    // Every catalog action is exercised by the isolated business-action runtime
    // certification. Protected actions are verified to stop at review without
    // mutating the target record or contacting an outside provider.
    const state: CapabilityEvidenceState = "locally_verified";
    entries.push({
      id: `action:${action.key}`,
      source: "business_action",
      label: action.title,
      evidenceState: state,
      autonomy: action.mode === "read" ? "read" : action.mode === "execute" ? "execute" : "prepare",
      customerFacing: false,
      href: null,
      requirement: `${action.scope}; ${action.risk} risk; external agent access ${action.externalReady ? "enabled" : "disabled"}.`,
      evidence: action.description,
      allowedClaim: claimForState(state, action.title),
    });
  }

  const contracts = executionContractsJson.contracts as Record<string, ExecutionContract>;
  for (const [key, contract] of Object.entries(contracts)) {
    const state = contractEvidenceState(contract.state);
    const label = words(key);
    entries.push({
      id: `contract:${key}`,
      source: "execution_contract",
      label,
      evidenceState: state,
      autonomy: "mixed",
      customerFacing: false,
      href: null,
      requirement: contract.limitation ?? contract.control ?? null,
      evidence: contract.evidence ?? contract.executor ?? null,
      allowedClaim: claimForState(state, label),
    });
  }

  const providers = providerTruthJson.providers as Record<string, ProviderTruth>;
  for (const [key, provider] of Object.entries(providers)) {
    const state = providerEvidenceState(provider.state);
    const label = provider.label ?? words(key);
    entries.push({
      id: `provider:${key}`,
      source: "provider",
      label,
      evidenceState: state,
      autonomy: "provider_dependent",
      customerFacing: true,
      href: "/app/integrations",
      requirement: provider.fallback ?? null,
      evidence: provider.summary ?? null,
      allowedClaim: claimForState(state, label),
    });
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export function summarizeUnifiedCapabilityLedger(entries = buildUnifiedCapabilityLedger()) {
  const bySource = Object.fromEntries(
    Array.from(new Set(entries.map((entry) => entry.source))).map((source) => [
      source,
      entries.filter((entry) => entry.source === source).length,
    ])
  );
  const byEvidenceState = Object.fromEntries(
    capabilityEvidenceStates.map((state) => [
      state,
      entries.filter((entry) => entry.evidenceState === state).length,
    ])
  );
  return { total: entries.length, bySource, byEvidenceState };
}
