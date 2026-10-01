import { createHash } from "node:crypto";

export const localPresenceProviderCapabilities = {
  google_business_profile: {
    readProfile: true, updateProfile: true, media: true, posts: true, reviews: true, reviewReplies: true,
    realtimeNotifications: true, performance: true, searchQueries: true
  },
  apple_business_connect: {
    readProfile: true, updateProfile: false, media: false, posts: false, reviews: false, reviewReplies: false,
    realtimeNotifications: false, performance: false, searchQueries: false
  },
  bing_places: {
    readProfile: true, updateProfile: false, media: true, posts: false, reviews: false, reviewReplies: false,
    realtimeNotifications: false, performance: false, searchQueries: false
  },
  local_directory_adapter: {
    readProfile: false, updateProfile: false, media: false, posts: false, reviews: false, reviewReplies: false,
    realtimeNotifications: false, performance: false, searchQueries: false
  }
} as const;

export type LocalBusinessRecord = {
  name?: string | null;
  primaryCategory?: string | null;
  additionalCategories?: string[];
  services?: string[];
  description?: string | null;
  regularHours?: unknown;
  specialHours?: unknown;
  serviceAreas?: string[];
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  attributes?: Record<string, unknown>;
  mediaCount?: number;
  verified?: boolean;
  updatedAt?: string | null;
};

export type LocalPresenceIssue = {
  key: string;
  field: string;
  type: "missing" | "inconsistent" | "stale" | "verification";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  currentValue: unknown;
  recommendedValue: unknown;
  safeToAutoFix: boolean;
  providerAction?: string;
};

const profileFields: Array<{
  key: keyof LocalBusinessRecord;
  label: string;
  weight: number;
  severity: LocalPresenceIssue["severity"];
  safe: boolean;
}> = [
  { key: "name", label: "business name", weight: 12, severity: "critical", safe: false },
  { key: "primaryCategory", label: "primary category", weight: 12, severity: "high", safe: false },
  { key: "services", label: "services", weight: 10, severity: "high", safe: false },
  { key: "description", label: "description", weight: 8, severity: "medium", safe: true },
  { key: "regularHours", label: "regular hours", weight: 10, severity: "high", safe: true },
  { key: "serviceAreas", label: "service areas", weight: 8, severity: "high", safe: false },
  { key: "phone", label: "phone", weight: 12, severity: "critical", safe: false },
  { key: "website", label: "website", weight: 10, severity: "high", safe: true },
  { key: "attributes", label: "attributes", weight: 5, severity: "low", safe: true },
  { key: "mediaCount", label: "photos or media", weight: 8, severity: "medium", safe: false },
  { key: "verified", label: "verification", weight: 5, severity: "critical", safe: false }
];

