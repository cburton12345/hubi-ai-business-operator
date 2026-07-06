import { generateJsonWithProvider } from "@/lib/ai/model-provider";

export type OwnerEventTriageInput = {
  tenantId: string;
  platformKey: string;
  platformName: string;
  eventType: string;
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "open" | "needs_owner" | "critical" | "ai_handled" | "watching" | "resolved" | "archived";
  ownerAttention: boolean;
  aiHandled: boolean;
  recommendedAction?: string;
  actionHref?: string;
  moneyCents: number;
  riskType?: "revenue" | "financial" | "customer" | "legal" | "safety" | "automation" | "low_confidence" | "approval";
  confidenceScore: number;
  metadata: Record<string, unknown>;
};

export type OwnerEventTriageDecision = {
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "open" | "needs_owner" | "critical" | "ai_handled" | "watching";
  ownerAttention: boolean;
  aiHandled: boolean;
  aiSummary: string;
  recommendedAction: string;
  riskType: "revenue" | "financial" | "customer" | "legal" | "safety" | "automation" | "low_confidence" | "approval" | null;
  confidenceScore: number;
  moneyCents: number;
  escalationReasons: string[];
  makeMoneyNext: boolean;
  liveActionAllowed: boolean;
  decisionStatus: "completed" | "fallback";
};

