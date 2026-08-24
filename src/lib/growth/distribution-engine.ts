export const growthChannelCapabilities = [
  "discover",
  "search",
  "read",
  "monitor",
  "publish",
  "schedule_publish",
  "comment",
  "reply",
  "send_message",
  "receive_message",
  "receive_comment",
  "analytics",
  "account_health",
  "community_rules",
  "identity_management"
] as const;

export type GrowthChannelCapability = (typeof growthChannelCapabilities)[number];
export type CapabilitySupport = "official" | "assisted" | "manual" | "unavailable";
export type GrowthAutonomyLevel = "suggest" | "approve" | "autopilot";
export type GrowthRiskState = "healthy" | "caution" | "throttled" | "verification_required" | "restricted" | "cooldown" | "disabled";

type ChannelDefinition = {
  label: string;
  providerKey: string;
  defaultMode: "official_api" | "assisted_browser" | "manual" | "signed_bridge";
  capabilities: Partial<Record<GrowthChannelCapability, CapabilitySupport>>;
  note: string;
};

export type ChannelCapabilityProfile = {
  channelKey: string;
  officialCapabilities: GrowthChannelCapability[];
  assistedCapabilities: GrowthChannelCapability[];
  manualCapabilities: GrowthChannelCapability[];
  unsupportedCapabilities: GrowthChannelCapability[];
  authenticationRequirements: string[];
  inboundEvents: string[];
  approvalRequirement: "none" | "policy" | "always";
  riskConstraints: string[];
  healthSource: "provider" | "connector" | "ferocity" | "manual";
};

const manualPublishing = {
  discover: "manual",
  search: "manual",
  read: "manual",
  monitor: "manual",
  publish: "manual",
  schedule_publish: "manual",
  analytics: "manual",
  account_health: "manual",
  identity_management: "manual"
} satisfies Partial<Record<GrowthChannelCapability, CapabilitySupport>>;

export const growthChannels: Record<string, ChannelDefinition> = {
  website: {
    label: "Website",
    providerKey: "external_publishing",
    defaultMode: "official_api",
    capabilities: { publish: "official", schedule_publish: "official", analytics: "official", identity_management: "official" },
    note: "Ferocity-hosted pages are executable; outside CMS actions depend on the connected website mode."
  },
  google_business_profile: {
    label: "Google Business Profile",
    providerKey: "google_business_profile",
    defaultMode: "official_api",
    capabilities: { read: "official", analytics: "official", identity_management: "official", publish: "manual", reply: "manual" },
    note: "Profile reads are supported. Publishing and review replies remain review-first until separately certified."
  },
  facebook: {
    label: "Facebook",
    providerKey: "facebook",
    defaultMode: "assisted_browser",
    capabilities: { ...manualPublishing, community_rules: "assisted", comment: "assisted", reply: "assisted", receive_comment: "assisted" },
    note: "Ferocity prepares and assists legitimate customer-owned Page and Group work; it does not evade Meta controls."
  },
  instagram: {
    label: "Instagram",
    providerKey: "facebook",
    defaultMode: "assisted_browser",
    capabilities: { ...manualPublishing, comment: "assisted", reply: "assisted", receive_comment: "assisted" },
    note: "Capabilities vary by professional account and granted Meta permissions."
  },
  reddit: {
    label: "Reddit",
    providerKey: "reddit",
    defaultMode: "manual",
    capabilities: { ...manualPublishing, community_rules: "manual", comment: "manual", reply: "manual" },
    note: "Ferocity can prepare community-specific work; live execution is not represented as certified."
  },
  linkedin: {
    label: "LinkedIn",
    providerKey: "linkedin",
    defaultMode: "manual",
    capabilities: manualPublishing,
    note: "Manual publishing packages remain the safe default until an approved account connection exists."
  },
  x: {
    label: "X",
    providerKey: "x",
    defaultMode: "manual",
    capabilities: manualPublishing,
    note: "No live action is claimed without an enabled customer-owned connector."
  },
  nextdoor: {
    label: "Nextdoor",
    providerKey: "nextdoor",
    defaultMode: "manual",
    capabilities: { ...manualPublishing, community_rules: "manual" },
    note: "Availability depends on legitimate business access and local community rules."
  },
  craigslist: {
    label: "Craigslist",
    providerKey: "craigslist",
    defaultMode: "manual",
    capabilities: { ...manualPublishing, community_rules: "manual" },
    note: "Manual, rules-aware preparation only; no unsupported automation is claimed."
  },
  email: {
    label: "Email",
    providerKey: "email_provider",
    defaultMode: "official_api",
    capabilities: { publish: "official", schedule_publish: "official", send_message: "official", analytics: "official", account_health: "official" },
    note: "Sending requires a configured sender, consent where applicable, and the existing outbound safety policy."
  },
  sms: {
    label: "SMS",
    providerKey: "twilio",
    defaultMode: "official_api",
    capabilities: { send_message: "official", analytics: "official", account_health: "official", identity_management: "official" },
    note: "Live delivery requires a connected compliant provider; native/manual fallback remains available."
  }
};

