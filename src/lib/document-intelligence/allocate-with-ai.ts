import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { suggestAllocations } from "./allocate";
import { confidence } from "./normalize";
import type { AllocationSuggestion, AllocationTarget, NormalizedExpenseDocument } from "./types";

export async function suggestAllocationsWithAi(input: {
  workspaceId: string;
  userId?: string | null;
  document: NormalizedExpenseDocument;
  targets: AllocationTarget[];
}): Promise<AllocationSuggestion[]> {
  const fallback = suggestAllocations(input.document, input.targets);
  if (!input.targets.length) return fallback;
  const fallbackConfidence = fallback.length ? Math.max(...fallback.map((item) => item.confidence)) : 0;
  const ambiguousAllocation = fallback.length > 1 || fallbackConfidence < 0.75;
  const candidateMap = new Map(input.targets.map((target) => [`${target.type}|${target.ref ?? ""}`, target]));
  try {
    const parsed = await generateJsonWithAiService<{ suggestions: Record<string, unknown>[] }>({
      tenantId: input.workspaceId,
      userId: input.userId,
      featureKey: "expense_document_intelligence",
      // Most obvious matches stay on the balanced lane. Ambiguous multi-target
      // decisions are the part worth escalating to the frontier model.
      runType: ambiguousAllocation ? "expense_allocation_reasoning_advanced" : "expense_allocation_reasoning",
      aiCategory: "core",
      temperature: 0.05,
      system: "Allocate an expense document only to candidate business entities supplied by the consuming application. Return JSON only. Never invent an entity or ID. Prefer one target when evidence is clear; suggest multiple only when the document genuinely spans them.",
      user: JSON.stringify({
        instruction: "Return suggestions with target_key, confidence 0-1, rationale, and allocation_percent. Percentages must total 100 when multiple targets are returned.",
        document: input.document,
        candidates: input.targets.slice(0, 250).map((target) => ({
          target_key: `${target.type}|${target.ref ?? ""}`,
          type: target.type,
          label: target.label,
          aliases: target.aliases ?? [],
          context: target.context ?? null
        }))
      }),
      fallback: { suggestions: fallback.map((item) => ({
        target_key: `${item.targetType}|${item.targetRef ?? ""}`,
        confidence: item.confidence,
        rationale: item.rationale,
        allocation_percent: item.allocationPercent
      })) },
      metadata: {
        candidateCount: input.targets.length,
        documentType: input.document.documentType,
        modelEscalation: ambiguousAllocation ? "advanced" : "balanced",
        deterministicConfidence: fallbackConfidence
      }
    });
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const validated = suggestions.slice(0, 5).flatMap((row): AllocationSuggestion[] => {
      const key = typeof row.target_key === "string" ? row.target_key : "";
      const target = candidateMap.get(key);
      if (!target) return [];
      const percent = Number(row.allocation_percent);
      return [{
        targetType: target.type,
        targetRef: target.ref,
        targetLabel: target.label,
        amountCents: suggestions.length === 1 ? input.document.totalCents : null,
        allocationPercent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : suggestions.length === 1 ? 100 : null,
        confidence: confidence(row.confidence, 0.4),
        rationale: typeof row.rationale === "string" && row.rationale.trim() ? row.rationale.trim() : "Matched by document and workspace context.",
        metadata: target.metadata
      }];
    });
    return validated.length ? validated : fallback;
  } catch {
    return fallback;
  }
}
