import { createHash } from "node:crypto";
import { getGrowthChannel, type CapabilitySupport } from "./distribution-engine";

export const publicationTypes = [
  "organic_post",
  "paid_ad",
  "listing",
  "promotion",
  "job_post",
  "service_offer",
  "email_campaign",
  "sms_campaign",
  "webpage"
] as const;

export type PublicationType = (typeof publicationTypes)[number];
export type DistributionMethod = "official_api" | "feed" | "signed_bridge" | "assisted_browser" | "manual";
export type DistributionApprovalMode = "draft_first" | "approval_required" | "policy" | "autopilot";

export type CanonicalMedia = {
  id: string;
  url: string;
  kind: "image" | "video" | "document";
  altText?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type CanonicalPublication = {
  id?: string;
  type: PublicationType;
  title: string;
  body: string;
  callToAction?: { label: string; url: string };
  offer?: { label: string; terms?: string; expiresAt?: string };
  audience?: { description?: string; locations?: string[]; interests?: string[] };
  location?: { city?: string; region?: string; postalCode?: string; country?: string };
  media?: CanonicalMedia[];
  hashtags?: string[];
  budget?: { totalCents: number; currency: string; dailyLimitCents?: number };
  schedule?: { publishAt?: string; timezone?: string; recurrenceRule?: string };
  approvalMode?: DistributionApprovalMode;
  campaignKey?: string;
  verifiedClaims?: string[];
  metadata?: Record<string, unknown>;
};

export type DestinationCapability = {
  key: string;
  label: string;
  providerKey: string;
  publicationTypes: PublicationType[];
  methods: DistributionMethod[];
  support: CapabilitySupport;
  requiresConnection: boolean;
  requiresExplicitSpendApproval: boolean;
  supportsScheduling: boolean;
  supportsRecurring: boolean;
  supportsUpdates: boolean;
  supportsRemoval: boolean;
  supportsInbound: boolean;
  supportsAnalytics: boolean;
  characterLimit?: number;
  media: {
    imageAspectRatios?: string[];
    videoAspectRatios?: string[];
    maxImages?: number;
    maxVideoSeconds?: number;
  };
  restrictions: string[];
};

export const distributionDestinations: Record<string, DestinationCapability> = {
  website: destination("website", "Website", "external_publishing", publicationTypes, ["official_api", "manual"], "official", {
    scheduling: true, recurring: true, updates: true, removal: true, inbound: true, analytics: true,
    media: { imageAspectRatios: ["16:9", "4:3", "1:1"] }
  }),
  google_business_profile: destination("google_business_profile", "Google Business Profile", "google_business_profile", ["organic_post", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, analytics: true, inbound: true, characterLimit: 1500, media: { imageAspectRatios: ["4:3", "1:1"], maxImages: 1 },
    restrictions: ["Requires an authorized and verified Business Profile location."]
  }),
  apple_business_connect: destination("apple_business_connect", "Apple Business Connect", "apple_business_connect", ["organic_post", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, analytics: true,
    media: { imageAspectRatios: ["1:1", "4:3"] },
    restrictions: ["Requires a verified business and an approved Apple Business Connect integration or a manual owner handoff."]
  }),
  bing_places: destination("bing_places", "Bing Places", "bing_places", ["organic_post", "promotion", "service_offer"], ["feed", "manual"], "manual", {
    updates: true, analytics: true,
    media: { imageAspectRatios: ["1:1", "4:3"] },
    restrictions: ["Execution depends on the business account and currently available Bing Places import or management path."]
  }),
  directory_sync: destination("directory_sync", "Business directories", "local_directory_adapter", ["listing", "promotion", "service_offer"], ["feed", "manual"], "manual", {
    updates: true, removal: true,
    media: { imageAspectRatios: ["1:1", "4:3"] },
    restrictions: ["Each directory has its own eligibility, verification, fields, and update rules."]
  }),
  zillow_network: destination("zillow_network", "Zillow rental network", "zillow_network", ["listing"], ["feed", "manual"], "manual", {
    updates: true, removal: true, inbound: true, analytics: true,
    media: { imageAspectRatios: ["4:3", "3:2", "16:9"], maxImages: 30 },
    restrictions: ["Requires provider approval, a complete private rental address, owner review, and a Ferocity-issued tenant feed token. Feed preparation does not authorize live publication."]
  }),
  apartments_feed: destination("apartments_feed", "Apartments.com renter network", "apartments_feed", ["listing"], ["feed", "manual"], "manual", {
    updates: true, removal: true, inbound: true, analytics: true,
    media: { imageAspectRatios: ["4:3", "3:2", "16:9"], maxImages: 30 },
    restrictions: ["Network eligibility and provider approval are required. Private address data is exposed only through a token-protected tenant feed."]
  }),
  tenantcloud: destination("tenantcloud", "TenantCloud", "tenantcloud", ["listing"], ["feed", "manual"], "manual", {
    updates: true, removal: true, inbound: true,
    media: { imageAspectRatios: ["4:3", "3:2", "16:9"], maxImages: 30 },
    restrictions: ["Optional alternate rental workflow. Do not represent this connection as direct Zillow approval or automatic publication."]
  }),
  turbotenant: destination("turbotenant", "TurboTenant", "turbotenant", ["listing"], ["feed", "manual"], "manual", {
    updates: true, removal: true, inbound: true,
    media: { imageAspectRatios: ["4:3", "3:2", "16:9"], maxImages: 30 },
    restrictions: ["Optional alternate rental workflow. Provider-controlled submission remains review-first."]
  }),
  review_platform: destination("review_platform", "Review platforms", "review_platform_adapter", ["organic_post", "service_offer"], ["official_api", "manual"], "manual", {
    inbound: true, analytics: true,
    media: {},
    restrictions: ["Review requests and responses must follow each platform's authenticity and incentive policies."]
  }),
  facebook: destination("facebook", "Facebook", "facebook", ["organic_post", "listing", "promotion", "job_post", "service_offer"], ["official_api", "assisted_browser", "manual"], "assisted", {
    scheduling: true, recurring: true, updates: true, removal: true, inbound: true, analytics: true,
    media: { imageAspectRatios: ["1.91:1", "1:1", "4:5", "9:16"], videoAspectRatios: ["16:9", "1:1", "4:5", "9:16"] },
    restrictions: ["Capabilities depend on the connected Page, granted permissions, and destination rules."]
  }),
  instagram: destination("instagram", "Instagram", "facebook", ["organic_post", "promotion", "service_offer"], ["official_api", "assisted_browser", "manual"], "assisted", {
    scheduling: true, recurring: true, removal: true, inbound: true, analytics: true, characterLimit: 2200,
    media: { imageAspectRatios: ["1:1", "4:5", "9:16"], videoAspectRatios: ["9:16", "1:1", "4:5"], maxImages: 10 },
    restrictions: ["Professional account and granted Meta permissions may be required."]
  }),
  tiktok: destination("tiktok", "TikTok", "tiktok_content", ["organic_post", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, analytics: true, characterLimit: 2200, media: { videoAspectRatios: ["9:16"], maxVideoSeconds: 600 },
    restrictions: ["TikTok Login alone is not publishing permission; Content Posting authorization is required."]
  }),
  linkedin: destination("linkedin", "LinkedIn", "linkedin", ["organic_post", "paid_ad", "job_post", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, inbound: true, analytics: true, characterLimit: 3000,
    media: { imageAspectRatios: ["1.91:1", "1:1"], videoAspectRatios: ["16:9", "1:1", "9:16"] }
  }),
  google_ads: destination("google_ads", "Google Ads", "google_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1.91:1", "1:1", "4:5"], videoAspectRatios: ["16:9", "1:1", "9:16"] },
    restrictions: ["Budget, advertiser authorization, policy checks, and explicit spend approval are required."]
  }),
  meta_ads: destination("meta_ads", "Meta Ads", "meta_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, updates: true, removal: true, inbound: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1.91:1", "1:1", "4:5", "9:16"], videoAspectRatios: ["16:9", "1:1", "4:5", "9:16"] },
    restrictions: ["A connected ad account, billing, policy checks, and explicit spend approval are required."]
  }),
  tiktok_ads: destination("tiktok_ads", "TikTok Ads", "tiktok_business", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { videoAspectRatios: ["9:16", "1:1", "16:9"] },
    restrictions: ["TikTok API for Business approval, an advertiser account, billing, and explicit spend approval are required."]
  }),
  microsoft_ads: destination("microsoft_ads", "Microsoft Ads", "microsoft_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "official", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1.91:1", "1:1", "4:5"] },
    restrictions: ["A verified advertiser account, billing, policy checks, and explicit spend approval are required."]
  }),
  linkedin_ads: destination("linkedin_ads", "LinkedIn Ads", "linkedin_ads", ["paid_ad", "promotion", "service_offer", "job_post"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1.91:1", "1:1"], videoAspectRatios: ["16:9", "1:1", "9:16"] },
    restrictions: ["LinkedIn Marketing API product access, an authorized ad account, billing, policy checks, and explicit spend approval are required."]
  }),
  x_ads: destination("x_ads", "X Ads", "x_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["16:9", "1:1"], videoAspectRatios: ["16:9", "1:1", "9:16"] },
    restrictions: ["X Ads API access, an eligible ad account, billing, policy checks, and explicit spend approval are required."]
  }),
  reddit_ads: destination("reddit_ads", "Reddit Ads", "reddit_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1:1", "16:9", "4:5"], videoAspectRatios: ["16:9", "1:1", "4:5", "9:16"] },
    restrictions: ["A Reddit advertiser account is not the same as approved Ads API access. Billing, policy checks, API authorization, and explicit spend approval are required."]
  }),
  pinterest_ads: destination("pinterest_ads", "Pinterest Ads", "pinterest_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["2:3", "1:1"], videoAspectRatios: ["9:16", "1:1", "2:3"] },
    restrictions: ["Pinterest developer access, an authorized ad account, billing, policy checks, and explicit spend approval are required."]
  }),
  snapchat_ads: destination("snapchat_ads", "Snap Ads", "snapchat_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["9:16"], videoAspectRatios: ["9:16"] },
    restrictions: ["Snap Marketing API access, an authorized ad account, billing, policy checks, and explicit spend approval are required."]
  }),
  amazon_ads: destination("amazon_ads", "Amazon Ads", "amazon_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1:1", "1.91:1"], videoAspectRatios: ["16:9", "1:1", "9:16"] },
    restrictions: ["Amazon Ads API access, an eligible advertiser profile, billing, policy checks, and explicit spend approval are required."]
  }),
  openai_ads: destination("openai_ads", "ChatGPT Ads", "openai_ads", ["paid_ad", "promotion", "service_offer"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: { imageAspectRatios: ["1:1", "1.91:1", "4:5"] },
    restrictions: ["An approved OpenAI advertiser account, Advertiser API credentials, billing, policy checks, and explicit spend approval are required."]
  }),
  apple_search_ads: destination("apple_search_ads", "Apple Ads", "apple_search_ads", ["paid_ad", "promotion"], ["official_api", "manual"], "manual", {
    scheduling: true, updates: true, removal: true, analytics: true, explicitSpend: true,
    media: {},
    restrictions: ["An eligible Apple Ads account, API authorization, app/store eligibility, billing, policy checks, and explicit spend approval are required."]
  }),
  email: destination("email", "Email", "email_provider", ["email_campaign", "promotion", "service_offer"], ["official_api"], "official", {
    scheduling: true, recurring: true, inbound: true, analytics: true,
    restrictions: ["Consent, suppression lists, sender identity, unsubscribe, and reputation rules apply."], media: {}
  }),
  sms: destination("sms", "SMS", "sms_router", ["sms_campaign", "promotion", "service_offer"], ["official_api", "signed_bridge", "manual"], "official", {
    scheduling: true, recurring: true, inbound: true, analytics: true, characterLimit: 160,
    restrictions: ["Consent and opt-out rules apply. Marketing traffic must use a compliant route."], media: {}
  }),
  reddit: destination("reddit", "Reddit", "reddit", ["organic_post", "promotion", "service_offer"], ["manual"], "manual", {
    inbound: true, analytics: false, characterLimit: 40000,
    restrictions: ["Community rules and moderator decisions control what is allowed."], media: { imageAspectRatios: ["1:1", "16:9"] }
  }),
  nextdoor: destination("nextdoor", "Nextdoor", "nextdoor", ["organic_post", "listing", "promotion", "service_offer"], ["manual"], "manual", {
    inbound: true, restrictions: ["Business eligibility and local rules apply."], media: { imageAspectRatios: ["1.91:1", "1:1"] }
  }),
  manual: destination("manual", "Manual export", "manual", publicationTypes, ["manual"], "manual", {
    updates: true, removal: true, restrictions: ["Ferocity prepares the package and records human confirmation; it does not claim live publication."], media: {}
  })
};

