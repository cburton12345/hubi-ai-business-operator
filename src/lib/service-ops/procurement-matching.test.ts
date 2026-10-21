import { describe, expect, it } from "vitest";
import { rankProcurementMatches } from "./procurement-matching";

const source = {
  id: "document",
  supplierName: "Northside Lumber, Inc.",
  documentNumber: "Invoice for PO-1042",
  documentDate: "2026-10-10",
  totalCents: 125_000,
};

describe("procurement matching", () => {
  it("ranks candidates with explicit evidence without selecting one automatically", () => {
    const result = rankProcurementMatches(source, [
      { id: "weak", purchaseOrderNumber: "PO-1000", supplierName: "Other Supply", totalCents: 125_000, createdAt: "2026-10-01" },
      { id: "strong", purchaseOrderNumber: "PO-1042", supplierName: "Northside Lumber", totalCents: 125_000, createdAt: "2026-10-01" },
    ]);
    expect(result[0]).toMatchObject({ id: "strong", confidence: "high" });
    expect(result[0].evidence).toEqual(expect.arrayContaining([
      "supplier name matches",
      "document references the purchase order number",
      "total matches exactly",
    ]));
    expect(result).toHaveLength(2);
  });

  it("does not invent a match when evidence is too weak", () => {
    expect(rankProcurementMatches({ ...source, supplierName: null, documentNumber: null, totalCents: null, documentDate: null }, [{
      id: "po", purchaseOrderNumber: "PO-1", supplierName: "Supplier", totalCents: 10_000, createdAt: "2026-10-01",
    }])).toEqual([]);
  });
});
