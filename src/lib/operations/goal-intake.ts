import { createHash } from "node:crypto";

export type OperatingGoalIntakeCandidate = {
  goalKey: string;
  goalType: string;
  title: string;
  desiredOutcome: string;
  domainSystem: string;
  priority: "normal" | "high" | "critical";
};

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const CORRECTION_PREFIX = /^(?:actually|correction\s*:?|no\s*[,—-]?\s*(?:i\s+meant|use|make|change|that(?:'s| is)\s+wrong)|i\s+(?:meant|was\s+wrong)|that(?:'s| is)\s+(?:wrong|incorrect)|change\s+(?:that|it)\s+to|instead\s*[,—-]?)/i;

export function isExplicitOperatingGoalCorrection(command: string) {
  return CORRECTION_PREFIX.test(normalize(command));
}

export function correctedOperatingGoalOutcome(command: string) {
  const normalized = normalize(command);
  if (!CORRECTION_PREFIX.test(normalized)) return null;
  const corrected = normalize(normalized.replace(CORRECTION_PREFIX, ""));
  return (corrected || normalized).slice(0, 2_000);
}

export function operatingGoalCandidateFromCommand(command: string): OperatingGoalIntakeCandidate | null {
  const normalized = normalize(command);
  const lower = normalized.toLowerCase();
  if (normalized.length < 12) return null;
  if (/^(show|list|what|why|how|can|could|should|do we|tell me|explain)\b/.test(lower)) return null;
  if (/\b(remind me|set a reminder|what are my goals|show my goals)\b/.test(lower)) return null;

  const persistentSignal = [
    /\bmake sure\b/,
    /\bkeep (?:working|following|handling|pursuing)\b/,
    /\b(?:handle|manage|own|resolve|finish|complete)\b.+\b(?:until|through|completely|resolved|finished|complete)\b/,
    /\bget\b.+\b(?:rent[- ]?ready|occupied|leased|moved in|onboarded|paid|resolved|finished|complete)\b/,
    /\bset\b.+\bup\b.+\b(?:tenant|employee|customer|moved in|onboarded)\b/,
    /\bfill (?:this|the|our|my) vacancy\b/,
  ].some((pattern) => pattern.test(lower));
  if (!persistentSignal) return null;

  const h4r = /\b(property|unit|tenant|rent|lease|vacan|applicant|move.?in|furnace|maintenance|landlord|h4r|homes4rent)\b/.test(lower);
  const collection = /\b(collect|balance|owed|overdue|past due|get paid|rent payment|payment promise)\b/.test(lower);
  const maintenance = /\b(furnace|heat|water|electric|maintenance|repair|broken|work order|unsafe|emergency)\b/.test(lower);
  const leasing = /\b(rent[- ]?ready|occupied|leased|vacan|applicant|showing)\b/.test(lower);
  const onboarding = /\b(onboard|set.+up|move.?in|new tenant)\b/.test(lower);
  const critical = /\b(emergency|unsafe|no heat|flood|fire|gas leak|critical)\b/.test(lower);
  const high = critical || /\b(urgent|today|overdue|past due|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))\b/.test(lower);
  const goalType = maintenance
    ? "maintenance_resolution"
    : collection
      ? "collection_resolution"
      : onboarding
          ? "onboarding_outcome"
        : leasing
          ? "leasing_outcome"
          : "operating_outcome";
  const digest = createHash("sha256").update(lower).digest("hex").slice(0, 32);
  return {
    goalKey: `ask-ferocity:${goalType}:${digest}`,
    goalType,
    title: normalized.slice(0, 240),
    desiredOutcome: normalized.slice(0, 2_000),
    domainSystem: h4r ? "h4r" : "ferocity",
    priority: critical ? "critical" : high ? "high" : "normal",
  };
}

export function operatingGoalCandidateFromPlannedOutcome(input: {
  command: string;
  goalIntent: "one_time" | "persistent";
  goalTitle?: string | null;
  desiredOutcome?: string | null;
  capabilities: string[];
}): OperatingGoalIntakeCandidate | null {
  if (input.goalIntent !== "persistent") return null;
  const desiredOutcome = normalize(input.desiredOutcome || input.command).slice(0, 2_000);
  const title = normalize(input.goalTitle || desiredOutcome).slice(0, 240);
  if (title.length < 3 || desiredOutcome.length < 8) return null;
  const capabilitySet = new Set(input.capabilities);
  const goalType = capabilitySet.has("collections")
    ? "collection_resolution"
    : capabilitySet.has("lead_follow_up") || capabilitySet.has("growth_revenue")
      ? "growth_outcome"
      : capabilitySet.has("jobs_estimates") || capabilitySet.has("schedule_dispatch")
        ? "service_outcome"
        : capabilitySet.has("marketing") || capabilitySet.has("seo") || capabilitySet.has("website")
          ? "marketing_outcome"
          : "operating_outcome";
  const digest = createHash("sha256").update(`${goalType}:${desiredOutcome.toLowerCase()}`).digest("hex").slice(0, 32);
  return {
    goalKey: `ask-ferocity:${goalType}:${digest}`,
    goalType,
    title,
    desiredOutcome,
    domainSystem: "ferocity",
    priority: /\b(urgent|critical|today|immediately|overdue)\b/i.test(input.command) ? "high" : "normal",
  };
}
