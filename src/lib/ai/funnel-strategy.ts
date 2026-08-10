export type FunnelCreativeAngle = {
  angle: string;
  hook: string;
  cta: string;
};

export type FunnelStrategyPlan = {
  funnelName: string;
  positioning: string;
  headline: string;
  shortDemoHook: string;
  qualificationQuestions: string[];
  followUpPlan: string[];
  trackingPlan: string[];
  creativeAngles: FunnelCreativeAngle[];
  safetyChecks: string[];
  recommendedNextAction: string;
  [key: string]: unknown;
};

function boundedString(value: unknown, fallback: string, max = 1200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function boundedStringArray(value: unknown, fallback: string[], maxItems = 12) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, 800))
    .slice(0, maxItems);
  return items.length ? items : fallback;
}

function creativeAngles(value: unknown, fallback: FunnelCreativeAngle[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.angle !== "string" || typeof candidate.hook !== "string" || typeof candidate.cta !== "string") return [];
    if (!candidate.angle.trim() || !candidate.hook.trim() || !candidate.cta.trim()) return [];
    return [{
      angle: candidate.angle.trim().slice(0, 160),
      hook: candidate.hook.trim().slice(0, 800),
      cta: candidate.cta.trim().slice(0, 300)
    }];
  }).slice(0, 12);
  return items.length ? items : fallback;
}

export function normalizeFunnelStrategy(candidate: unknown, fallback: FunnelStrategyPlan): FunnelStrategyPlan {
  const value = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
  return {
    funnelName: boundedString(value.funnelName, fallback.funnelName, 240),
    positioning: boundedString(value.positioning, fallback.positioning),
    headline: boundedString(value.headline, fallback.headline, 300),
    shortDemoHook: boundedString(value.shortDemoHook, fallback.shortDemoHook, 600),
    qualificationQuestions: boundedStringArray(value.qualificationQuestions, fallback.qualificationQuestions),
    followUpPlan: boundedStringArray(value.followUpPlan, fallback.followUpPlan),
    trackingPlan: boundedStringArray(value.trackingPlan, fallback.trackingPlan),
    creativeAngles: creativeAngles(value.creativeAngles, fallback.creativeAngles),
    safetyChecks: boundedStringArray(value.safetyChecks, fallback.safetyChecks),
    recommendedNextAction: boundedString(value.recommendedNextAction, fallback.recommendedNextAction)
  };
}
