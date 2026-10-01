import type { DuplicateAssessment, DuplicateCandidate, NormalizedExpenseDocument } from "./types";

function normalizedText(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function assessDuplicate(
  document: NormalizedExpenseDocument,
  contentSha256: string,
  candidates: DuplicateCandidate[]
): DuplicateAssessment {
  let best: DuplicateAssessment = { duplicateOfId: null, confidence: 0, reasons: [] };
  for (const candidate of candidates) {
    const reasons: string[] = [];
    let score = 0;
    if (candidate.contentSha256 === contentSha256) {
      score = 1;
      reasons.push("The uploaded file is byte-for-byte identical.");
    } else {
      if (document.documentNumber && normalizedText(document.documentNumber) === normalizedText(candidate.documentNumber)) {
        score += 0.55;
        reasons.push("Document number matches.");
      }
      if (document.vendorName && normalizedText(document.vendorName) === normalizedText(candidate.vendorName)) {
        score += 0.15;
        reasons.push("Vendor matches.");
      }
      if (document.documentDate && document.documentDate === candidate.documentDate) {
        score += 0.15;
        reasons.push("Date matches.");
      }
      if (document.totalCents !== null && document.totalCents === candidate.totalCents) {
        score += 0.25;
        reasons.push("Total matches.");
      }
    }
    score = Math.min(1, score);
    if (score > best.confidence) best = { duplicateOfId: candidate.id, confidence: score, reasons };
  }
  return best;
}