type DestinationOptions = {
  scheduling?: boolean; recurring?: boolean; updates?: boolean; removal?: boolean; inbound?: boolean; analytics?: boolean;
  explicitSpend?: boolean; characterLimit?: number; media: DestinationCapability["media"]; restrictions?: string[];
};

function destination(
  key: string,
  label: string,
  providerKey: string,
  types: readonly PublicationType[],
  methods: DistributionMethod[],
  support: CapabilitySupport,
  options: DestinationOptions
): DestinationCapability {
  return {
    key, label, providerKey, publicationTypes: [...types], methods, support,
    requiresConnection: methods.some((method) => method !== "manual"),
    requiresExplicitSpendApproval: options.explicitSpend ?? false,
    supportsScheduling: options.scheduling ?? false,
    supportsRecurring: options.recurring ?? false,
    supportsUpdates: options.updates ?? false,
    supportsRemoval: options.removal ?? false,
    supportsInbound: options.inbound ?? false,
    supportsAnalytics: options.analytics ?? false,
    characterLimit: options.characterLimit,
    media: options.media,
    restrictions: options.restrictions ?? []
  };
}

export type DestinationReadiness = {
  connected: boolean;
  liveActionsEnabled: boolean;
  credentialsStatus?: string;
  connectionStatus?: string;
};

