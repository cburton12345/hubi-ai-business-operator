export type TradeKey =
  | "shingle_roofing"
  | "metal_roofing"
  | "metal_siding"
  | "vinyl_siding"
  | "gutters"
  | "framing"
  | "drywall"
  | "flooring"
  | "concrete"
  | "insulation"
  | "painting"
  | "ductwork"
  | "plumbing"
  | "electrical";

export type MeasurementInput = {
  tradeKey: TradeKey;
  originalNote?: string | null;
  sourceType?: string | null;
  lengthFt?: number | null;
  widthFt?: number | null;
  heightFt?: number | null;
  areaSqFt?: number | null;
  perimeterFt?: number | null;
  pitchRise?: number | null;
  roofSections?: number | null;
  stories?: number | null;
  overhangFt?: number | null;
  ridgeFt?: number | null;
  hipFt?: number | null;
  valleyFt?: number | null;
  eaveFt?: number | null;
  rakeFt?: number | null;
  openingsSqFt?: number | null;
  doors?: number | null;
  windows?: number | null;
  corners?: number | null;
  wastePercent?: number | null;
  panelCoverageWidthIn?: number | null;
  panelLengthFt?: number | null;
  coveragePerPackage?: number | null;
  thicknessIn?: number | null;
  depthIn?: number | null;
  spacingIn?: number | null;
  jobAddress?: string | null;
  jobPostalCode?: string | null;
  qualityLevel?: "budget" | "standard" | "premium" | "custom";
};

export type TakeoffItem = {
  productCategoryKey: string;
  label: string;
  assemblyRole?: string;
  productSpecification?: Record<string, string | number | boolean | null>;
  formula: string;
  calculatedQuantity: number;
  roundedPurchaseQuantity: number;
  unit: string;
  coverageRate?: number | null;
  wasteBps: number;
  installationWasteBps?: number;
  purchasedOverageBps?: number;
  returnableExtraBps?: number;
  nonReturnableCustom?: boolean;
  quoteRequired?: boolean;
  substituteAllowed?: boolean;
  compatibilityNotes?: string;
  assumptions: string[];
  confidence: "low" | "medium" | "high";
};

export type TakeoffFormula = {
  label: string;
  formula: string;
  value: number | string;
  unit?: string;
};

export type TakeoffWarning = {
  warningType: string;
  severity: "low" | "medium" | "high" | "blocking";
  message: string;
  requiresConfirmation: boolean;
};

export type TakeoffResult = {
  tradeKey: TradeKey;
  status: "needs_measurements" | "needs_review" | "ready_for_bid";
  systemAssembly: {
    key: string;
    label: string;
    requiredRoles: string[];
    presentRoles: string[];
    missingRoles: string[];
  };
  interpretedInput: string;
  measurements: Record<string, number | string | null>;
  items: TakeoffItem[];
  formulas: TakeoffFormula[];
  assumptions: string[];
  warnings: TakeoffWarning[];
  missingInformation: string[];
  confidence: "low" | "medium" | "high";
  pricingGuardrails: {
    buildSpecificationBeforeSupplierSearch: boolean;
    quoteOnlyCategories: string[];
    preferConfirmedCompanyPricing: boolean;
    neverInventPrices: boolean;
  };
  reviewThresholds: string[];
};

function n(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function roundUp(value: number, increment = 1) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / increment) * increment;
}

function wasteBps(input: MeasurementInput, fallbackPercent: number) {
  const percent = n(input.wastePercent) ?? fallbackPercent;
  return Math.round(percent * 100);
}

function withWaste(quantity: number, waste: number) {
  return quantity * (1 + waste / 10000);
}

function pitchMultiplier(rise?: number | null) {
  const pitch = n(rise);
  if (!pitch) return 1;
  return Math.sqrt(12 * 12 + pitch * pitch) / 12;
}

function addMissing(input: MeasurementInput, keys: Array<keyof MeasurementInput>, labels: string[]) {
  return keys.reduce<string[]>((missing, key, index) => {
    if (n(input[key] as number | null | undefined) === null) missing.push(labels[index]);
    return missing;
  }, []);
}

function confidenceFrom(missing: string[], warnings: TakeoffWarning[]) {
  if (missing.length || warnings.some((warning) => warning.severity === "blocking")) return "low";
  if (warnings.some((warning) => warning.severity === "high" || warning.requiresConfirmation)) return "medium";
  return "high";
}

