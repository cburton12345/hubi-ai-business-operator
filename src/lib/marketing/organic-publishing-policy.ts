export type OrganicPublishingPlan = "starter" | "growth" | "operator" | "managed_operator" | "pro_agency" | string;

export type OrganicQualityInput = {
  title?: string | null;
  body: string;
  sourceFactCount: number;
  approvedAssetCount?: number;
  requiresVisual?: boolean;
  claimsVerified?: boolean;
  urgencyVerified?: boolean;
  recentBodies?: string[];
};

export type OrganicQualityResult = {
  status: "passed" | "needs_edit" | "blocked";
  score: number;
  scores: {
    usefulness: number;
    relevance: number;
    originality: number;
    factualGrounding: number;
    conversionClarity: number;
    ethicalPersuasion: number;
  };
  riskFlags: string[];
};

const genericPhrases = [
  "unlock your potential",
  "take your business to the next level",
  "in today's fast-paced world",
  "game-changing solution",
  "we are thrilled to announce",
  "don't miss out",
  "revolutionize your business"
];

const unsupportedClaim = /\b(guarantee(?:d|s)?|best|#1|number one|always|never|100%|\d+%|\$\d[\d,]*)\b/i;
const manufacturedUrgency = /\b(act now|before it'?s too late|last chance|only \d+ (?:spots?|units?|appointments?) left|won'?t last|ending (?:today|tonight))\b/i;
const coerciveLanguage = /\b(you(?:'d| would) be (?:crazy|stupid)|smart (?:owners|businesses) already|don'?t be left behind|everyone is doing it|your competitors are laughing|what are you waiting for)\b/i;

function words(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 3));
}

function similarity(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

export function includedOrganicPublishingMoments(planKey: OrganicPublishingPlan) {
  if (planKey === "starter") return 2;
  if (planKey === "growth") return 4;
  if (planKey === "operator" || planKey === "managed_operator") return 7;
  if (planKey === "pro_agency") return 14;
  return 0;
}

export function evaluateOrganicContentQuality(input: OrganicQualityInput): OrganicQualityResult {
  const body = input.body.trim();
  const combined = `${input.title ?? ""} ${body}`.trim();
  const riskFlags: string[] = [];
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const genericCount = genericPhrases.filter((phrase) => combined.toLowerCase().includes(phrase)).length;
  const maxSimilarity = Math.max(0, ...(input.recentBodies ?? []).map((recent) => similarity(body, recent)));

  if (wordCount < 18) riskFlags.push("thin_content");
  if (input.sourceFactCount < 1) riskFlags.push("no_business_source");
  if (genericCount > 0) riskFlags.push("generic_ai_language");
  if (maxSimilarity >= 0.72) riskFlags.push("repetitive_content");
  if (unsupportedClaim.test(combined) && !input.claimsVerified) riskFlags.push("unsupported_claim");
  if (manufacturedUrgency.test(combined) && !input.urgencyVerified) riskFlags.push("manufactured_urgency");
  if (coerciveLanguage.test(combined)) riskFlags.push("coercive_persuasion");
  if (input.requiresVisual && (input.approvedAssetCount ?? 0) < 1) riskFlags.push("missing_approved_visual");

  const usefulness = Math.max(20, Math.min(100, 45 + Math.min(wordCount, 80) + input.sourceFactCount * 8));
  const relevance = input.sourceFactCount > 0 ? Math.min(100, 68 + input.sourceFactCount * 8) : 25;
  const originality = Math.max(10, Math.round(100 - maxSimilarity * 100 - genericCount * 22));
  const factualGrounding = input.sourceFactCount > 0 ? (input.claimsVerified === false ? 58 : Math.min(100, 72 + input.sourceFactCount * 7)) : 15;
  const conversionClarity = /\b(call|book|schedule|reply|visit|learn|ask|download|get|request|see)\b/i.test(body) ? 88 : 62;
  const ethicalPersuasion = riskFlags.some((flag) => ["manufactured_urgency", "coercive_persuasion"].includes(flag)) ? 10 : 100;
  const score = Math.round((usefulness + relevance + originality + factualGrounding + conversionClarity + ethicalPersuasion) / 6);
  const hardBlock = riskFlags.some((flag) => ["no_business_source", "unsupported_claim", "manufactured_urgency", "coercive_persuasion"].includes(flag));

  return {
    status: hardBlock ? "blocked" : score >= 80 && riskFlags.length === 0 ? "passed" : "needs_edit",
    score,
    scores: { usefulness, relevance, originality, factualGrounding, conversionClarity, ethicalPersuasion },
    riskFlags
  };
}

export function organicPublishingAllowance(input: { planKey: OrganicPublishingPlan; usedMomentKeys: Array<string | null | undefined> }) {
  const limit = includedOrganicPublishingMoments(input.planKey);
  const used = new Set(input.usedMomentKeys.filter((key): key is string => Boolean(key))).size;
  return { limit, used, remaining: Math.max(0, limit - used), allowed: used < limit };
}
