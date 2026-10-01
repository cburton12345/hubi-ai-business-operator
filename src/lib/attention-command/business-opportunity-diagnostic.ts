export type OpportunityUrgency = "critical" | "high" | "medium" | "low";
export type OpportunityHandling = "ferocity_can_prepare" | "owner_decision" | "connection_required" | "monitor";

export type OpportunityCandidate = {
  title: string;
  detail: string;
  href: string;
  urgency: OpportunityUrgency;
  evidence: string;
  confidence: number;
  handling: OpportunityHandling;
  valueCents?: number;
};

export type BusinessOpportunity = OpportunityCandidate & {
  priorityScore: number;
};

export type BusinessOpportunityBrief = {
  headline: string;
  summary: string;
  discoveredCount: number;
  mattersNowCount: number;
  ferocityCanPrepareCount: number;
  ownerDecisionCount: number;
  connectionRequiredCount: number;
  focusNow: BusinessOpportunity[];
  all: BusinessOpportunity[];
};

const urgencyWeight: Record<OpportunityUrgency, number> = {
  critical: 100,
  high: 72,
  medium: 46,
  low: 20
};

const handlingWeight: Record<OpportunityHandling, number> = {
  owner_decision: 12,
  ferocity_can_prepare: 9,
  connection_required: 7,
  monitor: 0
};

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function score(candidate: OpportunityCandidate) {
  const moneyWeight = candidate.valueCents ? Math.min(20, Math.round(candidate.valueCents / 50_000)) : 0;
  return urgencyWeight[candidate.urgency] + handlingWeight[candidate.handling] + Math.round(boundedConfidence(candidate.confidence) / 10) + moneyWeight;
}

export function buildBusinessOpportunityBrief(candidates: OpportunityCandidate[]): BusinessOpportunityBrief {
  const unique = candidates
    .filter((candidate) => candidate.title.trim() && candidate.detail.trim() && candidate.href.startsWith("/"))
    .filter((candidate, index, list) => list.findIndex((item) => item.title === candidate.title && item.href === candidate.href) === index)
    .map((candidate) => ({
      ...candidate,
      confidence: boundedConfidence(candidate.confidence),
      priorityScore: score(candidate)
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.confidence - a.confidence || a.title.localeCompare(b.title));

  const actionable = unique.filter((item) => item.handling !== "monitor");
  const mattersNow = actionable.filter((item) => item.urgency === "critical" || item.urgency === "high");
  const focusNow = (mattersNow.length ? mattersNow : actionable).slice(0, 3);
  const ferocityCanPrepareCount = actionable.filter((item) => item.handling === "ferocity_can_prepare").length;
  const ownerDecisionCount = actionable.filter((item) => item.handling === "owner_decision").length;
  const connectionRequiredCount = actionable.filter((item) => item.handling === "connection_required").length;

  return {
    headline: unique.length
      ? `Ferocity found ${unique.length} evidence-backed ${unique.length === 1 ? "opportunity" : "opportunities"}.`
      : "Ferocity has not found a verified bottleneck yet.",
    summary: unique.length
      ? `${focusNow.length} ${focusNow.length === 1 ? "matters" : "matter"} first. Ferocity can prepare ${ferocityCanPrepareCount}; ${ownerDecisionCount} ${ownerDecisionCount === 1 ? "needs" : "need"} an owner decision${connectionRequiredCount ? `; ${connectionRequiredCount} ${connectionRequiredCount === 1 ? "needs" : "need"} a connection` : ""}.`
      : "Connect a relevant source or let Ferocity observe new activity before it makes a stronger claim.",
    discoveredCount: unique.length,
    mattersNowCount: focusNow.length,
    ferocityCanPrepareCount,
    ownerDecisionCount,
    connectionRequiredCount,
    focusNow,
    all: unique
  };
}
