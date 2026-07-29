export type BacklinkAssessmentInput = {
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string | null;
  domainRating?: number | null;
  relevanceScore?: number | null;
  relAttributes?: string[];
};

export type BacklinkAssessment = {
  sourceDomain: string;
  qualityScore: number;
  riskLevel: "low" | "medium" | "high";
  riskFlags: Array<{ key: string; label: string; detail: string }>;
  evidence: Array<{ label: string; value: string; detail: string }>;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeWebUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function domainFromUrl(value: string) {
  const normalized = normalizeWebUrl(value);
  if (!normalized) return "";
  return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
}

export function assessBacklink(input: BacklinkAssessmentInput): BacklinkAssessment {
  const sourceUrl = normalizeWebUrl(input.sourceUrl);
  const targetUrl = normalizeWebUrl(input.targetUrl);
  const sourceDomain = sourceUrl ? domainFromUrl(sourceUrl) : "";
  const targetDomain = targetUrl ? domainFromUrl(targetUrl) : "";
  const relevance = clamp(input.relevanceScore ?? 50);
  const rating = input.domainRating === null || input.domainRating === undefined
    ? 35
    : clamp(input.domainRating);
  const anchor = (input.anchorText ?? "").trim().toLowerCase();
  const riskFlags: BacklinkAssessment["riskFlags"] = [];

  if (!sourceUrl || !targetUrl) {
    riskFlags.push({ key: "invalid_url", label: "Invalid URL", detail: "The source and target must be valid HTTP or HTTPS pages." });
  }
  if (sourceDomain && sourceDomain === targetDomain) {
    riskFlags.push({ key: "same_domain", label: "Not an external backlink", detail: "Source and target use the same domain." });
  }
  if (sourceUrl?.startsWith("http://")) {
    riskFlags.push({ key: "insecure_source", label: "Insecure source", detail: "The source page does not use HTTPS." });
  }
  if (relevance < 30) {
    riskFlags.push({ key: "low_relevance", label: "Weak topical relevance", detail: "A low-relevance link may add little authority and can look unnatural at scale." });
  }
  if (anchor && /\b(best|cheap|buy|near me|number one|#1)\b/.test(anchor)) {
    riskFlags.push({ key: "optimized_anchor", label: "Aggressive anchor text", detail: "Commercially optimized anchor text should not be repeated across placements." });
  }
  if (input.domainRating !== null && input.domainRating !== undefined && rating < 10) {
    riskFlags.push({ key: "very_low_dr", label: "Very low third-party rating", detail: "DR is directional, but this source deserves closer inspection." });
  }

  const rel = (input.relAttributes ?? []).map((item) => item.toLowerCase());
  const relAdjustment = rel.includes("nofollow") || rel.includes("sponsored") || rel.includes("ugc") ? -5 : 5;
  const penalty = riskFlags.reduce((total, flag) =>
    total + (["invalid_url", "same_domain"].includes(flag.key) ? 35 : 10), 0);
  const qualityScore = clamp(relevance * 0.5 + rating * 0.35 + relAdjustment + 10 - penalty);
  const riskLevel = riskFlags.some((flag) => ["invalid_url", "same_domain"].includes(flag.key))
    ? "high"
    : riskFlags.length >= 2
      ? "medium"
      : "low";

  return {
    sourceDomain,
    qualityScore,
    riskLevel,
    riskFlags,
    evidence: [
      { label: "Topical relevance", value: `${relevance}/100`, detail: "Owner/imported relevance score; verify before relying on it." },
      { label: "Third-party domain rating", value: input.domainRating == null ? "Not supplied" : `${rating}/100`, detail: "Directional vendor metric, not Google authority or revenue." },
      { label: "Calculated link quality", value: `${qualityScore}/100`, detail: "Ferocity screening score based on supplied evidence; not a ranking guarantee." }
    ]
  };
}