const assemblyRequirements: Partial<Record<TradeKey, { label: string; requiredRoles: string[] }>> = {
  shingle_roofing: {
    label: "Complete shingle roofing system",
    requiredRoles: ["field_material", "underlayment", "ice_water", "starter", "ridge_cap", "drip_edge", "fasteners", "flashing", "ventilation"]
  },
  metal_roofing: {
    label: "Complete exposed-fastener metal roofing system",
    requiredRoles: [
      "field_panel",
      "ridge",
      "hip",
      "valley",
      "gable_trim",
      "eave_trim",
      "drip_edge",
      "underlayment",
      "ice_water",
      "pipe_boots",
      "flashing",
      "closures",
      "screws",
      "sealant",
      "snow_retention",
      "ventilation"
    ]
  },
  metal_siding: {
    label: "Complete metal siding system",
    requiredRoles: ["field_panel", "house_wrap", "outside_corners", "starter_trim", "openings_trim", "fasteners", "sealant"]
  },
  vinyl_siding: {
    label: "Complete vinyl siding system",
    requiredRoles: ["field_panel", "house_wrap", "outside_corners", "starter_trim", "openings_trim", "fasteners"]
  }
};

function assemblyFor(input: MeasurementInput, items: TakeoffItem[]) {
  const spec = assemblyRequirements[input.tradeKey] ?? {
    label: `${input.tradeKey.replaceAll("_", " ")} material system`,
    requiredRoles: ["primary_material"]
  };
  const presentRoles = [...new Set(items.map((item) => item.assemblyRole).filter((role): role is string => Boolean(role)))];
  const missingRoles = spec.requiredRoles.filter((role) => !presentRoles.includes(role));
  return {
    key: input.tradeKey,
    label: spec.label,
    requiredRoles: spec.requiredRoles,
    presentRoles,
    missingRoles
  };
}

function assemblyWarnings(assembly: ReturnType<typeof assemblyFor>): TakeoffWarning[] {
  if (!assembly.missingRoles.length) return [];
  return [
    {
      warningType: "incomplete_system_assembly",
      severity: "high",
      message: `Complete system check needs review. Missing roles: ${assembly.missingRoles.join(", ")}.`,
      requiresConfirmation: true
    }
  ];
}

