export type SupplierSourceOption = {
  supplierProductId: string;
  supplierName: string;
  productName: string;
  sku: string | null;
  unitPriceCents: number;
  availability: "unknown" | "in_stock" | "limited" | "out_of_stock" | "special_order";
  confidence: "low" | "medium" | "high" | "verified";
  checkedAt: string;
  sourceType: string;
  leadTimeDays: number | null;
  reliabilityScore: number | null;
};

export type RankedSupplierSource = SupplierSourceOption & {
  score: number;
  evidence: string[];
  approvalRequired: true;
};

const confidenceScore = { low: 2, medium: 6, high: 10, verified: 14 } as const;
const availabilityScore = { unknown: 0, in_stock: 18, limited: 10, out_of_stock: -100, special_order: 3 } as const;

export function rankSupplierSources(options: SupplierSourceOption[], now = new Date()): RankedSupplierSource[] {
  const usablePrices = options.map((option) => option.unitPriceCents).filter((price) => price > 0);
  const lowestPrice = usablePrices.length ? Math.min(...usablePrices) : null;
  return options.map((option): RankedSupplierSource => {
    const evidence: string[] = [];
    let score = availabilityScore[option.availability] + confidenceScore[option.confidence];
    evidence.push(`availability: ${option.availability.replaceAll("_", " ")}`);
    evidence.push(`source confidence: ${option.confidence}`);
    if (lowestPrice !== null && option.unitPriceCents > 0) {
      const premium = (option.unitPriceCents - lowestPrice) / lowestPrice;
      if (premium === 0) {
        score += 25;
        evidence.push("lowest current recorded price");
      } else if (premium <= 0.05) {
        score += 18;
        evidence.push("within 5% of the lowest recorded price");
      } else if (premium <= 0.15) {
        score += 8;
        evidence.push("within 15% of the lowest recorded price");
      }
    }
    const checked = Date.parse(option.checkedAt);
    const ageDays = Number.isFinite(checked) ? Math.max(0, (now.getTime() - checked) / 86_400_000) : Infinity;
    if (ageDays <= 7) {
      score += 12;
      evidence.push("price checked within 7 days");
    } else if (ageDays <= 30) {
      score += 6;
      evidence.push("price checked within 30 days");
    } else {
      score -= 8;
      evidence.push("price is older than 30 days");
    }
    if (option.leadTimeDays !== null) {
      score += option.leadTimeDays <= 2 ? 8 : option.leadTimeDays <= 7 ? 3 : -4;
      evidence.push(`recorded lead time: ${option.leadTimeDays} day${option.leadTimeDays === 1 ? "" : "s"}`);
    } else {
      evidence.push("lead time not recorded");
    }
    if (option.reliabilityScore !== null) {
      score += Math.round(option.reliabilityScore * 12);
      evidence.push(`recorded reliability: ${Math.round(option.reliabilityScore * 100)}%`);
    } else {
      evidence.push("reliability not recorded");
    }
    return { ...option, score, evidence, approvalRequired: true };
  }).sort((left, right) => right.score - left.score || left.unitPriceCents - right.unitPriceCents || left.supplierName.localeCompare(right.supplierName));
}
