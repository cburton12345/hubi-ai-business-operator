import { describe, expect, it } from "vitest";
import { isResolvedAccountingCategory, isSupportedAccountingAllocation, mapFerocityAssetAllocationTarget } from "./ferocity-adapter";

describe("mapFerocityAssetAllocationTarget", () => {
  const base = {
    id: "asset-1",
    name: "Unit 2B",
    asset_type: "unit",
    serial_number: null,
    customer_name: "Homes4Rent",
    location_name: "Maple Apartments",
    location_address: "125 Maple St Springfield IL 62701",
    location_city: "Springfield",
    location_state: "IL",
    location_postal_code: "62701",
    parent_asset_id: "property-1",
    parent_asset_name: "125 Maple Street"
  };

  it("exposes rental units as property-aware expense targets", () => {
    expect(mapFerocityAssetAllocationTarget(base)).toEqual(expect.objectContaining({
      type: "unit",
      ref: "asset-1",
      label: "125 Maple Street — Unit 2B",
      metadata: expect.objectContaining({ propertyAssetId: "property-1", assetId: "asset-1", locationState: "IL" })
    }));
  });

  it("exposes property assets without changing ordinary asset behavior", () => {
    expect(mapFerocityAssetAllocationTarget({ ...base, id: "property-1", name: "125 Maple Street", asset_type: "rental-property", parent_asset_id: null, parent_asset_name: null })).toEqual(expect.objectContaining({
      type: "property",
      label: "Homes4Rent — 125 Maple Street",
      metadata: expect.objectContaining({ propertyAssetId: "property-1" })
    }));
    expect(mapFerocityAssetAllocationTarget({ ...base, asset_type: "roof", parent_asset_id: null, parent_asset_name: null }).type).toBe("equipment");
  });
});

describe("isSupportedAccountingAllocation", () => {
  const allocation = (targetType: string) => ({
    targetType,
    targetRef: null,
    targetLabel: targetType,
    amountCents: null,
    allocationPercent: 100,
    confidence: 1,
    rationale: "Confirmed by owner.",
  });

  it("keeps unresolved rows out of posted accounting records", () => {
    expect(isSupportedAccountingAllocation(undefined)).toBe(false);
    expect(isSupportedAccountingAllocation(allocation("unassigned"))).toBe(false);
    expect(isSupportedAccountingAllocation(allocation("unassigned_income"))).toBe(false);
    expect(isSupportedAccountingAllocation(allocation("needs_review"))).toBe(false);
  });

  it("accepts explicit property and business-wide decisions", () => {
    expect(isSupportedAccountingAllocation(allocation("property"))).toBe(true);
    expect(isSupportedAccountingAllocation(allocation("unit"))).toBe(true);
    expect(isSupportedAccountingAllocation(allocation("business_wide"))).toBe(true);
  });
});

describe("isResolvedAccountingCategory", () => {
  it("blocks placeholder and review categories from posting", () => {
    expect(isResolvedAccountingCategory(null)).toBe(false);
    expect(isResolvedAccountingCategory("uncategorized")).toBe(false);
    expect(isResolvedAccountingCategory("deposit_needs_classification")).toBe(false);
    expect(isResolvedAccountingCategory("general_merchandise_needs_receipt")).toBe(false);
  });

  it("accepts a reviewed accounting category", () => {
    expect(isResolvedAccountingCategory("materials")).toBe(true);
    expect(isResolvedAccountingCategory("labor")).toBe(true);
  });
});