function unitAndConflictWarnings(input: MeasurementInput): TakeoffWarning[] {
  const warnings: TakeoffWarning[] = [];
  const note = input.originalNote?.toLowerCase() ?? "";
  if (/\b\d+\s*(?:in|inch|inches|")\b/.test(note) && /\b\d+\s*(?:ft|feet|foot|')\b/.test(note)) {
    warnings.push({
      warningType: "mixed_units",
      severity: "medium",
      message: "The note appears to mix feet and inches. Read critical measurements back before finalizing.",
      requiresConfirmation: true
    });
  }
  if (n(input.areaSqFt) && n(input.lengthFt) && n(input.widthFt)) {
    const implied = (n(input.lengthFt) ?? 0) * (n(input.widthFt) ?? 0);
    const entered = n(input.areaSqFt) ?? 0;
    if (implied > 0 && Math.abs(implied - entered) / implied > 0.15) {
      warnings.push({
        warningType: "conflicting_measurements",
        severity: "blocking",
        message: `Entered area (${entered} sq ft) conflicts with length x width (${Math.round(implied)} sq ft). Confirm which measurement is correct.`,
        requiresConfirmation: true
      });
    }
  }
  return warnings;
}

function interpreted(input: MeasurementInput) {
  const pieces = [
    input.originalNote?.trim(),
    input.jobAddress ? `Address: ${input.jobAddress}` : null,
    input.jobPostalCode ? `ZIP: ${input.jobPostalCode}` : null
  ].filter(Boolean);
  return pieces.join("\n") || "Manual measurement fields were used.";
}

function standardWarnings(input: MeasurementInput, missing: string[]) {
  const warnings: TakeoffWarning[] = [];
  if (missing.length) {
    warnings.push({
      warningType: "missing_measurement",
      severity: "blocking",
      message: `Missing required measurement: ${missing.join(", ")}.`,
      requiresConfirmation: true
    });
  }
  if (input.sourceType === "photo_note" || input.sourceType === "uploaded_plan") {
    warnings.push({
      warningType: "unverified_measurement_source",
      severity: "high",
      message: "Photo or plan-derived measurements must be confirmed before the bid is finalized.",
      requiresConfirmation: true
    });
  }
  if (!input.jobPostalCode) {
    warnings.push({
      warningType: "missing_price_location",
      severity: "medium",
      message: "Supplier pricing should be tied to a job ZIP code or selected store before final pricing.",
      requiresConfirmation: true
    });
  }
  warnings.push(...unitAndConflictWarnings(input));
  return warnings;
}

function result(input: MeasurementInput, missing: string[], items: TakeoffItem[], formulas: TakeoffFormula[], assumptions: string[], extraWarnings: TakeoffWarning[] = []): TakeoffResult {
  const assembly = assemblyFor(input, items);
  const warnings = [...standardWarnings(input, missing), ...assemblyWarnings(assembly), ...extraWarnings];
  const confidence = confidenceFrom(missing, warnings);
  return {
    tradeKey: input.tradeKey,
    status: missing.length ? "needs_measurements" : warnings.some((warning) => warning.requiresConfirmation) ? "needs_review" : "ready_for_bid",
    systemAssembly: assembly,
    interpretedInput: interpreted(input),
    measurements: {
      lengthFt: input.lengthFt ?? null,
      widthFt: input.widthFt ?? null,
      heightFt: input.heightFt ?? null,
      areaSqFt: input.areaSqFt ?? null,
      perimeterFt: input.perimeterFt ?? null,
      pitchRise: input.pitchRise ?? null,
      openingsSqFt: input.openingsSqFt ?? null,
      wastePercent: input.wastePercent ?? null
    },
    items,
    formulas,
    assumptions,
    warnings,
    missingInformation: missing,
    confidence,
    pricingGuardrails: {
      buildSpecificationBeforeSupplierSearch: true,
      quoteOnlyCategories: items.filter((item) => item.quoteRequired).map((item) => item.productCategoryKey),
      preferConfirmedCompanyPricing: true,
      neverInventPrices: true
    },
    reviewThresholds: [
      "low_ai_confidence",
      "high_project_value",
      "low_margin",
      "structural_work",
      "custom_fabrication",
      "conflicting_measurements",
      "photo_only_dimensions",
      "unverified_prices"
    ]
  };
}

function shingleRoofing(input: MeasurementInput): TakeoffResult {
  const missing = addMissing(input, ["lengthFt", "widthFt"], ["building or roof length", "building or roof width"]);
  const length = n(input.lengthFt) ?? 0;
  const width = n(input.widthFt) ?? 0;
  const multiplier = pitchMultiplier(input.pitchRise);
  const waste = wasteBps(input, 10);
  const roofArea = length * width * multiplier * (n(input.roofSections) ?? 1);
  const roofAreaWaste = withWaste(roofArea, waste);
  const squares = roofAreaWaste / 100;
  const ridge = n(input.ridgeFt) ?? Math.max(length, width);
  const eaves = n(input.eaveFt) ?? length * 2;
  const rakes = n(input.rakeFt) ?? width * 2;
  const valleys = n(input.valleyFt) ?? 0;
  const assumptions = [
    "Standard shingle coverage uses 3 bundles per square unless product data overrides it.",
    "Underlayment assumes one roll covers 1,000 sq ft until a supplier product is selected.",
    "Starter, ridge cap, drip edge, fasteners, flashing, and ventilation must be checked against manufacturer warranty rules."
  ];
  const items: TakeoffItem[] = [
    { productCategoryKey: "shingles", assemblyRole: "field_material", label: "Architectural shingles", productSpecification: { material: "asphalt architectural shingle", warrantySystemCompatible: true }, formula: "ceil((roof area with waste / 100 squares) * 3 bundles)", calculatedQuantity: squares * 3, roundedPurchaseQuantity: roundUp(squares * 3), unit: "bundles", coverageRate: 33.33, wasteBps: waste, installationWasteBps: waste, assumptions: ["3 bundles per square default"], confidence: missing.length ? "low" : "medium" },
    { productCategoryKey: "roof_underlayment", assemblyRole: "underlayment", label: "Synthetic underlayment", productSpecification: { coverageSqFt: 1000, manufacturerApproved: true }, formula: "ceil(roof area with waste / 1000 sq ft per roll)", calculatedQuantity: roofAreaWaste / 1000, roundedPurchaseQuantity: roundUp(roofAreaWaste / 1000), unit: "rolls", coverageRate: 1000, wasteBps: waste, assumptions: ["Confirm roll coverage for selected product"], confidence: "medium" },
    { productCategoryKey: "ice_water_membrane", assemblyRole: "ice_water", label: "Ice and water membrane", productSpecification: { location: "eaves and valleys", codeVerificationRequired: true }, formula: "ceil((eaves + valleys) / 65 ft per roll)", calculatedQuantity: (eaves + valleys) / 65, roundedPurchaseQuantity: roundUp((eaves + valleys) / 65), unit: "rolls", coverageRate: 65, wasteBps: 0, assumptions: ["Local code and climate may require more coverage"], confidence: "medium" },
    { productCategoryKey: "starter_strip", assemblyRole: "starter", label: "Starter strip", productSpecification: { manufacturerCompatible: true }, formula: "ceil((eaves + rakes) / 100 ft per bundle)", calculatedQuantity: (eaves + rakes) / 100, roundedPurchaseQuantity: roundUp((eaves + rakes) / 100), unit: "bundles", coverageRate: 100, wasteBps: 0, assumptions: ["Use manufacturer-compatible starter when warranty matters"], confidence: "medium" },
    { productCategoryKey: "ridge_cap", assemblyRole: "ridge_cap", label: "Ridge cap", productSpecification: { manufacturerCompatible: true }, formula: "ceil(ridge / 30 ft per bundle)", calculatedQuantity: ridge / 30, roundedPurchaseQuantity: roundUp(ridge / 30), unit: "bundles", coverageRate: 30, wasteBps: 0, assumptions: ["Confirm ridge/hip total before ordering"], confidence: "medium" },
    { productCategoryKey: "drip_edge", assemblyRole: "drip_edge", label: "Drip edge", productSpecification: { profile: "roof edge metal", colorMatchRequired: true }, formula: "ceil((eaves + rakes) / 10 ft per stick)", calculatedQuantity: (eaves + rakes) / 10, roundedPurchaseQuantity: roundUp((eaves + rakes) / 10), unit: "10 ft sticks", coverageRate: 10, wasteBps: 0, assumptions: ["Confirm color and profile"], confidence: "medium" },
    { productCategoryKey: "roof_fasteners", assemblyRole: "fasteners", label: "Roofing nails", productSpecification: { fastenerType: "manufacturer/code approved roofing nail" }, formula: "ceil(squares / 20 squares per box)", calculatedQuantity: squares / 20, roundedPurchaseQuantity: roundUp(squares / 20), unit: "boxes", coverageRate: 20, wasteBps: 0, assumptions: ["Confirm nail length for sheathing and code"], confidence: "medium" },
    { productCategoryKey: "roof_flashing", assemblyRole: "flashing", label: "Roof flashing allowance", productSpecification: { locations: "walls, penetrations, transitions", fieldVerifyRequired: true }, formula: "field verification allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm step flashing, apron flashing, pipe boots, and wall transitions"], confidence: "low" },
    { productCategoryKey: "roof_ventilation", assemblyRole: "ventilation", label: "Ventilation allowance", productSpecification: { intakeAndExhaustBalanced: true, codeVerificationRequired: true }, formula: "field ventilation review allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm intake, exhaust, bath vents, and manufacturer warranty requirements"], confidence: "low" }
  ];
  return result(input, missing, items, [
    { label: "Pitch multiplier", formula: "sqrt(12^2 + pitch^2) / 12", value: Number(multiplier.toFixed(3)) },
    { label: "Roof area", formula: "length * width * pitch multiplier * sections", value: Math.round(roofArea), unit: "sq ft" },
    { label: "Roof area with waste", formula: "roof area * (1 + waste)", value: Math.round(roofAreaWaste), unit: "sq ft" },
    { label: "Squares", formula: "roof area with waste / 100", value: Number(squares.toFixed(2)), unit: "squares" }
  ], assumptions);
}

