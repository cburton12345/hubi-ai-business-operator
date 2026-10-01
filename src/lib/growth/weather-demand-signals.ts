export type NwsAlertFeature = {
  id?: string;
  properties?: {
    id?: string;
    event?: string;
    headline?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    areaDesc?: string;
    effective?: string;
    onset?: string;
    expires?: string;
    ends?: string;
    instruction?: string;
    description?: string;
    web?: string;
  };
};

export type NormalizedWeatherAlert = {
  externalId: string;
  eventName: string;
  headline: string;
  severity: string;
  certainty: string;
  urgency: string;
  areaDescription: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  sourceUrl: string;
  serviceRelevanceScore: number;
  sourcePayload: Record<string, unknown>;
};

const ROOFING_EVENTS = [
  "severe thunderstorm",
  "tornado",
  "hail",
  "high wind",
  "extreme wind",
  "hurricane",
  "tropical storm",
  "ice storm",
  "winter storm",
  "blizzard"
];

const DAMAGE_TERMS = ["hail", "damaging wind", "wind damage", "tornado", "hurricane", "roof", "debris"];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function serviceRelevance(eventName: string, headline: string, description: string) {
  const combined = `${eventName} ${headline} ${description}`.toLowerCase();
  if (!ROOFING_EVENTS.some((term) => combined.includes(term))) return 0;
  let score = 55;
  if (DAMAGE_TERMS.some((term) => combined.includes(term))) score += 20;
  if (/warning|emergency/i.test(eventName)) score += 15;
  if (/watch|advisory/i.test(eventName)) score += 5;
  return bounded(score);
}

export function normalizeNwsAlert(feature: NwsAlertFeature): NormalizedWeatherAlert | null {
  const properties = feature.properties ?? {};
  const externalId = clean(properties.id) || clean(feature.id);
  const eventName = clean(properties.event);
  if (!externalId || !eventName) return null;
  const headline = clean(properties.headline);
  const description = clean(properties.description);
  const relevance = serviceRelevance(eventName, headline, description);
  if (relevance === 0) return null;

  return {
    externalId,
    eventName,
    headline,
    severity: clean(properties.severity) || "Unknown",
    certainty: clean(properties.certainty) || "Unknown",
    urgency: clean(properties.urgency) || "Unknown",
    areaDescription: clean(properties.areaDesc),
    effectiveAt: clean(properties.onset) || clean(properties.effective) || null,
    expiresAt: clean(properties.ends) || clean(properties.expires) || null,
    sourceUrl: clean(properties.web) || externalId,
    serviceRelevanceScore: relevance,
    sourcePayload: {
      instruction: clean(properties.instruction) || null,
      description: description || null
    }
  };
}

export function alertMatchesTextServiceArea(alertArea: string, city: string, serviceAreaName: string) {
  const haystack = alertArea.toLowerCase();
  const candidates = [city, serviceAreaName]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 3);
  return candidates.some((value) => haystack.includes(value));
}

export function classifyWeatherDemand(input: {
  alert: NormalizedWeatherAlert;
  recentStormLeads: number;
  baselineDailyStormLeads: number;
}) {
  const threshold = Math.max(2, Math.ceil(input.baselineDailyStormLeads * 2));
  const demandCorroborated = input.recentStormLeads >= threshold;
  const severityBonus = /extreme|severe/i.test(input.alert.severity) ? 15 : /moderate/i.test(input.alert.severity) ? 8 : 0;
  const certaintyBonus = /observed|likely/i.test(input.alert.certainty) ? 10 : 0;
  const demandConfidenceScore = demandCorroborated
    ? bounded(55 + Math.min(25, (input.recentStormLeads - threshold + 1) * 8) + certaintyBonus)
    : 0;
  const opportunityScore = bounded(input.alert.serviceRelevanceScore * 0.65 + severityBonus + demandConfidenceScore * 0.35);

  return {
    demandCorroborated,
    signalStatus: demandCorroborated ? "demand_corroborated" as const : "weather_only" as const,
    demandConfidenceScore,
    opportunityScore,
    evidence: {
      recentStormLeads: input.recentStormLeads,
      baselineDailyStormLeads: Number(input.baselineDailyStormLeads.toFixed(2)),
      corroborationThreshold: threshold,
      claimAllowed: demandCorroborated ? "storm_related_demand_is_rising" : "severe_weather_opportunity_only"
    }
  };
}
