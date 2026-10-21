import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { independentReviewerConfigured } from "@/lib/ai/model-routing";
import {
  independentReviewRequirements,
  type IndependentReviewDomain,
} from "@/lib/ai/independent-review-policy";
import type { FerocityCommandUnderstanding } from "@/lib/ai-workforce/command-understanding";

export type FerocityCommandPlanReview = {
  domain: IndependentReviewDomain;
  tier: "standard" | "important" | "critical";
  status: "not_required" | "passed" | "disagreed" | "reviewer_unavailable";
  issues: string[];
  humanReviewRequired: boolean;
};

export type FerocityReviewEvidence = {
  key: string;
  status: "verified" | "empty" | "unavailable";
  summary?: string;
};

export function reviewDomainForFerocityCommand(command: string): IndependentReviewDomain {
  const lower = command.toLowerCase();
  if (/\b(tax|deduct|irs|return filing)\b/.test(lower)) return "tax";
  if (/\b(payroll|paycheck|wage|withholding)\b/.test(lower)) return "payroll";
  if (/\b(pay|payment|refund|charge|bank|transfer money|payout)\b/.test(lower)) return "payment";
  if (/\b(lease|evict|legal|law|compliance|contract|attestation)\b/.test(lower)) return "legal_compliance";
  if (/\b(fire|gas leak|electrical hazard|unsafe|injury|no heat|flood)\b/.test(lower)) return "safety";
  if (/\b(ad spend|advertising budget|launch ads|paid (?:ad )?campaign)\b/.test(lower)) return "advertising_spend";
  if (/\b(delete|erase|remove permanently|void|cancel)\b/.test(lower)) return "destructive_change";
  if (/\b(publish|post publicly|go live)\b/.test(lower)) return "public_publishing";
  if (/\b(send|email|text|message|call customer)\b/.test(lower)) return "customer_communication";
  if (/\b(receipt|expense|statement|invoice|financial report)\b/.test(lower)) return "financial_document";
  return "routine";
}

export function deterministicCommandPlanReviewIssues(input: {
  domain: IndependentReviewDomain;
  understanding: FerocityCommandUnderstanding;
  evidence: FerocityReviewEvidence[];
}) {
  const requirements = independentReviewRequirements(input.domain);
  if (!requirements.deterministicChecksRequired) return [];
  const issues: string[] = [];
  if (input.understanding.planningAiStatus !== "completed") {
    issues.push("The primary action plan used fallback behavior rather than a completed model result.");
  }
  if (input.understanding.minimumRequiredContext.length > 0) {
    issues.push("The plan still declares required context that has not been supplied.");
  }
  const evidenceRequired = input.understanding.requestedMode !== "read_only";
  if (evidenceRequired && input.evidence.length === 0) {
    issues.push("No authoritative workspace evidence was supplied for this consequential plan.");
  } else if (evidenceRequired && input.evidence.every((item) => item.status === "unavailable")) {
    issues.push("Authoritative workspace evidence was unavailable for this consequential plan.");
  }
  return issues;
}

export async function independentlyReviewFerocityCommandPlan(input: {
  tenantId: string;
  userId?: string | null;
  command: string;
  understanding: FerocityCommandUnderstanding;
  evidence?: FerocityReviewEvidence[];
}): Promise<FerocityCommandPlanReview> {
  const domain = reviewDomainForFerocityCommand(input.command);
  const requirements = independentReviewRequirements(domain);
  const deterministicIssues = deterministicCommandPlanReviewIssues({
    domain,
    understanding: input.understanding,
    evidence: input.evidence ?? [],
  });
  if (!requirements.independentModelRequired) {
    return { domain, tier: requirements.tier, status: "not_required", issues: [], humanReviewRequired: false };
  }
  if (!independentReviewerConfigured({ primaryRunType: "ferocity_command_understanding", requestType: "json" })) {
    return {
      domain,
      tier: requirements.tier,
      status: "reviewer_unavailable",
      issues: [...deterministicIssues, "The independently configured reviewer model is unavailable."],
      humanReviewRequired: requirements.humanApprovalRequired,
    };
  }
  const fallback = { status: "reviewer_unavailable", issues: ["Independent review did not return a valid result."], humanReviewRequired: requirements.humanApprovalRequired };
  const raw = await generateJsonWithAiService({
    tenantId: input.tenantId,
    userId: input.userId,
    featureKey: "ai_generation",
    runType: "independent_review_ferocity_command_plan",
    temperature: 0.05,
    timeoutMs: 20_000,
    system: `Independently review an AI business-agent interpretation before work proceeds. The risk domain is ${domain} and tier is ${requirements.tier}. Check whether the answer and planned actions are grounded in the owner's exact request, avoid unsupported factual/legal/tax/financial conclusions, preserve approvals, and request human review where required. Deterministic issues are authoritative blockers: never return passed while any deterministic issue exists. Do not create new work. Return JSON with status (passed or disagreed), issues (array of concise strings), and humanReviewRequired (boolean).`,
    user: JSON.stringify({
      command: input.command,
      interpretation: input.understanding,
      requirements,
      deterministicIssues,
      evidence: input.evidence ?? [],
    }),
    fallback,
    metadata: { source: "ask_ferocity", domain, tier: requirements.tier },
  });
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const modelStatus = record.status === "passed" || record.status === "disagreed" ? record.status : "reviewer_unavailable";
  const modelIssues = Array.isArray(record.issues)
    ? record.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 300)).slice(0, 8)
    : [];
  const issues = [...new Set([...deterministicIssues, ...modelIssues])].slice(0, 12);
  const status = deterministicIssues.length ? "disagreed" : modelStatus;
  return {
    domain,
    tier: requirements.tier,
    status,
    issues,
    humanReviewRequired: requirements.humanApprovalRequired || record.humanReviewRequired === true || status === "disagreed",
  };
}