function wallArea(input: MeasurementInput) {
  const length = n(input.lengthFt) ?? 0;
  const width = n(input.widthFt) ?? length;
  const perimeter = n(input.perimeterFt) ?? (length + width) * 2;
  const height = n(input.heightFt) ?? 0;
  const openings = n(input.openingsSqFt) ?? 0;
  return Math.max(perimeter * height - openings, 0);
}

function siding(input: MeasurementInput, metal = false): TakeoffResult {
  const missing = addMissing(input, ["heightFt"], ["wall height"]).concat(n(input.perimeterFt) || (n(input.lengthFt) && n(input.widthFt)) ? [] : ["perimeter or length and width"]);
  const area = wallArea(input);
  const waste = wasteBps(input, metal ? 12 : 10);
  const areaWaste = withWaste(area, waste);
  const corners = n(input.corners) ?? 4;
  const assumptions = [
    "Openings are deducted only when opening area is entered.",
    metal ? "Panel count assumes selected panel coverage width is confirmed." : "Vinyl siding squares assume 100 sq ft per square.",
    "Trim, starter, J-channel, corners, house wrap, soffit, and fascia must be confirmed by product and layout."
  ];
  const items: TakeoffItem[] = [
    { productCategoryKey: metal ? "metal_panels" : "siding_panels", assemblyRole: "field_panel", label: metal ? "Metal siding panels" : "Siding panels", productSpecification: { system: metal ? "metal siding" : "vinyl siding", coverageWidthIn: metal ? n(input.panelCoverageWidthIn) ?? 36 : null }, formula: metal ? "ceil(area with waste / (panel coverage width * panel length))" : "ceil(area with waste / 100)", calculatedQuantity: metal ? areaWaste / (((n(input.panelCoverageWidthIn) ?? 36) / 12) * (n(input.panelLengthFt) ?? 10)) : areaWaste / 100, roundedPurchaseQuantity: roundUp(metal ? areaWaste / (((n(input.panelCoverageWidthIn) ?? 36) / 12) * (n(input.panelLengthFt) ?? 10)) : areaWaste / 100), unit: metal ? "panels" : "squares", coverageRate: metal ? ((n(input.panelCoverageWidthIn) ?? 36) / 12) * (n(input.panelLengthFt) ?? 10) : 100, wasteBps: waste, installationWasteBps: waste, assumptions: [metal ? "Default 36 inch coverage by 10 ft panel" : "100 sq ft per siding square"], confidence: missing.length ? "low" : "medium" },
    { productCategoryKey: "house_wrap", assemblyRole: "house_wrap", label: "House wrap", productSpecification: { weatherBarrier: true }, formula: "ceil(wall area / 900 sq ft per roll)", calculatedQuantity: area / 900, roundedPurchaseQuantity: roundUp(area / 900), unit: "rolls", coverageRate: 900, wasteBps: 0, assumptions: ["Confirm roll coverage"], confidence: "medium" },
    { productCategoryKey: "trim", assemblyRole: "outside_corners", label: "Outside corners", productSpecification: { colorMatchRequired: true }, formula: "corners * wall height / 10 ft per piece", calculatedQuantity: (corners * (n(input.heightFt) ?? 0)) / 10, roundedPurchaseQuantity: roundUp((corners * (n(input.heightFt) ?? 0)) / 10), unit: "pieces", coverageRate: 10, wasteBps: 0, assumptions: ["Confirm corner count and length"], confidence: "medium" },
    { productCategoryKey: "trim", assemblyRole: "starter_trim", label: "Starter/J-channel/utility trim", productSpecification: { openingLayoutRequired: true }, formula: "perimeter and opening trim placeholder", calculatedQuantity: (n(input.perimeterFt) ?? ((n(input.lengthFt) ?? 0) + (n(input.widthFt) ?? 0)) * 2) / 10, roundedPurchaseQuantity: roundUp((n(input.perimeterFt) ?? ((n(input.lengthFt) ?? 0) + (n(input.widthFt) ?? 0)) * 2) / 10), unit: "10 ft pieces", coverageRate: 10, wasteBps: 0, assumptions: ["Add exact openings for accurate trim"], confidence: "low" },
    { productCategoryKey: metal ? "metal_fasteners" : "siding_fasteners", assemblyRole: "fasteners", label: "Compatible fasteners", productSpecification: { manufacturerApproved: true }, formula: "fastener allowance by system", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm manufacturer-approved fasteners"], confidence: "low" },
    { productCategoryKey: "sealant", assemblyRole: "sealant", label: "Compatible sealant", productSpecification: { exteriorRated: true }, formula: "sealant allowance by openings and transitions", calculatedQuantity: metal ? 1 : 0, roundedPurchaseQuantity: metal ? 1 : 0, unit: "allowance", wasteBps: 0, assumptions: ["Confirm compatible sealant at penetrations and transitions"], confidence: "low" },
    { productCategoryKey: "trim", assemblyRole: "openings_trim", label: "Opening trim allowance", productSpecification: { windowsAndDoors: true }, formula: "opening trim allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm all window, door, and utility openings"], confidence: "low" }
  ];
  return result(input, missing, items, [
    { label: "Wall area", formula: "perimeter * height - openings", value: Math.round(area), unit: "sq ft" },
    { label: "Wall area with waste", formula: "wall area * (1 + waste)", value: Math.round(areaWaste), unit: "sq ft" }
  ], assumptions);
}

