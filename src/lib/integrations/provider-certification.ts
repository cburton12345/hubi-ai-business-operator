export const providerCertificationStatuses = [
  "setup_required",
  "awaiting_provider",
  "connected_unverified",
  "certified_limited",
  "certified_live",
  "suspended"
] as const;

export type ProviderCertificationStatus = (typeof providerCertificationStatuses)[number];

export function integrationStatusForCertification(status: ProviderCertificationStatus) {
  if (status === "certified_live" || status === "certified_limited" || status === "connected_unverified") return "connected" as const;
  if (status === "suspended") return "paused" as const;
  if (status === "awaiting_provider") return "planned" as const;
  return "not_connected" as const;
}

export function providerAccountStatusForCertification(status: ProviderCertificationStatus) {
  if (status === "certified_live" || status === "certified_limited" || status === "connected_unverified") return "connected" as const;
  if (status === "suspended") return "paused" as const;
  return "planned" as const;
}

export function laneStatusForCertification(status: ProviderCertificationStatus) {
  if (status === "certified_live" || status === "certified_limited" || status === "connected_unverified") return "connected" as const;
  if (status === "suspended") return "blocked" as const;
  if (status === "awaiting_provider") return "needs_attention" as const;
  return "not_connected" as const;
}

export function canEnableProviderLiveActions(input: {
  certificationStatus: ProviderCertificationStatus;
  executableAdapter: boolean;
  credentialsReady: boolean;
}) {
  if (input.certificationStatus !== "certified_live") return { allowed: false, reason: "Provider certification is not live." };
  if (!input.executableAdapter) return { allowed: false, reason: "No executable adapter or native fallback is released." };
  if (!input.credentialsReady) return { allowed: false, reason: "Provider credentials are not ready." };
  return { allowed: true, reason: "Provider is certified, executable, and credentialed." };
}

export function providerCertificationLabel(status?: ProviderCertificationStatus | null) {
  if (status === "certified_live") return "Certified live";
  if (status === "certified_limited") return "Certified with limits";
  if (status === "connected_unverified") return "Connected, certification pending";
  if (status === "awaiting_provider") return "Waiting for provider";
  if (status === "suspended") return "Suspended";
  return "Setup required";
}

export function deriveProviderCertificationStatus(input: {
  explicitStatus?: ProviderCertificationStatus | null;
  integrationStatus?: string | null;
  accountStatus?: string | null;
  liveActionsEnabled?: boolean;
}): ProviderCertificationStatus {
  if (input.explicitStatus) return input.explicitStatus;
  if (input.accountStatus === "paused" || input.integrationStatus === "paused") return "suspended";
  if (input.liveActionsEnabled && input.accountStatus === "connected") return "certified_live";
  if (input.accountStatus === "connected" || input.integrationStatus === "connected") return "connected_unverified";
  if (input.accountStatus === "planned" || input.integrationStatus === "planned") return "awaiting_provider";
  return "setup_required";
}