const severityRank: Record<OwnerEventTriageDecision["severity"], number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function clampScore(value: unknown, fallback: number) {
  const score = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(0, Math.min(100, score));
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function inferRiskType(input: OwnerEventTriageInput): OwnerEventTriageDecision["riskType"] {
  if (input.riskType) return input.riskType;
  const text = `${input.platformName} ${input.eventType} ${input.title} ${input.summary}`.toLowerCase();
  if (hasAny(text, ["safety", "injury", "incident", "emergency", "guardian"])) return "safety";
  if (hasAny(text, ["legal", "contract", "lawsuit", "compliance", "deadline"])) return "legal";
  if (hasAny(text, ["complaint", "dispute", "refund", "angry", "negative review"])) return "customer";
  if (hasAny(text, ["failed", "failure", "error", "webhook", "credential", "automation"])) return "automation";
  if (hasAny(text, ["invoice", "payment", "stripe", "overdue", "cash"])) return "financial";
  if (input.moneyCents > 0 || hasAny(text, ["lead", "quote", "estimate", "opportunity", "bid", "revenue"])) return "revenue";
  if (hasAny(text, ["approve", "approval", "review", "publish", "send"])) return "approval";
  if (input.confidenceScore < 60) return "low_confidence";
  return null;
}

function fallbackDecision(input: OwnerEventTriageInput): OwnerEventTriageDecision {
  const riskType = inferRiskType(input);
  const escalationReasons: string[] = [];
  if (input.moneyCents > 0 || riskType === "revenue") escalationReasons.push("revenue_opportunity");
  if (riskType === "financial") escalationReasons.push("money_at_risk");
  if (riskType === "customer") escalationReasons.push("customer_dispute_or_reputation");
  if (riskType === "legal") escalationReasons.push("legal_or_compliance");
  if (riskType === "safety") escalationReasons.push("safety");
  if (riskType === "automation") escalationReasons.push("automation_failed");
  if (riskType === "approval") escalationReasons.push("approval_required");
  if (input.confidenceScore < 60 || riskType === "low_confidence") escalationReasons.push("low_confidence");

  const ownerAttention =
    input.ownerAttention ||
    input.status === "needs_owner" ||
    input.status === "critical" ||
    input.severity === "critical" ||
    escalationReasons.length > 0;

  const severity: OwnerEventTriageDecision["severity"] =
    input.severity === "critical" || riskType === "safety" || riskType === "legal"
      ? "critical"
      : input.severity === "high" || ownerAttention || input.moneyCents > 0
        ? "high"
        : input.severity;

  return {
    severity,
    status: ownerAttention ? (severity === "critical" ? "critical" : "needs_owner") : input.aiHandled ? "ai_handled" : "watching",
    ownerAttention,
    aiHandled: input.aiHandled && !ownerAttention,
    aiSummary: input.aiHandled
      ? "AI marked this item handled based on incoming system data."
      : "AI triage classified this event and kept live action gated until review.",
    recommendedAction: input.recommendedAction || recommendedActionForRisk(riskType, input.moneyCents),
    riskType,
    confidenceScore: Math.min(input.confidenceScore || 80, ownerAttention ? 88 : 92),
    moneyCents: Math.max(0, input.moneyCents),
    escalationReasons,
    makeMoneyNext: input.moneyCents > 0 || riskType === "revenue",
    liveActionAllowed: false,
    decisionStatus: "fallback"
  };
}

function recommendedActionForRisk(riskType: OwnerEventTriageDecision["riskType"], moneyCents: number) {
  if (riskType === "safety") return "Review immediately and decide the escalation path before automation continues.";
  if (riskType === "legal") return "Review legal/compliance context and make a go/no-go decision before any external response.";
  if (riskType === "customer") return "Review the customer facts, preserve the audit trail, and approve a careful response.";
  if (riskType === "automation") return "Check the failed automation, credentials, and retry path before marking handled.";
  if (riskType === "financial") return "Open the related money record and decide whether to collect, reconcile, or escalate.";
  if (moneyCents > 0 || riskType === "revenue") return "Open the revenue opportunity and move the next money step forward.";
  if (riskType === "approval") return "Review the draft or proposed action before Ferocity executes anything live.";
  return "Keep watching unless new money, risk, approval, or customer context arrives.";
}

function normalizeDecision(input: OwnerEventTriageInput, candidate: Record<string, unknown>): OwnerEventTriageDecision {
  const fallback = fallbackDecision(input);
  const severity = typeof candidate.severity === "string" && candidate.severity in severityRank
    ? (candidate.severity as OwnerEventTriageDecision["severity"])
    : fallback.severity;
  const status =
    candidate.status === "open" ||
    candidate.status === "needs_owner" ||
    candidate.status === "critical" ||
    candidate.status === "ai_handled" ||
    candidate.status === "watching"
      ? candidate.status
      : fallback.status;
  const riskType =
    candidate.riskType === "revenue" ||
    candidate.riskType === "financial" ||
    candidate.riskType === "customer" ||
    candidate.riskType === "legal" ||
    candidate.riskType === "safety" ||
    candidate.riskType === "automation" ||
    candidate.riskType === "low_confidence" ||
    candidate.riskType === "approval"
      ? candidate.riskType
      : fallback.riskType;

  const escalationReasons = Array.isArray(candidate.escalationReasons)
    ? candidate.escalationReasons.filter((item): item is string => typeof item === "string").slice(0, 8)
    : fallback.escalationReasons;

  const ownerAttention =
    Boolean(candidate.ownerAttention) ||
    fallback.ownerAttention ||
    status === "needs_owner" ||
    status === "critical" ||
    severity === "critical";

  return {
    severity: severityRank[severity] < severityRank[fallback.severity] ? fallback.severity : severity,
    status: ownerAttention ? (severity === "critical" || fallback.severity === "critical" ? "critical" : "needs_owner") : status,
    ownerAttention,
    aiHandled: Boolean(candidate.aiHandled) && !ownerAttention,
    aiSummary: typeof candidate.aiSummary === "string" && candidate.aiSummary.trim() ? candidate.aiSummary.trim().slice(0, 1200) : fallback.aiSummary,
    recommendedAction:
      typeof candidate.recommendedAction === "string" && candidate.recommendedAction.trim()
        ? candidate.recommendedAction.trim().slice(0, 1200)
        : fallback.recommendedAction,
    riskType,
    confidenceScore: clampScore(candidate.confidenceScore, fallback.confidenceScore),
    moneyCents: Math.max(fallback.moneyCents, typeof candidate.moneyCents === "number" ? Math.round(candidate.moneyCents) : fallback.moneyCents),
    escalationReasons,
    makeMoneyNext: Boolean(candidate.makeMoneyNext) || fallback.makeMoneyNext,
    liveActionAllowed: false,
    decisionStatus: "completed"
  };
}

export async function triageOwnerEvent(input: OwnerEventTriageInput): Promise<OwnerEventTriageDecision> {
  const fallback = fallbackDecision(input);
  const decision = await generateJsonWithProvider<Record<string, unknown>>({
    tenantId: input.tenantId,
    runType: "owner_command_event_triage",
    system:
      "You are Ferocity's AI Chief of Staff. Triage owner events for a production business operations platform. Escalate only for money at risk, revenue opportunity, customer dispute, legal/compliance, safety, automation failure, low confidence, or owner approval. Never allow live destructive or external actions from triage. Return strict JSON only.",
    user: JSON.stringify({
      event: input,
      requiredShape: {
        severity: "info|low|medium|high|critical",
        status: "open|needs_owner|critical|ai_handled|watching",
        ownerAttention: "boolean",
        aiHandled: "boolean",
        aiSummary: "short owner-facing explanation",
        recommendedAction: "plain next step",
        riskType: "revenue|financial|customer|legal|safety|automation|low_confidence|approval|null",
        confidenceScore: "0-100",
        moneyCents: "integer",
        escalationReasons: "string[]",
        makeMoneyNext: "boolean",
        liveActionAllowed: false
      }
    }),
    fallback
  });

  return normalizeDecision(input, decision);
}
