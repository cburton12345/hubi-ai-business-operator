import type { AllocationSuggestion, AllocationTarget, NormalizedExpenseDocument } from "./types";

function words(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
}
function overlapScore(documentWords: Set<string>, target: AllocationTarget) {
  const targetWords = words([target.label, ...(target.aliases ?? []), target.context ?? ""].join(" "));
  if (!targetWords.size) return 0;
  let matches = 0;
  for (const word of targetWords) if (documentWords.has(word)) matches += 1;
  return Math.min(1, matches / Math.min(5, targetWords.size));
}

export function suggestAllocations(
  document: NormalizedExpenseDocument,
  targets: AllocationTarget[]
): AllocationSuggestion[] {
  const corpus = words([
    document.vendorName ?? "",
    document.documentNumber ?? "",
    document.suggestedCategory ?? "",
    document.extractedText,
    ...document.lineItems.map((item) => `${item.description} ${item.suggestedCategory ?? ""}`)
  ].join(" "));
  const ranked = targets
    .map((target) => ({ target, score: overlapScore(corpus, target) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!ranked.length) {
    return [{
      targetType: "business_overhead",
      targetRef: null,
      targetLabel: "Business / general overhead",
      amountCents: document.totalCents,
      allocationPercent: 100,
      confidence: document.suggestedCategory ? 0.58 : 0.35,
      rationale: "No specific job, customer, worker, crew, or asset matched the document context."
    }];
  }

  const totalScore = ranked.reduce((sum, row) => sum + row.score, 0);
  return ranked.map(({ target, score }) => ({
    targetType: target.type,
    targetRef: target.ref,
    targetLabel: target.label,
    amountCents: ranked.length === 1 ? document.totalCents : null,
    allocationPercent: ranked.length === 1 ? 100 : Number(((score / totalScore) * 100).toFixed(2)),
    confidence: Math.min(0.96, 0.5 + score * 0.46),
    rationale: `Matched names or context found in the document to ${target.label}.`,
    metadata: target.metadata
  }));
}