export type DistributionPlanItem = {
  destinationKey: string;
  label: string;
  providerKey: string;
  method: DistributionMethod;
  status: "ready" | "needs_approval" | "needs_connection" | "needs_human" | "unsupported";
  reason?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  preview: { headline: string; body: string; callToAction?: string; warnings: string[] };
  mediaRequirements: DestinationCapability["media"];
  utm: Record<string, string>;
};

export function buildDistributionPlan(input: {
  publication: CanonicalPublication;
  destinationKeys: string[] | "all";
  readiness?: Record<string, DestinationReadiness>;
  explicitSpendApproved?: boolean;
  origin?: string;
}) {
  const keys = input.destinationKeys === "all"
    ? Object.keys(distributionDestinations).filter((key) => key !== "manual" && distributionDestinations[key].publicationTypes.includes(input.publication.type))
    : [...new Set(input.destinationKeys)];

  return keys.map((key) => adaptPublicationForDestination({
    publication: input.publication,
    destinationKey: key,
    readiness: input.readiness?.[key],
    explicitSpendApproved: input.explicitSpendApproved,
    origin: input.origin
  }));
}

export function adaptPublicationForDestination(input: {
  publication: CanonicalPublication;
  destinationKey: string;
  readiness?: DestinationReadiness;
  explicitSpendApproved?: boolean;
  origin?: string;
}): DistributionPlanItem {
  const definition = distributionDestinations[input.destinationKey];
  const utm = buildUtm(input.publication, input.destinationKey);
  const idempotencyKey = distributionIdempotencyKey(input.publication, input.destinationKey);
  if (!definition || !definition.publicationTypes.includes(input.publication.type)) {
    return blockedItem(input.destinationKey, definition, "unsupported", "This destination does not support this publication type.", idempotencyKey, utm);
  }

  const readiness = input.readiness;
  let method = chooseMethod(definition, readiness);
  let status: DistributionPlanItem["status"] = "ready";
  let reason: string | undefined;

  if (definition.requiresExplicitSpendApproval && !input.publication.budget) {
    status = "needs_approval";
    reason = "Paid distribution requires a budget before it can be queued.";
  } else if (definition.requiresExplicitSpendApproval && !input.explicitSpendApproved) {
    status = "needs_approval";
    reason = "Paid distribution always requires explicit spend approval.";
  } else if (definition.requiresConnection && (!readiness?.connected || readiness.credentialsStatus === "expired" || readiness.credentialsStatus === "revoked")) {
    method = definition.methods.includes("manual") ? "manual" : method;
    status = method === "manual" ? "needs_human" : "needs_connection";
    reason = method === "manual" ? "A manual publishing package can be prepared, but no live connection is available." : "Connect and authorize this destination first.";
  } else if (method === "manual" || method === "assisted_browser") {
    status = "needs_human";
    reason = "Ferocity can prepare and track this destination, but a person must complete the provider-controlled step.";
  } else if (!readiness?.liveActionsEnabled) {
    status = "needs_approval";
    reason = "The destination is connected, but live actions are currently gated.";
  }

  const body = truncate(input.publication.body, definition.characterLimit);
  const trackedUrl = appendUtm(input.publication.callToAction?.url, utm, input.origin);
  const warnings = [
    ...(body.truncated ? [`Body shortened to ${definition.characterLimit} characters.`] : []),
    ...(definition.requiresExplicitSpendApproval ? ["Spend will remain blocked until explicitly approved."] : []),
    ...definition.restrictions
  ];
  const payload = {
    publicationType: input.publication.type,
    headline: input.publication.title,
    body: body.value,
    callToAction: input.publication.callToAction ? { ...input.publication.callToAction, url: trackedUrl } : undefined,
    offer: input.publication.offer,
    audience: input.publication.audience,
    location: input.publication.location,
    hashtags: input.publication.hashtags,
    media: input.publication.media,
    budget: input.publication.budget,
    schedule: input.publication.schedule,
    providerKey: definition.providerKey,
    destinationKey: definition.key,
    utm
  };
  return {
    destinationKey: definition.key, label: definition.label, providerKey: definition.providerKey, method, status, reason,
    idempotencyKey, payload,
    preview: { headline: input.publication.title, body: body.value, callToAction: trackedUrl, warnings },
    mediaRequirements: definition.media, utm
  };
}