function metalRoofing(input: MeasurementInput): TakeoffResult {
  const missing = addMissing(input, ["lengthFt", "widthFt"], ["building or roof length", "building or roof width"]);
  const length = n(input.lengthFt) ?? 0;
  const width = n(input.widthFt) ?? 0;
  const multiplier = pitchMultiplier(input.pitchRise);
  const waste = wasteBps(input, 12);
  const roofArea = length * width * multiplier * (n(input.roofSections) ?? 1);
  const roofAreaWaste = withWaste(roofArea, waste);
  const panelCoverageFt = (n(input.panelCoverageWidthIn) ?? 36) / 12;
  const panelLengthFt = n(input.panelLengthFt) ?? Math.max(length, width);
  const panelCoverage = panelCoverageFt * panelLengthFt;
  const ridge = n(input.ridgeFt) ?? Math.max(length, width);
  const hips = n(input.hipFt) ?? 0;
  const valleys = n(input.valleyFt) ?? 0;
  const eaves = n(input.eaveFt) ?? length * 2;
  const rakes = n(input.rakeFt) ?? width * 2;
  const assumptions = [
    "Metal roofing is treated as a complete installed system, not panels alone.",
    "Supplier search must use the product specification before looking up prices.",
    "Custom-cut panels, trim, snow retention, ventilation, and penetrations require installer review."
  ];
  const panelSpec = {
    material: "steel roof panel",
    gauge: 29,
    profile: "exposed fastener",
    coverageWidthIn: panelCoverageFt * 12,
    panelLengthFt,
    finish: "Galvalume or selected color",
    fasteners: "manufacturer-approved screws",
    cutLength: "custom or field-confirmed"
  };
  const linear = (feet: number, role: string, label: string, category = "metal_trim"): TakeoffItem => ({
    productCategoryKey: category,
    assemblyRole: role,
    label,
    productSpecification: { material: "color-matched metal trim", lengthFt: 10, manufacturerCompatible: true },
    formula: `ceil(${label.toLowerCase()} feet / 10 ft trim length)`,
    calculatedQuantity: feet / 10,
    roundedPurchaseQuantity: roundUp(feet / 10),
    unit: "10 ft pieces",
    coverageRate: 10,
    wasteBps: 0,
    assumptions: ["Confirm profile, color, and manufacturer compatibility"],
    confidence: feet > 0 ? "medium" : "low"
  });
  const items: TakeoffItem[] = [
    { productCategoryKey: "metal_panels", assemblyRole: "field_panel", label: "29 gauge exposed fastener metal panels", productSpecification: panelSpec, formula: "ceil(roof area with waste / panel coverage)", calculatedQuantity: roofAreaWaste / panelCoverage, roundedPurchaseQuantity: roundUp(roofAreaWaste / panelCoverage), unit: "panels", coverageRate: panelCoverage, wasteBps: waste, installationWasteBps: waste, nonReturnableCustom: true, assumptions: ["Confirm every panel run before custom ordering"], confidence: missing.length ? "low" : "medium" },
    linear(ridge, "ridge", "Ridge cap"),
    linear(hips, "hip", "Hip cap"),
    linear(valleys, "valley", "Valley trim"),
    linear(rakes, "gable_trim", "Gable trim"),
    linear(eaves, "eave_trim", "Eave trim"),
    linear(eaves + rakes, "drip_edge", "Drip edge"),
    { productCategoryKey: "roof_underlayment", assemblyRole: "underlayment", label: "Synthetic underlayment", productSpecification: { coverageSqFt: 1000, metalRoofApproved: true }, formula: "ceil(roof area with waste / 1000 sq ft per roll)", calculatedQuantity: roofAreaWaste / 1000, roundedPurchaseQuantity: roundUp(roofAreaWaste / 1000), unit: "rolls", coverageRate: 1000, wasteBps: waste, assumptions: ["Confirm underlayment is approved for metal roofing"], confidence: "medium" },
    { productCategoryKey: "ice_water_membrane", assemblyRole: "ice_water", label: "Ice and water membrane", productSpecification: { climateAndCodeVerificationRequired: true }, formula: "ceil((eaves + valleys) / 65 ft per roll)", calculatedQuantity: (eaves + valleys) / 65, roundedPurchaseQuantity: roundUp((eaves + valleys) / 65), unit: "rolls", coverageRate: 65, wasteBps: 0, assumptions: ["Verify code/climate requirements"], confidence: "medium" },
    { productCategoryKey: "pipe_boots", assemblyRole: "pipe_boots", label: "Pipe boots", productSpecification: { metalRoofCompatible: true, pipeCountRequired: true }, formula: "field count required", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm pipe count and sizes"], confidence: "low" },
    { productCategoryKey: "metal_flashing", assemblyRole: "flashing", label: "Wall and penetration flashing", productSpecification: { metalRoofCompatible: true }, formula: "field flashing allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm walls, chimneys, skylights, and transitions"], confidence: "low" },
    { productCategoryKey: "metal_closures", assemblyRole: "closures", label: "Foam closures", productSpecification: { profileMatched: true }, formula: "eave/ridge closure allowance", calculatedQuantity: (eaves + ridge) / 3, roundedPurchaseQuantity: roundUp((eaves + ridge) / 3), unit: "pieces", wasteBps: 0, assumptions: ["Match closure to panel profile"], confidence: "medium" },
    { productCategoryKey: "metal_screws", assemblyRole: "screws", label: "Manufacturer-approved screws", productSpecification: { washered: true, colorMatched: true, manufacturerApproved: true }, formula: "ceil(roof area / 100 sq ft * default screw allowance)", calculatedQuantity: roofArea / 100, roundedPurchaseQuantity: roundUp(roofArea / 100), unit: "allowance units", wasteBps: 0, assumptions: ["Confirm screw pattern with manufacturer"], confidence: "medium" },
    { productCategoryKey: "sealant", assemblyRole: "sealant", label: "Compatible sealants", productSpecification: { metalRoofCompatible: true }, formula: "sealant allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "allowance", wasteBps: 0, assumptions: ["Confirm compatible sealant for trim and penetrations"], confidence: "low" },
    { productCategoryKey: "snow_retention", assemblyRole: "snow_retention", label: "Snow retention review", productSpecification: { optionalByClimateAndCustomer: true }, formula: "review required by roof layout/climate", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "review", wasteBps: 0, quoteRequired: true, assumptions: ["Review snow load, entrances, gutters, and local expectations"], confidence: "low" },
    { productCategoryKey: "roof_ventilation", assemblyRole: "ventilation", label: "Ventilation review", productSpecification: { intakeAndExhaustBalanced: true }, formula: "ventilation review allowance", calculatedQuantity: 1, roundedPurchaseQuantity: 1, unit: "review", wasteBps: 0, quoteRequired: true, assumptions: ["Confirm ridge vent, closures, intake, and warranty requirements"], confidence: "low" }
  ];
  return result(input, missing, items, [
    { label: "Pitch multiplier", formula: "sqrt(12^2 + pitch^2) / 12", value: Number(multiplier.toFixed(3)) },
    { label: "Roof area", formula: "length * width * pitch multiplier * sections", value: Math.round(roofArea), unit: "sq ft" },
    { label: "Panel specification", formula: "build exact spec before supplier search", value: `${panelSpec.gauge} gauge ${panelSpec.profile}, ${panelSpec.coverageWidthIn} inch coverage, ${panelSpec.finish}` },
    { label: "Roof area with waste", formula: "roof area * (1 + waste)", value: Math.round(roofAreaWaste), unit: "sq ft" }
  ], assumptions, [
    {
      warningType: "custom_material_non_returnable",
      severity: "high",
      message: "Custom-cut metal panels are usually non-returnable. Confirm run lengths before ordering.",
      requiresConfirmation: true
    },
    {
      warningType: "quote_only_components",
      severity: "medium",
      message: "Snow retention, ventilation design, and some custom metal components may require supplier quote or installer confirmation.",
      requiresConfirmation: true
    }
  ]);
}

function genericAreaTrade(input: MeasurementInput, config: { category: string; label: string; unit: string; coverage: number; waste: number; tradeNote: string; required?: Array<keyof MeasurementInput> }): TakeoffResult {
  const keys = config.required ?? ["areaSqFt"];
  const missing = addMissing(input, keys, keys.map((key) => String(key)));
  const baseArea = n(input.areaSqFt) ?? ((n(input.lengthFt) ?? 0) * (n(input.widthFt) ?? 0));
  const waste = wasteBps(input, config.waste);
  const areaWaste = withWaste(baseArea, waste);
  const item: TakeoffItem = {
    productCategoryKey: config.category,
    assemblyRole: "primary_material",
    label: config.label,
    productSpecification: { category: config.category, coverage: config.coverage, unit: config.unit, verifiedBeforeSupplierSearch: true },
    formula: `ceil(area with waste / ${config.coverage} ${config.unit} coverage)`,
    calculatedQuantity: areaWaste / config.coverage,
    roundedPurchaseQuantity: roundUp(areaWaste / config.coverage),
    unit: config.unit,
    coverageRate: config.coverage,
    wasteBps: waste,
    assumptions: [config.tradeNote],
    confidence: missing.length ? "low" : "medium"
  };
  return result(input, missing, [item], [
    { label: "Area", formula: "entered area or length * width", value: Math.round(baseArea), unit: "sq ft" },
    { label: "Area with waste", formula: "area * (1 + waste)", value: Math.round(areaWaste), unit: "sq ft" }
  ], [config.tradeNote]);
}

function gutters(input: MeasurementInput): TakeoffResult {
  const missing = n(input.eaveFt) || n(input.perimeterFt) ? [] : ["gutter/eave length"];
  const length = n(input.eaveFt) ?? n(input.perimeterFt) ?? 0;
  const downspouts = Math.max(2, Math.ceil(length / 40));
  const items: TakeoffItem[] = [
    { productCategoryKey: "gutters", assemblyRole: "primary_material", label: "Gutter sections", productSpecification: { profile: "field selected", colorMatchRequired: true }, formula: "ceil(gutter length / 10 ft sections)", calculatedQuantity: length / 10, roundedPurchaseQuantity: roundUp(length / 10), unit: "10 ft sections", coverageRate: 10, wasteBps: 0, assumptions: ["Confirm profile, color, hangers, outlets, and downspout placement"], confidence: missing.length ? "low" : "medium" },
    { productCategoryKey: "gutters", assemblyRole: "downspouts", label: "Downspouts", productSpecification: { outletLocationsRequired: true }, formula: "ceil(gutter length / 40 ft)", calculatedQuantity: downspouts, roundedPurchaseQuantity: downspouts, unit: "downspouts", wasteBps: 0, assumptions: ["Owner/installer should confirm locations"], confidence: "medium" }
  ];
  return result(input, missing, items, [{ label: "Gutter length", formula: "entered eave length or perimeter", value: length, unit: "ft" }], ["Add elbows, outlets, sealant, hangers, end caps, and splash blocks by layout."]);
}

function concrete(input: MeasurementInput): TakeoffResult {
  const missing = addMissing(input, ["lengthFt", "widthFt", "depthIn"], ["length", "width", "depth in inches"]);
  const cubicYards = ((n(input.lengthFt) ?? 0) * (n(input.widthFt) ?? 0) * ((n(input.depthIn) ?? 0) / 12)) / 27;
  const waste = wasteBps(input, 10);
  const total = withWaste(cubicYards, waste);
  const item: TakeoffItem = { productCategoryKey: "concrete", assemblyRole: "primary_material", label: "Concrete", productSpecification: { mixDesignRequired: true, deliveryAccessRequired: true }, formula: "ceil((length * width * depth / 27) with waste)", calculatedQuantity: total, roundedPurchaseQuantity: Number(total.toFixed(2)), unit: "cubic yards", coverageRate: null, wasteBps: waste, quoteRequired: true, assumptions: ["Confirm mix, reinforcement, delivery minimums, site access, and finishing scope"], confidence: missing.length ? "low" : "medium" };
  return result(input, missing, [item], [{ label: "Concrete volume", formula: "length * width * depth(ft) / 27", value: Number(cubicYards.toFixed(2)), unit: "yd³" }], ["Concrete orders need mix design, reinforcement, truck access, and waste reviewed."]);
}

export function calculateMaterialTakeoff(input: MeasurementInput): TakeoffResult {
  switch (input.tradeKey) {
    case "shingle_roofing":
      return shingleRoofing(input);
    case "metal_roofing":
      return metalRoofing(input);
    case "metal_siding":
      return siding(input, true);
    case "vinyl_siding":
      return siding(input, false);
    case "gutters":
      return gutters(input);
    case "framing":
      return genericAreaTrade(input, { category: "framing_lumber", label: "Framing lumber allowance", unit: "allowance units", coverage: 1, waste: 15, tradeNote: "Framing requires span/load/spec review. Treat this as a material allowance until lumber schedule is confirmed." });
    case "drywall":
      return genericAreaTrade(input, { category: "drywall_sheets", label: "Drywall sheets", unit: "4x8 sheets", coverage: 32, waste: 10, tradeNote: "Confirm sheet size, thickness, moisture/fire rating, corner bead, mud, tape, and fasteners." });
    case "flooring":
      return genericAreaTrade(input, { category: "flooring", label: "Flooring", unit: "cartons", coverage: n(input.coveragePerPackage) ?? 20, waste: 8, tradeNote: "Confirm carton coverage, acclimation, underlayment, transitions, and waste for layout." });
    case "concrete":
      return concrete(input);
    case "insulation":
      return genericAreaTrade(input, { category: "insulation", label: "Insulation", unit: "bags/batts", coverage: n(input.coveragePerPackage) ?? 50, waste: 5, tradeNote: "Confirm R-value, cavity depth, vapor barrier, and application area." });
    case "painting":
      return genericAreaTrade(input, { category: "paint", label: "Paint", unit: "gallons", coverage: n(input.coveragePerPackage) ?? 350, waste: 10, tradeNote: "Coverage assumes one coat. Confirm primer, coat count, sheen, surface condition, and interior/exterior use." });
    case "ductwork":
      return genericAreaTrade(input, { category: "ductwork", label: "Basic ductwork allowance", unit: "allowance units", coverage: 1, waste: 10, tradeNote: "Ductwork needs layout, size, airflow, fittings, insulation, and code review." });
    case "plumbing":
      return genericAreaTrade(input, { category: "plumbing_material", label: "Basic plumbing material allowance", unit: "allowance units", coverage: 1, waste: 10, tradeNote: "Plumbing needs fixture count, pipe material, fittings, valves, venting, and code review." });
    case "electrical":
      return genericAreaTrade(input, { category: "electrical_material", label: "Basic electrical material allowance", unit: "allowance units", coverage: 1, waste: 10, tradeNote: "Electrical needs circuit count, wire size, device count, panel capacity, permits, and code review." });
  }
}

export function extractMeasurementsFromNote(note: string): Partial<MeasurementInput> {
  const lower = note.toLowerCase();
  const numbers = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|'|x|by|por)?/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  const dimension = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:x|by|por)\s*(\d+(?:\.\d+)?)/);
  const pitch = lower.match(/(\d+(?:\.\d+)?)\s*(?:\/|-)?\s*12|(\d+(?:\.\d+)?)\s*(?:twelve|doce)/);
  const waste = lower.match(/(\d+(?:\.\d+)?)\s*%?\s*waste/);
  const area = lower.match(/(\d+(?:\.\d+)?)\s*(?:sq\s*ft|square feet|sf)/);
  const height = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:high|height|tall|wall)/);
  const overhang = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:overhang|alero)/);
  const sections = lower.match(/(\d+)\s*(?:sections|sides|planes|lados)/);

  return {
    lengthFt: dimension ? Number(dimension[1]) : numbers[0],
    widthFt: dimension ? Number(dimension[2]) : numbers[1],
    heightFt: height ? Number(height[1]) : undefined,
    areaSqFt: area ? Number(area[1]) : undefined,
    pitchRise: pitch ? Number(pitch[1] ?? pitch[2]) : undefined,
    wastePercent: waste ? Number(waste[1]) : undefined,
    overhangFt: overhang ? Number(overhang[1]) : undefined,
    roofSections: sections ? Number(sections[1]) : undefined
  };
}
