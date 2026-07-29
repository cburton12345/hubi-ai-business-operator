import type { ConstructionDailyRiskFlag } from "./job-health";

export type ConstructionFieldLogDraft = {
  summary: string;
  progressSummary: string;
  delaySummary: string;
  materialSummary: string;
  safetySummary: string;
  conflictSummary: string;
  weatherSummary: string;
  customerUpdateDraft: string;
  confidence: "low" | "medium" | "high";
  riskFlags: ConstructionDailyRiskFlag[];
  suggestedActions: string[];
  assumptions: string[];
  missingInformation: string[];
};

const categories = ["money", "schedule", "procurement", "change", "safety", "information"] as const;
const severities = ["low", "medium", "high", "critical"] as const;

function includesAny(note: string, terms: string[]) {
  return terms.some((term) => note.includes(term));
}

function oneLine(value: unknown, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function stringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => oneLine(item)).filter(Boolean).slice(0, limit);
}

function riskList(value: unknown): ConstructionDailyRiskFlag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const category = oneLine(row.category, "information") as ConstructionDailyRiskFlag["category"];
    const severity = oneLine(row.severity, "medium") as ConstructionDailyRiskFlag["severity"];
    if (!categories.includes(category) || !severities.includes(severity)) return [];
    return [{
      category,
      severity,
      title: oneLine(row.title, "Field note needs review"),
      detail: oneLine(row.detail, "Confirm the original field note before acting.")
    }];
  }).slice(0, 8);
}

export function createConstructionFieldLogFallback(rawNote: string): ConstructionFieldLogDraft {
  const note = rawNote.trim();
  const lower = note.toLowerCase();
  const riskFlags: ConstructionDailyRiskFlag[] = [];
  const suggestedActions: string[] = [];

  const progress = includesAny(lower, ["finished", "completed", "installed", "passed", "done", "started"]);
  const delay = includesAny(lower, ["late", "delay", "delayed", "waiting", "missed", "behind", "couldn't", "could not"]);
  const procurement = includesAny(lower, ["delivery", "material", "materials", "supplier", "backorder", "stockout", "missing parts"]);
  const conflict = includesAny(lower, ["conflict", "blocked", "doesn't fit", "does not fit", "mismatch", "rfi"]);
  const change = includesAny(lower, ["extra work", "change order", "hidden", "additional", "not in scope", "unforeseen"]);
  const safety = includesAny(lower, ["unsafe", "injury", "injured", "accident", "hazard", "fall", "ppe"]);
  const weather = includesAny(lower, ["rain", "snow", "wind", "weather", "heat", "storm", "freeze"]);

  if (safety) {
    riskFlags.push({
      category: "safety",
      severity: includesAny(lower, ["injury", "injured", "accident", "fall"]) ? "critical" : "high",
      title: "Possible safety issue reported",
      detail: "The field note contains safety-related language. A qualified person must confirm the facts and response."
    });
    suggestedActions.push("Stop affected work if needed and have the responsible safety lead review the original note immediately.");
  }
  if (change) {
    riskFlags.push({
      category: "change",
      severity: "high",
      title: "Possible unpriced scope change",
      detail: "The note may describe extra, hidden, additional, or out-of-scope work."
    });
    suggestedActions.push("Confirm scope, price, authorization, and schedule impact before continuing changed work.");
  }
  if (delay || weather) {
    riskFlags.push({
      category: "schedule",
      severity: conflict ? "high" : "medium",
      title: "Possible schedule impact",
      detail: "The note mentions a delay, blocker, missed event, or weather condition that may affect completion."
    });
    suggestedActions.push("Confirm the blocker, responsible person, and next achievable date.");
  }
  if (procurement && includesAny(lower, ["late", "backorder", "missing", "waiting", "stockout"])) {
    riskFlags.push({
      category: "procurement",
      severity: "high",
      title: "Material or delivery risk",
      detail: "The note may describe a late, missing, unavailable, or backordered material."
    });
    suggestedActions.push("Confirm supplier status, required quantity, substitute options, and job impact.");
  }
  if (conflict) {
    riskFlags.push({
      category: "information",
      severity: "high",
      title: "Field conflict needs resolution",
      detail: "The note describes a blocker, mismatch, or trade conflict that needs a verified decision."
    });
    suggestedActions.push("Document the location and affected trades, then assign the conflict for review.");
  }

  return {
    summary: oneLine(note, "Field note submitted for review."),
    progressSummary: progress ? "The note reports work progress or completion; confirm quantities and location." : "",
    delaySummary: delay ? "The note may describe a delay or missed event; confirm schedule impact." : "",
    materialSummary: procurement ? "The note mentions materials or a delivery; confirm quantity, cost, and job assignment." : "",
    safetySummary: safety ? "Possible safety information requires immediate qualified human review." : "",
    conflictSummary: conflict ? "A field conflict or blocker may require coordination." : "",
    weatherSummary: weather ? "Weather may have affected field work; confirm duration and schedule impact." : "",
    customerUpdateDraft: progress
      ? "Work progressed today. We are reviewing the field report and will confirm any schedule or scope impact before sending an update."
      : "We received today's field report and are reviewing progress, schedule, and any items that need follow-up.",
    confidence: "low",
    riskFlags,
    suggestedActions,
    assumptions: ["Keyword-based fallback was used; no fact has been independently verified."],
    missingInformation: ["Exact location, quantities, responsible people, and schedule/cost impact may still be needed."]
  };
}

export function normalizeConstructionFieldLogDraft(
  value: Record<string, unknown>,
  fallback: ConstructionFieldLogDraft
): ConstructionFieldLogDraft {
  const confidence = oneLine(value.confidence, fallback.confidence);
  const generatedRisks = riskList(value.riskFlags);
  const riskFlags = [...fallback.riskFlags, ...generatedRisks].filter(
    (risk, index, all) => all.findIndex((other) => other.category === risk.category && other.title === risk.title) === index
  ).slice(0, 8);
  const suggestedActions = [...fallback.suggestedActions, ...stringList(value.suggestedActions)]
    .filter((action, index, all) => all.indexOf(action) === index)
    .slice(0, 8);
  return {
    summary: oneLine(value.summary, fallback.summary),
    progressSummary: oneLine(value.progressSummary, fallback.progressSummary),
    delaySummary: oneLine(value.delaySummary, fallback.delaySummary),
    materialSummary: oneLine(value.materialSummary, fallback.materialSummary),
    safetySummary: oneLine(value.safetySummary, fallback.safetySummary),
    conflictSummary: oneLine(value.conflictSummary, fallback.conflictSummary),
    weatherSummary: oneLine(value.weatherSummary, fallback.weatherSummary),
    customerUpdateDraft: oneLine(value.customerUpdateDraft, fallback.customerUpdateDraft),
    confidence: ["low", "medium", "high"].includes(confidence)
      ? confidence as ConstructionFieldLogDraft["confidence"]
      : fallback.confidence,
    riskFlags,
    suggestedActions,
    assumptions: stringList(value.assumptions).length ? stringList(value.assumptions) : fallback.assumptions,
    missingInformation: stringList(value.missingInformation).length
      ? stringList(value.missingInformation)
      : fallback.missingInformation
  };
}
