import { describe, expect, it } from "vitest";
import { calculatePosSale, posSaleSchema } from "./sale";

describe("POS sale calculation", () => {
  it("calculates discount before tax without floating-point money drift", () => {
    expect(calculatePosSale({ items: [{ inventoryItemId: null, name: "Part", quantity: 2.5, unitPriceCents: 1999 }], discountCents: 500, taxRateBps: 725 }))
      .toEqual({ lineTotals: [4998], subtotalCents: 4998, discountCents: 500, taxCents: 326, totalCents: 4824 });
  });

  it("rejects empty and negative sales", () => {
    expect(posSaleSchema.safeParse({ customerId: null, jobId: null, title: "Sale", tenderType: "cash", externalReference: null, discountCents: 0, taxRateBps: 0, idempotencyKey: crypto.randomUUID(), items: [] }).success).toBe(false);
  });
});