function chooseMethod(definition: DestinationCapability, readiness?: DestinationReadiness): DistributionMethod {
  if (readiness?.connected && readiness.liveActionsEnabled && definition.methods.includes("official_api")) return "official_api";
  if (readiness?.connected && definition.methods.includes("feed")) return "feed";
  if (readiness?.connected && definition.methods.includes("signed_bridge")) return "signed_bridge";
  if (definition.methods.includes("assisted_browser")) return "assisted_browser";
  return definition.methods.includes("manual") ? "manual" : definition.methods[0];
}

function blockedItem(key: string, definition: DestinationCapability | undefined, status: DistributionPlanItem["status"], reason: string, idempotencyKey: string, utm: Record<string, string>): DistributionPlanItem {
  return {
    destinationKey: key, label: definition?.label ?? key, providerKey: definition?.providerKey ?? "unknown",
    method: "manual", status, reason, idempotencyKey, payload: {},
    preview: { headline: "", body: "", warnings: [reason] }, mediaRequirements: definition?.media ?? {}, utm
  };
}

export function buildUtm(publication: CanonicalPublication, destinationKey: string) {
  return {
    utm_source: destinationKey,
    utm_medium: publication.type === "paid_ad" ? "paid" : destinationKey === "email" || publication.type === "email_campaign" ? "email" : destinationKey === "sms" || publication.type === "sms_campaign" ? "sms" : "organic",
    utm_campaign: slug(publication.campaignKey ?? publication.title),
    utm_content: publication.id ? publication.id.slice(0, 12) : "canonical"
  };
}

