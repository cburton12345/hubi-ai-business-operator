export type ProcurementMatchSource = {
  id: string;
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  totalCents: number | null;
};

export type ProcurementMatchCandidate = {
  id: string;
  purchaseOrderNumber: string;
  supplierName: string | null;
  totalCents: number;
  createdAt: string;
};

export type RankedProcurementMatch = ProcurementMatchCandidate & {
  score: number;
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

function normalized(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dayDistance(left: string | null, right: string) {
  if (!left) return null;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

export function rankProcurementMatches(
  source: ProcurementMatchSource,
  candidates: ProcurementMatchCandidate[],
): RankedProcurementMatch[] {
  const sourceSupplier = normalized(source.supplierName);
  const sourceNumber = normalized(source.documentNumber);
  return candidates.flatMap((candidate): RankedProcurementMatch[] => {
    const evidence: string[] = [];
    let score = 0;
    const candidateSupplier = normalized(candidate.supplierName);
    if (sourceSupplier && candidateSupplier && (sourceSupplier === candidateSupplier || sourceSupplier.includes(candidateSupplier) || candidateSupplier.includes(sourceSupplier))) {
      score += 40;
      evidence.push("supplier name matches");
    }
    const candidateNumber = normalized(candidate.purchaseOrderNumber);
    if (sourceNumber && candidateNumber && (sourceNumber.includes(candidateNumber) || candidateNumber.includes(sourceNumber))) {
      score += 30;
      evidence.push("document references the purchase order number");
    }
    if (source.totalCents !== null && source.totalCents >= 0) {
      const difference = Math.abs(source.totalCents - candidate.totalCents);
      const ratio = candidate.totalCents > 0 ? difference / candidate.totalCents : difference === 0 ? 0 : 1;
      if (difference === 0) {
        score += 35;
        evidence.push("total matches exactly");
      } else if (ratio <= 0.02) {
        score += 25;
        evidence.push("total is within 2%");
      } else if (ratio <= 0.1) {
        score += 10;
        evidence.push("total is within 10%");
      }
    }
    const days = dayDistance(source.documentDate, candidate.createdAt);
    if (days !== null && days <= 45) {
      score += 10;
      evidence.push("dates are within 45 days");
    } else if (days !== null && days <= 120) {
      score += 5;
      evidence.push("dates are within 120 days");
    }
    if (score < 20) return [];
    return [{
      ...candidate,
      score,
      confidence: score >= 75 ? "high" : score >= 50 ? "medium" : "low",
      evidence,
    }];
  }).sort((left, right) => right.score - left.score || left.purchaseOrderNumber.localeCompare(right.purchaseOrderNumber)).slice(0, 3);
}
