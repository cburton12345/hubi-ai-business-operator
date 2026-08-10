import truth from "@/lib/integrations/provider-capability-truth.json";

export type CapabilityTruthState =
  | "certified_live"
  | "limited"
  | "connect_account"
  | "approval_blocked"
  | "fallback_only"
  | "planned";

export type ProviderCapabilityTruth = {
  label: string;
  state: CapabilityTruthState;
  summary: string;
  capabilities: string[];
  fallback: string;
  connectionAvailable?: boolean;
};

const providers = truth.providers as Record<string, ProviderCapabilityTruth>;

export function getProviderCapabilityTruth(providerKey: string) {
  return providers[providerKey] ?? null;
}

export function providerTruthState(providerKey: string): CapabilityTruthState {
  return getProviderCapabilityTruth(providerKey)?.state ?? "planned";
}

export function providerHasCapability(providerKey: string, capability: string) {
  return getProviderCapabilityTruth(providerKey)?.capabilities.includes(capability) ?? false;
}

export function providerIsCertifiedLive(providerKey: string) {
  return providerTruthState(providerKey) === "certified_live";
}

export function providerCanExecute(providerKey: string) {
  const state = providerTruthState(providerKey);
  return state === "certified_live" || state === "limited" || state === "connect_account";
}

export function providerTruthLabel(state: CapabilityTruthState) {
  if (state === "certified_live") return "Live and verified";
  if (state === "limited") return "Limited availability";
  if (state === "connect_account") return "Connect your account";
  if (state === "approval_blocked") return "Provider approval required";
  if (state === "fallback_only") return "Native fallback available";
  return "Planned";
}

export function listProviderCapabilityTruth() {
  return Object.entries(providers).map(([providerKey, value]) => ({ providerKey, ...value }));
}