function present(value: unknown) {
  if (value == null || value === "" || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  if (typeof value === "number") return value > 0;
  return true;
}

function normalized(value: unknown): unknown {
  if (typeof value === "string") return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (Array.isArray(value)) return [...value].map(normalized).sort();
  return value;
}

export function evaluateLocalPresence(input: {
  canonical: LocalBusinessRecord;
  provider: LocalBusinessRecord;
  staleAfterDays?: number;
  now?: Date;
}) {
  const issues: LocalPresenceIssue[] = [];
  let completedWeight = 0;
  let matchingWeight = 0;
  const totalWeight = profileFields.reduce((sum, field) => sum + field.weight, 0);
  for (const field of profileFields) {
    const providerValue = input.provider[field.key];
    const canonicalValue = input.canonical[field.key];
    if (present(providerValue)) completedWeight += field.weight;
    else {
      issues.push({
        key: `missing:${field.key}`, field: field.key, type: field.key === "verified" ? "verification" : "missing",
        severity: field.severity, title: `Add ${field.label}`,
        explanation: `The provider profile does not currently show a usable ${field.label}.`, currentValue: providerValue ?? null,
        recommendedValue: canonicalValue ?? null, safeToAutoFix: field.safe && present(canonicalValue), providerAction: field.safe ? "update_profile" : undefined
      });
    }
    if (present(canonicalValue) && present(providerValue)) {
      if (JSON.stringify(normalized(canonicalValue)) === JSON.stringify(normalized(providerValue))) matchingWeight += field.weight;
      else {
        issues.push({
          key: `inconsistent:${field.key}`, field: field.key, type: "inconsistent", severity: field.severity,
          title: `Confirm ${field.label}`,
          explanation: "Ferocity and the provider disagree. Confirm the source of truth before changing public information.",
          currentValue: providerValue, recommendedValue: canonicalValue, safeToAutoFix: false, providerAction: "review_profile_update"
        });
      }
    } else if (!present(canonicalValue) && present(providerValue)) {
      matchingWeight += field.weight;
    }
  }
  const now = input.now ?? new Date();
  const staleAfterDays = input.staleAfterDays ?? 45;
  const updatedAt = input.provider.updatedAt ? new Date(input.provider.updatedAt) : null;
  const daysOld = updatedAt && !Number.isNaN(updatedAt.getTime()) ? Math.floor((now.getTime() - updatedAt.getTime()) / 86_400_000) : null;
  const freshnessScore = daysOld == null ? 50 : Math.max(0, Math.min(100, Math.round(100 - (daysOld / staleAfterDays) * 50)));
  if (daysOld != null && daysOld > staleAfterDays) {
    issues.push({
      key: "stale:profile", field: "updatedAt", type: "stale", severity: "medium", title: "Profile may be stale",
      explanation: `No confirmed profile activity has been recorded for ${daysOld} days. Check accuracy and publish legitimate current business content if useful.`,
      currentValue: input.provider.updatedAt, recommendedValue: null, safeToAutoFix: false, providerAction: "review_profile_freshness"
    });
  }
  const completenessScore = Math.round((completedWeight / totalWeight) * 100);
  const comparableWeight = profileFields.filter((field) => present(input.canonical[field.key])).reduce((sum, field) => sum + field.weight, 0);
  const consistencyScore = comparableWeight ? Math.round((matchingWeight / comparableWeight) * 100) : 100;
  const healthScore = Math.round(completenessScore * 0.45 + consistencyScore * 0.35 + freshnessScore * 0.2);
  return { healthScore, completenessScore, consistencyScore, freshnessScore, issues };
}

export function reviewDecision(input: {
  stars: number | null;
  comment: string | null;
  positiveReplyOptIn: boolean;
  positiveReplyMinStars?: number;
  negativeThreshold?: number;
  existingReply?: string | null;
  recentReplies?: string[];
}) {
  const flags: string[] = [];
  if (input.existingReply) return { action: "none" as const, reason: "This review already has a public reply.", flags };
  if (!input.stars) return { action: "owner_review" as const, reason: "The rating is unavailable.", flags: ["rating_missing"] };
  if (input.stars <= (input.negativeThreshold ?? 3)) {
    return { action: "service_recovery" as const, reason: "A negative or questionable review should be assessed before any public response.", flags: ["negative_review"] };
  }
  if (!input.comment?.trim()) return { action: "owner_review" as const, reason: "Rating-only reviews need context before an automated personalized reply.", flags: ["comment_missing"] };
  if (!input.positiveReplyOptIn) return { action: "prepare_reply" as const, reason: "The owner has not opted into automatic positive-review replies.", flags };
  if (input.stars < (input.positiveReplyMinStars ?? 4)) return { action: "owner_review" as const, reason: "The rating is below the automatic positive-response threshold.", flags };
  if ((input.recentReplies ?? []).some((reply) => responseSimilarity(reply, input.comment ?? "") > 0.8)) flags.push("repetition_risk");
  return flags.length
    ? { action: "prepare_reply" as const, reason: "Prepare a reply, but require review because recent language may be repetitive.", flags }
    : { action: "auto_reply_eligible" as const, reason: "Owner opt-in and the configured positive-review rules allow an automatic personalized reply.", flags };
}

export function localPresenceEventKey(tenantId: string, eventType: string, sourceTable: string | null, sourceId: string | null) {
  return `local-presence:${createHash("sha256").update([tenantId, eventType, sourceTable ?? "", sourceId ?? ""].join(":" )).digest("hex")}`;
}

export function recommendedLocalDestinations(eventType: string) {
  if (eventType === "job_completed" || eventType === "photo_added") return ["google_business_profile", "apple_business_connect", "bing_places"];
  if (eventType === "promotion_created") return ["google_business_profile", "apple_business_connect", "bing_places", "directory_sync"];
  if (["service_changed", "hours_changed", "location_changed"].includes(eventType)) return ["google_business_profile", "apple_business_connect", "bing_places", "directory_sync"];
  return ["google_business_profile"];
}

function responseSimilarity(left: string, right: string) {
  const words = (value: string) => new Set(value.toLowerCase().split(/\W+/).filter((word) => word.length > 3));
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / Math.max(a.size, b.size);
}
