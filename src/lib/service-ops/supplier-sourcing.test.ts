import { describe, expect, it } from "vitest";
import { rankSupplierSources, type SupplierSourceOption } from "./supplier-sourcing";

const option = (overrides: Partial<SupplierSourceOption>): SupplierSourceOption => ({
  supplierProductId: "p1", supplierName: "Supplier", productName: "Board", sku: "BOARD-1",
  unitPriceCents: 1000, availability: "in_stock", confidence: "verified", checkedAt: "2026-10-19T00:00:00.000Z",
  sourceType: "account_pricing", leadTimeDays: null, reliabilityScore: null, ...overrides,
});

describe("supplier sourcing", () => {
  it("ranks price, availability, freshness, lead time, and reliability while retaining evidence", () => {
    const ranked = rankSupplierSources([
      option({ supplierProductId: "reliable", supplierName: "Reliable", reliabilityScore: 0.95, leadTimeDays: 1 }),
      option({ supplierProductId: "stale", supplierName: "Stale", unitPriceCents: 900, availability: "unknown", confidence: "low", checkedAt: "2025-01-01T00:00:00.000Z" }),
    ], new Date("2026-10-20T00:00:00.000Z"));
    expect(ranked[0]).toMatchObject({ supplierProductId: "reliable", approvalRequired: true });
    expect(ranked[0].evidence).toEqual(expect.arrayContaining(["recorded lead time: 1 day", "recorded reliability: 95%"]));
  });

  it("penalizes out-of-stock options and never removes the approval boundary", () => {
    const ranked = rankSupplierSources([option({ supplierProductId: "out", availability: "out_of_stock", unitPriceCents: 500 })], new Date("2026-10-20T00:00:00.000Z"));
    expect(ranked[0].score).toBeLessThan(0);
    expect(ranked[0].approvalRequired).toBe(true);
  });
});