export function getGrowthChannel(channelKey: string) {
  return growthChannels[channelKey] ?? null;
}

export function supportedCapabilities(channelKey: string) {
  const channel = getGrowthChannel(channelKey);
  if (!channel) return [];
  return Object.entries(channel.capabilities)
    .filter(([, support]) => support !== "unavailable")
    .map(([capability]) => capability as GrowthChannelCapability);
}

const channelOperationalProfiles: Record<string, Pick<ChannelCapabilityProfile, "authenticationRequirements" | "inboundEvents" | "approvalRequirement" | "riskConstraints" | "healthSource">> = {
  website: { authenticationRequirements: ["Ferocity workspace authorization", "Verified site ownership for outside websites"], inboundEvents: ["form_submission", "website_chat", "analytics_event"], approvalRequirement: "policy", riskConstraints: ["claim review", "site ownership", "publish idempotency"], healthSource: "ferocity" },
  google_business_profile: { authenticationRequirements: ["Customer-owned Google OAuth", "Authorized Business Profile location"], inboundEvents: ["review", "message", "profile_metric", "provider_warning"], approvalRequirement: "policy", riskConstraints: ["Google scopes", "location verification", "provider quotas"], healthSource: "provider" },
  facebook: { authenticationRequirements: ["Customer-owned Meta authorization or a narrowly scoped assisted-connector session", "Legitimate signed-in account"], inboundEvents: ["comment", "message", "post_removed", "admin_warning", "verification_required"], approvalRequirement: "policy", riskConstraints: ["community rules", "identity health", "verification", "restriction", "repetition"], healthSource: "connector" },
  instagram: { authenticationRequirements: ["Customer-owned professional Instagram account", "Granted Meta permissions or assisted owner session"], inboundEvents: ["comment", "message", "mention", "provider_warning"], approvalRequirement: "policy", riskConstraints: ["account type", "granted scopes", "rate signals", "repetition"], healthSource: "connector" },
  reddit: { authenticationRequirements: ["Customer-owned Reddit account", "Official app authorization when available"], inboundEvents: ["comment", "message", "post_removed", "moderator_warning"], approvalRequirement: "policy", riskConstraints: ["subreddit rules", "moderator action", "account health", "repetition"], healthSource: "manual" },
  linkedin: { authenticationRequirements: ["Customer-owned LinkedIn authorization for approved capabilities"], inboundEvents: ["comment", "message", "provider_warning"], approvalRequirement: "policy", riskConstraints: ["approved product scopes", "organization role", "provider quotas"], healthSource: "provider" },
  x: { authenticationRequirements: ["Customer-owned X authorization and applicable API access"], inboundEvents: ["reply", "message", "mention", "provider_warning"], approvalRequirement: "policy", riskConstraints: ["API tier", "provider quotas", "account health"], healthSource: "provider" },
  nextdoor: { authenticationRequirements: ["Legitimate customer-owned business access"], inboundEvents: ["reply", "message", "provider_warning"], approvalRequirement: "always", riskConstraints: ["local rules", "business eligibility", "manual confirmation"], healthSource: "manual" },
  craigslist: { authenticationRequirements: ["Legitimate customer-owned account when required"], inboundEvents: ["reply", "post_removed"], approvalRequirement: "always", riskConstraints: ["category rules", "geography", "duplicate listings", "manual confirmation"], healthSource: "manual" },
  email: { authenticationRequirements: ["Configured sender domain or customer-owned provider", "Required consent and suppression checks"], inboundEvents: ["reply", "delivery", "bounce", "complaint", "unsubscribe"], approvalRequirement: "policy", riskConstraints: ["consent", "suppression", "sender reputation", "delivery health"], healthSource: "provider" },
  sms: { authenticationRequirements: ["Connected compliant provider", "Approved sender/number where required", "Contact consent"], inboundEvents: ["reply", "delivery", "failure", "stop", "help"], approvalRequirement: "policy", riskConstraints: ["consent", "opt-out", "A2P rules", "tenant limits", "delivery health"], healthSource: "provider" }
};