export function distributionIdempotencyKey(publication: CanonicalPublication, destinationKey: string) {
  const stable = JSON.stringify({
    id: publication.id ?? null, type: publication.type, title: publication.title, body: publication.body,
    cta: publication.callToAction ?? null, offer: publication.offer ?? null, destinationKey,
    publishAt: publication.schedule?.publishAt ?? null, campaign: publication.campaignKey ?? null
  });
  return `distribution:${createHash("sha256").update(stable).digest("hex")}`;
}

export function nextDistributionRetry(attempt: number, now = new Date()) {
  const boundedAttempt = Math.max(1, Math.min(attempt, 8));
  const delayMinutes = Math.min(24 * 60, 2 ** boundedAttempt * 5);
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export function getDistributionDestination(key: string) {
  return distributionDestinations[key] ?? null;
}

export function getLegacyChannelTruth(key: string) {
  return getGrowthChannel(key);
}

function truncate(value: string, limit?: number) {
  if (!limit || value.length <= limit) return { value, truncated: false };
  return { value: `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`, truncated: true };
}

function appendUtm(url: string | undefined, utm: Record<string, string>, origin?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, origin);
    Object.entries(utm).forEach(([key, value]) => parsed.searchParams.set(key, value));
    return parsed.toString();
  } catch {
    return url;
  }
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "campaign";
}
