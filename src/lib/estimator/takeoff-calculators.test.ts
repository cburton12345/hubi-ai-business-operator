import { describe, expect, it } from "vitest";
import { calculateMaterialTakeoff, extractMeasurementsFromNote } from "./takeoff-calculators";

describe("material takeoff calculators", () => {
  it("calculates shingle roofing quantities with pitch and waste", () => {
    const result = calculateMaterialTakeoff({
      tradeKey: "shingle_roofing",
      lengthFt: 42,
      widthFt: 28,
      pitchRise: 6,
      roofSections: 2,
      wastePercent: 10,
      jobPostalCode: "54701"
    });

    const shingles = result.items.find((item) => item.productCategoryKey === "shingles");

    expect(result.status).toBe("ready_for_bid");
    expect(result.warnings).toHaveLength(0);
    expect(shingles?.roundedPurchaseQuantity).toBeGreaterThan(80);
    expect(result.formulas.find((formula) => formula.label === "Squares")?.value).toBeGreaterThan(28);
  });

  it("flags missing critical measurements instead of silently guessing", () => {
    const result = calculateMaterialTakeoff({
      tradeKey: "concrete",
      lengthFt: 20,
      widthFt: 12
    });

    expect(result.status).toBe("needs_measurements");
    expect(result.missingInformation).toContain("depth in inches");
    expect(result.warnings.some((warning) => warning.severity === "blocking")).toBe(true);
  });

  it("extracts simple dimensions from field notes", () => {
    const extracted = extractMeasurementsFromNote("Roof is 42 by 28, two sides, 6/12 pitch, 10 waste.");

    expect(extracted.lengthFt).toBe(42);
    expect(extracted.widthFt).toBe(28);
    expect(extracted.pitchRise).toBe(6);
  });

  it("builds a complete metal roofing system before supplier pricing", () => {
    const result = calculateMaterialTakeoff({
      tradeKey: "metal_roofing",
      lengthFt: 40,
      widthFt: 28,
      pitchRise: 4,
      ridgeFt: 40,
      valleyFt: 20,
      eaveFt: 80,
      rakeFt: 56,
      panelCoverageWidthIn: 36,
      panelLengthFt: 16,
      jobPostalCode: "54701"
    });

    expect(result.systemAssembly.missingRoles).toEqual([]);
    expect(result.pricingGuardrails.buildSpecificationBeforeSupplierSearch).toBe(true);
    expect(result.items.some((item) => item.assemblyRole === "field_panel" && item.productSpecification?.gauge === 29)).toBe(true);
    expect(result.items.some((item) => item.assemblyRole === "screws")).toBe(true);
    expect(result.items.some((item) => item.assemblyRole === "ventilation" && item.quoteRequired)).toBe(true);
  });

  it("blocks conflicting measurements instead of choosing a number", () => {
    const result = calculateMaterialTakeoff({
      tradeKey: "shingle_roofing",
      lengthFt: 40,
      widthFt: 20,
      areaSqFt: 2000,
      jobPostalCode: "54701"
    });

    expect(result.status).toBe("needs_review");
    expect(result.warnings.some((warning) => warning.warningType === "conflicting_measurements" && warning.severity === "blocking")).toBe(true);
  });
});