export function getChannelCapabilityProfile(channelKey: string): ChannelCapabilityProfile | null {
  const channel = getGrowthChannel(channelKey);
  if (!channel) return null;
  const entries = growthChannelCapabilities.map((capability) => [capability, channel.capabilities[capability] ?? "unavailable"] as const);
  const operational = channelOperationalProfiles[channelKey] ?? {
    authenticationRequirements: ["Customer-owned authorization"], inboundEvents: [], approvalRequirement: "always" as const,
    riskConstraints: ["connector health", "customer policy"], healthSource: "manual" as const
  };
  return {
    channelKey,
    officialCapabilities: entries.filter(([, mode]) => mode === "official").map(([capability]) => capability),
    assistedCapabilities: entries.filter(([, mode]) => mode === "assisted").map(([capability]) => capability),
    manualCapabilities: entries.filter(([, mode]) => mode === "manual").map(([capability]) => capability),
    unsupportedCapabilities: entries.filter(([, mode]) => mode === "unavailable").map(([capability]) => capability),
    ...operational
  };
}

export type RiskSignals = {
  authorizationStatus?: string;
  verificationRequired?: boolean;
  explicitRestriction?: boolean;
  failureRate?: number;
  repeatedContentScore?: number;
  recentActions?: number;
  configuredDailyLimit?: number | null;
  cooldownUntil?: Date | null;
  ownerDisabled?: boolean;
};

export function evaluateGrowthRisk(signals: RiskSignals, now = new Date()): { state: GrowthRiskState; reasons: string[]; mayExecute: boolean } {
  const reasons: string[] = [];
  if (signals.ownerDisabled) return { state: "disabled", reasons: ["The owner disabled this identity or action."], mayExecute: false };
  if (signals.explicitRestriction) return { state: "restricted", reasons: ["The provider or community reported a restriction."], mayExecute: false };
  if (signals.verificationRequired || signals.authorizationStatus === "verification_required") {
    return { state: "verification_required", reasons: ["The legitimate account owner must complete provider verification."], mayExecute: false };
  }
  if (signals.cooldownUntil && signals.cooldownUntil.getTime() > now.getTime()) {
    return { state: "cooldown", reasons: ["A cautious recovery window is active."], mayExecute: false };
  }
  if (signals.authorizationStatus && signals.authorizationStatus !== "connected") {
    return { state: "disabled", reasons: ["The distribution identity is not connected."], mayExecute: false };
  }
  if (signals.configuredDailyLimit != null && (signals.recentActions ?? 0) >= signals.configuredDailyLimit) {
    return { state: "throttled", reasons: ["The customer-configured daily action limit was reached."], mayExecute: false };
  }
  if ((signals.failureRate ?? 0) >= 0.35) reasons.push("Recent provider failures are elevated.");
  if ((signals.repeatedContentScore ?? 0) >= 0.7) reasons.push("Recent content appears too repetitive.");
  if (reasons.length) return { state: "caution", reasons, mayExecute: false };
  return { state: "healthy", reasons: [], mayExecute: true };
}

const unsupportedClaimPatterns = [
  /\bguaranteed\b/i,
  /\blicensed\b/i,
  /\bcertified\b/i,
  /\bbest[- ]price\b/i,
  /\bnumber one\b/i,
  /\b#1\b/i,
  /\bthousands of (customers|clients)\b/i,
  /\blifetime warranty\b/i,
  /\bavailable (today|immediately)\b/i
];

export function findUnverifiedClaims(text: string, verifiedClaims: string[] = []) {
  const normalizedVerified = verifiedClaims.map((claim) => claim.trim().toLowerCase()).filter(Boolean);
  return unsupportedClaimPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source)
    .filter((pattern) => !normalizedVerified.some((claim) => new RegExp(pattern, "i").test(claim)));
}

export function scoreGrowthOpportunity(input: {
  text: string;
  serviceTerms?: string[];
  geographyTerms?: string[];
  objectiveTerms?: string[];
}) {
  const haystack = input.text.toLowerCase();
  const countMatches = (terms: string[] = []) => terms.filter((term) => term.trim() && haystack.includes(term.trim().toLowerCase())).length;
  const intentSignals = ["looking for", "need", "recommend", "quote", "estimate", "available", "how much", "who can"];
  const intentHits = countMatches(intentSignals);
  const serviceHits = countMatches(input.serviceTerms);
  const geographyHits = countMatches(input.geographyTerms);
  const objectiveHits = countMatches(input.objectiveTerms);
  const intentScore = Math.min(100, intentHits * 22 + serviceHits * 18);
  const geographyScore = Math.min(100, geographyHits * 45);
  const objectiveScore = Math.min(100, objectiveHits * 30 + serviceHits * 15);
  return {
    intentScore,
    geographyScore,
    objectiveScore,
    overallScore: Math.round(intentScore * 0.5 + geographyScore * 0.2 + objectiveScore * 0.3)
  };
}
