"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { calculateMaterialTakeoff, extractMeasurementsFromNote, type MeasurementInput, type TradeKey } from "@/lib/estimator/takeoff-calculators";
import { queryPostgres } from "@/lib/db/postgres";
import { dollarsToCents } from "@/lib/service-ops/money";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const tradeKeys = [
  "shingle_roofing",
  "metal_roofing",
  "metal_siding",
  "vinyl_siding",
  "gutters",
  "framing",
  "drywall",
  "flooring",
  "concrete",
  "insulation",
  "painting",
  "ductwork",
  "plumbing",
  "electrical"
] as const;

const sourceTypes = ["typed_note", "spoken_note", "audio_translation", "photo_note", "uploaded_plan", "manual_field", "job_record", "future_integration"] as const;

const takeoffSchema = z.object({
  estimateId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  newCustomerName: z.string().max(160).optional(),
  jobTitle: z.string().max(180).optional(),
  tradeKey: z.enum(tradeKeys),
  qualityLevel: z.enum(["budget", "standard", "premium", "custom"]),
  sourceType: z.enum(sourceTypes),
  fieldNote: z.string().max(4000).optional(),
  jobAddress: z.string().max(300).optional(),
  jobPostalCode: z.string().max(20).optional(),
  lengthFt: z.string().optional(),
  widthFt: z.string().optional(),
  heightFt: z.string().optional(),
  areaSqFt: z.string().optional(),
  perimeterFt: z.string().optional(),
  pitchRise: z.string().optional(),
  roofSections: z.string().optional(),
  overhangFt: z.string().optional(),
  ridgeFt: z.string().optional(),
  valleyFt: z.string().optional(),
  eaveFt: z.string().optional(),
  rakeFt: z.string().optional(),
  openingsSqFt: z.string().optional(),
  corners: z.string().optional(),
  wastePercent: z.string().optional(),
  coveragePerPackage: z.string().optional(),
  panelCoverageWidthIn: z.string().optional(),
  panelLengthFt: z.string().optional(),
  depthIn: z.string().optional(),
  laborCost: z.string().optional(),
  equipmentCost: z.string().optional(),
  deliveryCost: z.string().optional(),
  disposalCost: z.string().optional(),
  permitCost: z.string().optional(),
  overheadCost: z.string().optional(),
  contingencyCost: z.string().optional(),
  markupPercent: z.string().optional(),
  crewSize: z.string().optional(),
  tearoutHours: z.string().optional(),
  installHours: z.string().optional(),
  laborRate: z.string().optional(),
  crewExperience: z.enum(["unknown", "new", "average", "experienced"]).default("unknown"),
  stories: z.string().optional(),
  accessDifficulty: z.enum(["normal", "tight", "difficult", "high_risk"]).default("normal"),
  tearoffLayers: z.string().optional(),
  travelHours: z.string().optional(),
  setupHours: z.string().optional(),
  materialHandlingHours: z.string().optional(),
  mobilizationCost: z.string().optional(),
  equipmentNotes: z.string().max(1200).optional(),
  weatherRisk: z.enum(["normal", "watch", "high"]).default("normal"),
  laborNotes: z.string().max(1200).optional(),
  marketPriceLow: z.string().optional(),
  marketPriceHigh: z.string().optional(),
  marketPriceSource: z.string().max(400).optional(),
  marketPriceNotes: z.string().max(1200).optional(),
  customerDisplayMode: z.enum(["simple", "grouped", "detailed"]),
  customerIntro: z.string().max(1200).optional(),
  customerScopeSummary: z.string().max(1600).optional(),
  customerExclusions: z.string().max(1200).optional(),
  customerTerms: z.string().max(1200).optional(),
  customerNextSteps: z.string().max(1200).optional(),
  showLineItemPrices: z.boolean().default(true),
  showQuantities: z.boolean().default(true),
  showMaterialDetails: z.boolean().default(false),
  showLaborDetails: z.boolean().default(false),
  showOverheadDetails: z.boolean().default(false),
  showProfitDetails: z.boolean().default(false)
});

const bidSchema = z.object({
  takeoffId: z.string().uuid()
});

const recordIdSchema = z.object({
  id: z.string().uuid()
});

const inventoryDecisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["recommended", "reserved", "rejected"])
});

const approvalDecisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "dismissed"])
});

const changeOrderSchema = z.object({
  estimateId: z.string().uuid(),
  changeType: z.enum(["scope_change", "hidden_damage", "customer_upgrade", "additional_labor", "additional_materials", "deductible_or_insurance", "other"]),
  title: z.string().min(1).max(180),
  description: z.string().max(1200).optional(),
  amountCents: z.number().int().min(0)
});

const validationSchema = z.object({
  estimateId: z.string().uuid().optional(),
  takeoffId: z.string().uuid().optional(),
  kind: z.enum(["plan", "compliance", "insurance"]),
  type: z.string().max(80).optional(),
  notes: z.string().max(1200).optional()
});

const manualPriceSchema = z.object({
  takeoffItemId: z.string().uuid(),
  supplierName: z.string().max(180).optional(),
  priceType: z.enum(["public", "contractor", "volume", "rebate", "quote", "tax_exempt", "negotiated", "cached", "manual"]).default("manual"),
  unitPriceCents: z.number().int().min(0),
  packageQuantity: z.coerce.number().min(0.0001).max(999999).default(1),
  packageUnit: z.string().max(40).optional(),
  expiresInDays: z.coerce.number().int().min(0).max(365).optional(),
  confidence: z.enum(["unverified", "website_stock", "api_stock", "phone_confirmed", "reserved", "ordered", "backordered"]).default("unverified"),
  source: z.string().max(400).optional(),
  notes: z.string().max(1200).optional()
});

const substitutionSchema = z.object({
  takeoffItemId: z.string().uuid(),
  substituteName: z.string().min(1).max(180),
  notes: z.string().max(1200).optional()
});

const priceImportSchema = z.object({
  supplierName: z.string().min(1).max(180),
  importName: z.string().max(180).optional(),
  csvText: z.string().max(120000).optional(),
  fileName: z.string().max(240).optional()
});

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function cents(value?: string) {
  return dollarsToCents(value ?? null);
}

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function parseCsv(textValue: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < textValue.length; index += 1) {
    const char = textValue[index];
    const next = textValue[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rowValue(headers: string[], row: string[], keys: string[]) {
  for (const key of keys) {
    const index = headers.indexOf(key);
    if (index >= 0 && row[index]?.trim()) return row[index].trim();
  }
  return undefined;
}

function revalidateEstimator() {
  revalidatePath("/app/estimator");
  revalidatePath("/app/job-tracker");
}

async function ensureCustomer(tenantId: string, parsed: z.infer<typeof takeoffSchema>) {
  if (parsed.customerId) return parsed.customerId;
  if (!parsed.newCustomerName) return null;
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.customers (tenant_id, name, notes, ai_summary)
    values ($1,$2,$3,$4)
    returning id
    `,
    [
      tenantId,
      parsed.newCustomerName,
      "Created from AI Estimator and material takeoff flow.",
      "Customer created while preparing a reviewed takeoff. Confirm contact details before sending a bid."
    ]
  );
  return result?.rows[0]?.id ?? null;
}

async function ensureEstimate(tenantId: string, parsed: z.infer<typeof takeoffSchema>) {
  if (parsed.estimateId) return parsed.estimateId;
  const customerId = await ensureCustomer(tenantId, parsed);
  if (!customerId) return null;
  const title = parsed.jobTitle || `${parsed.tradeKey.replaceAll("_", " ")} estimate`;
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.service_estimates (
      tenant_id, customer_id, title, status, subtotal_cents, total_cents,
      customer_summary, internal_notes, manual_follow_up_draft, estimator_status
    )
    values ($1,$2,$3,'draft',0,0,$4,$5,$6,'draft_takeoff')
    returning id
    `,
    [
      tenantId,
      customerId,
      title,
      "Draft estimate created by AI Estimator. Review measurements, assumptions, material selections, and margin before sending.",
      parsed.fieldNote ?? null,
      "I am preparing the estimate and will follow up once the reviewed scope and pricing are ready."
    ]
  );
  return result?.rows[0]?.id ?? null;
}

function inputFromParsed(parsed: z.infer<typeof takeoffSchema>): MeasurementInput {
  const extracted = extractMeasurementsFromNote(parsed.fieldNote ?? "");
  return {
    ...extracted,
    tradeKey: parsed.tradeKey as TradeKey,
    originalNote: parsed.fieldNote,
    sourceType: parsed.sourceType,
    qualityLevel: parsed.qualityLevel,
    jobAddress: parsed.jobAddress,
    jobPostalCode: parsed.jobPostalCode,
    lengthFt: num(parsed.lengthFt) ?? extracted.lengthFt,
    widthFt: num(parsed.widthFt) ?? extracted.widthFt,
    heightFt: num(parsed.heightFt) ?? extracted.heightFt,
    areaSqFt: num(parsed.areaSqFt) ?? extracted.areaSqFt,
    perimeterFt: num(parsed.perimeterFt),
    pitchRise: num(parsed.pitchRise) ?? extracted.pitchRise,
    roofSections: num(parsed.roofSections) ?? extracted.roofSections,
    overhangFt: num(parsed.overhangFt) ?? extracted.overhangFt,
    ridgeFt: num(parsed.ridgeFt),
    valleyFt: num(parsed.valleyFt),
    eaveFt: num(parsed.eaveFt),
    rakeFt: num(parsed.rakeFt),
    openingsSqFt: num(parsed.openingsSqFt),
    corners: num(parsed.corners),
    wastePercent: num(parsed.wastePercent) ?? extracted.wastePercent,
    coveragePerPackage: num(parsed.coveragePerPackage),
    panelCoverageWidthIn: num(parsed.panelCoverageWidthIn),
    panelLengthFt: num(parsed.panelLengthFt),
    depthIn: num(parsed.depthIn)
  };
}

function buildCosts(parsed: z.infer<typeof takeoffSchema>, materialCostCents: number) {
  const crewSize = num(parsed.crewSize);
  const tearoutHours = num(parsed.tearoutHours) ?? 0;
  const installHours = num(parsed.installHours) ?? 0;
  const travelHours = num(parsed.travelHours) ?? 0;
  const setupHours = num(parsed.setupHours) ?? 0;
  const materialHandlingHours = num(parsed.materialHandlingHours) ?? 0;
  const extraLaborHours = travelHours + setupHours + materialHandlingHours;
  const laborRateCents = cents(parsed.laborRate);
  const calculatedLaborCents =
    crewSize && laborRateCents && (tearoutHours || installHours || extraLaborHours)
      ? Math.round((tearoutHours + installHours + extraLaborHours) * crewSize * laborRateCents)
      : 0;
  const laborCostCents = cents(parsed.laborCost) || calculatedLaborCents;
  const directCosts =
    materialCostCents +
    laborCostCents +
    cents(parsed.equipmentCost) +
    cents(parsed.deliveryCost) +
    cents(parsed.disposalCost) +
    cents(parsed.permitCost) +
    cents(parsed.mobilizationCost) +
    cents(parsed.overheadCost) +
    cents(parsed.contingencyCost);
  const markupBps = Math.round((num(parsed.markupPercent) ?? 25) * 100);
  const markupCents = Math.round(directCosts * (markupBps / 10000));
  return {
    crewSize,
    tearoutHours,
    installHours,
    estimatedDurationHours: crewSize ? tearoutHours + installHours + extraLaborHours : undefined,
    travelHours,
    setupHours,
    materialHandlingHours,
    laborRateCents,
    laborCostCents,
    overheadCostCents: cents(parsed.overheadCost),
    directCosts,
    markupBps,
    markupCents,
    recommendedCustomerPriceCents: directCosts + markupCents
  };
}

async function createEstimateVersionSnapshot(tenantId: string, estimateId: string, reason: string) {
  const snapshotResult = await queryPostgres<{
    estimate: Record<string, unknown>;
    line_items: Record<string, unknown>[];
  }>(
    `
    select
      to_jsonb(e.*) as estimate,
      coalesce(jsonb_agg(to_jsonb(li.*) order by li.position, li.created_at) filter (where li.id is not null), '[]'::jsonb) as line_items
    from public.service_estimates e
    left join public.estimate_line_items li on li.tenant_id = e.tenant_id and li.estimate_id = e.id
    where e.tenant_id = $1 and e.id = $2
    group by e.id
    limit 1
    `,
    [tenantId, estimateId]
  );
  const snapshot = snapshotResult?.rows[0];
  if (!snapshot) return;

  await queryPostgres(
    `
    insert into public.estimate_versions (tenant_id, estimate_id, version_number, reason, snapshot_json)
    values (
      $1,
      $2,
      coalesce((select max(version_number) + 1 from public.estimate_versions where tenant_id = $1 and estimate_id = $2), 1),
      $3,
      $4::jsonb
    )
    `,
    [
      tenantId,
      estimateId,
      reason,
      JSON.stringify({
        estimate: snapshot.estimate,
        lineItems: snapshot.line_items,
        capturedAt: new Date().toISOString()
      })
    ]
  );
}

async function createEstimatorFoundationRecords(tenantId: string, estimateId: string, takeoffId: string, calculation: ReturnType<typeof calculateMaterialTakeoff>, costs: ReturnType<typeof buildCosts>, qualityLevel: string) {
  await queryPostgres(
    `
    insert into public.estimator_quality_tier_systems (
      tenant_id, trade_key, quality_level, system_label, required_roles, allowed_substitution_level,
      warranty_requirement, status, metadata_json
    )
    values ($1,$2,$3,$4,$5,'manager_approval',$6,'draft',$7::jsonb)
    on conflict (tenant_id, trade_key, quality_level) do update
    set required_roles = excluded.required_roles,
        warranty_requirement = excluded.warranty_requirement,
        metadata_json = excluded.metadata_json,
        updated_at = now()
    `,
    [
      tenantId,
      calculation.tradeKey,
      qualityLevel,
      `${calculation.systemAssembly.label} / ${qualityLevel}`,
      calculation.systemAssembly.requiredRoles,
      "Use complete compatible systems. Do not mix premium field products with economy accessories without approval.",
      JSON.stringify({ source: "ai_estimator", systemAssembly: calculation.systemAssembly })
    ]
  );

  await queryPostgres(
    `
    insert into public.estimator_approval_requirements (
      tenant_id, estimate_id, takeoff_id, requirement_key, role_required, risk_level, reason, metadata_json
    )
    values
      ($1,$2,$3,'send_bid_review','estimator','medium','Estimator must review scope, formulas, customer presentation, and open warnings before sending.',$4::jsonb),
      ($1,$2,$3,'purchase_review','purchasing','high','Purchasing must review supplier, price age, substitutions, inventory, delivery, and quote-only items before ordering.',$4::jsonb)
    on conflict (tenant_id, takeoff_id, requirement_key) do update
    set reason = excluded.reason,
        metadata_json = excluded.metadata_json,
        updated_at = now()
    `,
    [tenantId, estimateId, takeoffId, JSON.stringify({ source: "ai_estimator", confidence: calculation.confidence })]
  );

  if (calculation.warnings.some((warning) => warning.severity === "blocking" || warning.warningType === "conflicting_measurements")) {
    await queryPostgres(
      `
      insert into public.estimator_approval_requirements (
        tenant_id, estimate_id, takeoff_id, requirement_key, role_required, risk_level, reason, metadata_json
      )
      values ($1,$2,$3,'measurement_confirmation','manager','blocking','Measurements conflict or are incomplete. Confirm dimensions before bid, order, or schedule.',$4::jsonb)
      on conflict (tenant_id, takeoff_id, requirement_key) do update
      set risk_level = excluded.risk_level,
          reason = excluded.reason,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `,
      [tenantId, estimateId, takeoffId, JSON.stringify({ warnings: calculation.warnings })]
    );
  }

  if (costs.markupBps < 1500) {
    await queryPostgres(
      `
      insert into public.estimator_approval_requirements (
        tenant_id, estimate_id, takeoff_id, requirement_key, role_required, risk_level, reason, metadata_json
      )
      values ($1,$2,$3,'low_margin_review','owner','high','Markup is below 15%. Owner approval is required before reducing margin.',$4::jsonb)
      on conflict (tenant_id, takeoff_id, requirement_key) do update
      set risk_level = excluded.risk_level,
          reason = excluded.reason,
          metadata_json = excluded.metadata_json,
          updated_at = now()
      `,
      [tenantId, estimateId, takeoffId, JSON.stringify({ markupBps: costs.markupBps })]
    );
  }

  const itemsResult = await queryPostgres<{
    id: string;
    product_category_key: string;
    label: string;
    rounded_purchase_quantity: string;
    unit: string;
    quote_required: boolean;
    product_specification_json: Record<string, unknown>;
  }>(
    `
    select id, product_category_key, label, rounded_purchase_quantity::text, unit, quote_required, product_specification_json
    from public.material_takeoff_items
    where tenant_id = $1 and takeoff_id = $2 and status <> 'removed'
    order by product_category_key, label
    `,
    [tenantId, takeoffId]
  );

  for (const item of itemsResult?.rows ?? []) {
    const requiredQuantity = Number(item.rounded_purchase_quantity);
    await queryPostgres(
      `
      insert into public.estimator_package_options (
        tenant_id, takeoff_id, takeoff_item_id, option_name, package_strategy, purchase_quantity,
        estimated_landed_cost_cents, delivery_notes, optimization_notes, metadata_json
      )
      values ($1,$2,$3,$4,'needs_supplier_packages',$5,0,$6,$7,$8::jsonb)
      `,
      [
        tenantId,
        takeoffId,
        item.id,
        `${item.label} package review`,
        requiredQuantity,
        "Delivery, minimum order, boom/fuel surcharge, jobsite access, and multiple trips must be checked before order.",
        "Supplier package sizes and account pricing are needed before Ferocity can optimize bundles, pallets, or quantity breaks.",
        JSON.stringify({ unit: item.unit, source: "ai_estimator" })
      ]
    );

    if (item.quote_required) {
      await queryPostgres(
        `
        insert into public.estimator_quote_requests (
          tenant_id, estimate_id, takeoff_id, takeoff_item_id, product_category_key, requested_spec_json, reason, metadata_json
        )
        values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb)
        on conflict (tenant_id, takeoff_item_id) do update
        set requested_spec_json = excluded.requested_spec_json,
            reason = excluded.reason,
            status = 'needed',
            updated_at = now()
        `,
        [
          tenantId,
          estimateId,
          takeoffId,
          item.id,
          item.product_category_key,
          JSON.stringify(item.product_specification_json ?? {}),
          "This component is quote-only or low-confidence. Do not invent price.",
          JSON.stringify({ source: "ai_estimator" })
        ]
      );
    }

    await queryPostgres(
      `
      insert into public.estimator_inventory_matches (
        tenant_id, estimate_id, takeoff_id, takeoff_item_id, inventory_item_id,
        match_status, available_quantity, required_quantity, usable_quantity, confidence, notes, metadata_json
      )
      select $1,$2,$3,$4,i.id,
        'possible',
        i.quantity,
        $5::numeric,
        least(i.quantity, $5::numeric),
        case when lower(i.unit) = lower($6) then 'medium' else 'low' end,
        'Possible existing stock. Confirm material, color/spec, condition, location, and whether it is leftover job inventory before using.',
        jsonb_build_object('inventoryLocation', i.location, 'inventoryStatus', i.status, 'source', 'service_inventory_items')
      from public.service_inventory_items i
      where i.tenant_id = $1
        and i.status = 'available'
        and i.quantity > 0
        and (
          lower(i.name) like '%' || lower(split_part($7, ' ', 1)) || '%'
          or lower(coalesce(i.notes, '')) like '%' || lower($8) || '%'
        )
      order by i.quantity desc
      limit 3
      on conflict (tenant_id, takeoff_item_id, inventory_item_id) do update
      set available_quantity = excluded.available_quantity,
          required_quantity = excluded.required_quantity,
          usable_quantity = excluded.usable_quantity,
          confidence = excluded.confidence,
          notes = excluded.notes,
          metadata_json = excluded.metadata_json
      `,
      [tenantId, estimateId, takeoffId, item.id, requiredQuantity, item.unit, item.label, item.product_category_key]
    );
  }
}

export async function createEstimatorTakeoffAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = takeoffSchema.safeParse({
    estimateId: text(formData, "estimateId"),
    customerId: text(formData, "customerId"),
    newCustomerName: text(formData, "newCustomerName"),
    jobTitle: text(formData, "jobTitle"),
    tradeKey: text(formData, "tradeKey"),
    qualityLevel: text(formData, "qualityLevel") ?? "standard",
    sourceType: text(formData, "sourceType") ?? "typed_note",
    fieldNote: text(formData, "fieldNote"),
    jobAddress: text(formData, "jobAddress"),
    jobPostalCode: text(formData, "jobPostalCode"),
    lengthFt: text(formData, "lengthFt"),
    widthFt: text(formData, "widthFt"),
    heightFt: text(formData, "heightFt"),
    areaSqFt: text(formData, "areaSqFt"),
    perimeterFt: text(formData, "perimeterFt"),
    pitchRise: text(formData, "pitchRise"),
    roofSections: text(formData, "roofSections"),
    overhangFt: text(formData, "overhangFt"),
    ridgeFt: text(formData, "ridgeFt"),
    valleyFt: text(formData, "valleyFt"),
    eaveFt: text(formData, "eaveFt"),
    rakeFt: text(formData, "rakeFt"),
    openingsSqFt: text(formData, "openingsSqFt"),
    corners: text(formData, "corners"),
    wastePercent: text(formData, "wastePercent"),
    coveragePerPackage: text(formData, "coveragePerPackage"),
    panelCoverageWidthIn: text(formData, "panelCoverageWidthIn"),
    panelLengthFt: text(formData, "panelLengthFt"),
    depthIn: text(formData, "depthIn"),
    laborCost: text(formData, "laborCost"),
    equipmentCost: text(formData, "equipmentCost"),
    deliveryCost: text(formData, "deliveryCost"),
    disposalCost: text(formData, "disposalCost"),
    permitCost: text(formData, "permitCost"),
    overheadCost: text(formData, "overheadCost"),
    contingencyCost: text(formData, "contingencyCost"),
    markupPercent: text(formData, "markupPercent"),
    crewSize: text(formData, "crewSize"),
    tearoutHours: text(formData, "tearoutHours"),
    installHours: text(formData, "installHours"),
    laborRate: text(formData, "laborRate"),
    crewExperience: text(formData, "crewExperience") ?? "unknown",
    stories: text(formData, "stories"),
    accessDifficulty: text(formData, "accessDifficulty") ?? "normal",
    tearoffLayers: text(formData, "tearoffLayers"),
    travelHours: text(formData, "travelHours"),
    setupHours: text(formData, "setupHours"),
    materialHandlingHours: text(formData, "materialHandlingHours"),
    mobilizationCost: text(formData, "mobilizationCost"),
    equipmentNotes: text(formData, "equipmentNotes"),
    weatherRisk: text(formData, "weatherRisk") ?? "normal",
    laborNotes: text(formData, "laborNotes"),
    marketPriceLow: text(formData, "marketPriceLow"),
    marketPriceHigh: text(formData, "marketPriceHigh"),
    marketPriceSource: text(formData, "marketPriceSource"),
    marketPriceNotes: text(formData, "marketPriceNotes"),
    customerDisplayMode: text(formData, "customerDisplayMode") ?? "grouped",
    customerIntro: text(formData, "customerIntro"),
    customerScopeSummary: text(formData, "customerScopeSummary"),
    customerExclusions: text(formData, "customerExclusions"),
    customerTerms: text(formData, "customerTerms"),
    customerNextSteps: text(formData, "customerNextSteps"),
    showLineItemPrices: checkbox(formData, "showLineItemPrices"),
    showQuantities: checkbox(formData, "showQuantities"),
    showMaterialDetails: checkbox(formData, "showMaterialDetails"),
    showLaborDetails: checkbox(formData, "showLaborDetails"),
    showOverheadDetails: checkbox(formData, "showOverheadDetails"),
    showProfitDetails: checkbox(formData, "showProfitDetails")
  });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const estimateId = await ensureEstimate(tenantId, parsed.data);
  if (!estimateId) return;

  const input = inputFromParsed(parsed.data);
  const calculation = calculateMaterialTakeoff(input);
  const materialCostCents = 0;
  const costs = buildCosts(parsed.data, materialCostCents);

  const profileResult = await queryPostgres<{ id: string }>(
    `
    insert into public.estimating_profiles (
      tenant_id, name, profile_key, trade_key, quality_level, default_waste_bps, material_markup_bps,
      preferred_suppliers, preferred_brands, allowed_substitutions, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,'{}','{}','owner_review',$8::jsonb)
    on conflict (tenant_id, profile_key, trade_key) do update
    set quality_level = excluded.quality_level,
        default_waste_bps = excluded.default_waste_bps,
        material_markup_bps = excluded.material_markup_bps,
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      `${parsed.data.qualityLevel[0].toUpperCase()}${parsed.data.qualityLevel.slice(1)} ${parsed.data.tradeKey.replaceAll("_", " ")}`,
      parsed.data.qualityLevel,
      parsed.data.tradeKey,
      parsed.data.qualityLevel,
      Math.round((num(parsed.data.wastePercent) ?? 10) * 100),
      costs.markupBps,
      JSON.stringify({ createdBy: "ai_estimator_takeoff" })
    ]
  );
  const profileId = profileResult?.rows[0]?.id ?? null;

  const takeoffResult = await queryPostgres<{ id: string }>(
    `
    insert into public.material_takeoffs (
      tenant_id, estimate_id, estimating_profile_id, trade_key, source_type, status,
      original_input, interpreted_input, job_address, job_postal_code, quality_level,
      waste_bps, material_cost_cents, labor_cost_cents, overhead_cost_cents, markup_cents,
      recommended_customer_price_cents, confidence, missing_information, confirmation_required,
      formulas_json, metadata_json
      , crew_size, tearout_hours, install_hours, estimated_duration_hours, labor_rate_cents,
      market_price_low_cents, market_price_high_cents, market_price_source, market_price_checked_at, market_price_notes
      , system_assembly_key, system_assembly_json, product_specifications_json, pricing_guardrails_json, review_thresholds_json
      , labor_factors_json, quality_tier_rules_json, readiness_score
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,
      $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb,$35::jsonb,$36::jsonb,$37::jsonb,$38::jsonb,$39::jsonb,$40)
    returning id
    `,
    [
      tenantId,
      estimateId,
      profileId,
      parsed.data.tradeKey,
      parsed.data.sourceType,
      calculation.status,
      parsed.data.fieldNote ?? null,
      calculation.interpretedInput,
      parsed.data.jobAddress ?? null,
      parsed.data.jobPostalCode ?? null,
      parsed.data.qualityLevel,
      Math.round((num(parsed.data.wastePercent) ?? 10) * 100),
      materialCostCents,
      costs.laborCostCents,
      costs.overheadCostCents,
      costs.markupCents,
      costs.recommendedCustomerPriceCents,
      calculation.confidence,
      calculation.missingInformation,
      calculation.status !== "ready_for_bid",
      JSON.stringify(calculation.formulas),
      JSON.stringify({
        measurements: calculation.measurements,
        costs,
        source: "ai_estimator",
        approvalRequired: true,
        supplierLookupMode: "manual_or_provider_ready",
        customerPresentation: {
          mode: parsed.data.customerDisplayMode,
          showLineItemPrices: parsed.data.showLineItemPrices,
          showQuantities: parsed.data.showQuantities,
          showMaterialDetails: parsed.data.showMaterialDetails,
          showLaborDetails: parsed.data.showLaborDetails,
          showOverheadDetails: parsed.data.showOverheadDetails,
          showProfitDetails: parsed.data.showProfitDetails
        }
      }),
      costs.crewSize ?? null,
      costs.tearoutHours || null,
      costs.installHours || null,
      costs.estimatedDurationHours ?? null,
      costs.laborRateCents,
      cents(parsed.data.marketPriceLow) || null,
      cents(parsed.data.marketPriceHigh) || null,
      parsed.data.marketPriceSource ?? null,
      parsed.data.marketPriceSource ? new Date().toISOString() : null,
      parsed.data.marketPriceNotes ?? null,
      calculation.systemAssembly.key,
      JSON.stringify(calculation.systemAssembly),
      JSON.stringify(calculation.items.map((item) => item.productSpecification ?? {})),
      JSON.stringify(calculation.pricingGuardrails),
      JSON.stringify(calculation.reviewThresholds),
      JSON.stringify({
        crewExperience: parsed.data.crewExperience,
        stories: num(parsed.data.stories) ?? null,
        accessDifficulty: parsed.data.accessDifficulty,
        tearoffLayers: num(parsed.data.tearoffLayers) ?? null,
        travelHours: costs.travelHours,
        setupHours: costs.setupHours,
        materialHandlingHours: costs.materialHandlingHours,
        mobilizationCostCents: cents(parsed.data.mobilizationCost),
        equipmentNotes: parsed.data.equipmentNotes ?? null,
        weatherRisk: parsed.data.weatherRisk
      }),
      JSON.stringify({
        qualityLevel: parsed.data.qualityLevel,
        completeSystemRequired: true,
        compatibleAccessoriesRequired: true,
        substitutionApproval: parsed.data.qualityLevel === "premium" ? "owner_approval" : "manager_approval"
      }),
      Math.max(0, 100 - calculation.warnings.length * 15 - calculation.missingInformation.length * 20)
    ]
  );
  const takeoffId = takeoffResult?.rows[0]?.id;
  if (!takeoffId) return;

  for (const item of calculation.items) {
    await queryPostgres(
      `
      insert into public.material_takeoff_items (
        tenant_id, takeoff_id, product_category_key, label, formula, original_measurements_json,
        waste_bps, coverage_rate, calculated_quantity, rounded_purchase_quantity, unit,
        assumptions, confidence, estimated_unit_price_cents, estimated_total_cents, status, metadata_json
        , assembly_role, product_specification_json, pricing_type, pricing_confidence,
        installation_waste_bps, purchased_overage_bps, returnable_extra_bps,
        non_returnable_custom, quote_required, substitute_allowed, compatibility_notes
      )
      values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,0,0,$14,$15::jsonb,
        $16,$17::jsonb,'unpriced','unverified',$18,$19,$20,$21,$22,$23,$24)
      `,
      [
        tenantId,
        takeoffId,
        item.productCategoryKey,
        item.label,
        item.formula,
        JSON.stringify(calculation.measurements),
        item.wasteBps,
        item.coverageRate ?? null,
        item.calculatedQuantity,
        item.roundedPurchaseQuantity,
        item.unit,
        item.assumptions,
        item.confidence,
        item.productCategoryKey ? "needs_product" : "draft",
        JSON.stringify({ formula: item.formula, source: "calculator" }),
        item.assemblyRole ?? null,
        JSON.stringify(item.productSpecification ?? {}),
        item.installationWasteBps ?? item.wasteBps,
        item.purchasedOverageBps ?? 0,
        item.returnableExtraBps ?? 0,
        item.nonReturnableCustom ?? false,
        item.quoteRequired ?? false,
        item.substituteAllowed ?? false,
        item.compatibilityNotes ?? null
      ]
    );
  }

  for (const warning of calculation.warnings) {
    await queryPostgres(
      `
      insert into public.estimate_warnings (
        tenant_id, estimate_id, takeoff_id, warning_type, severity, message, requires_confirmation, metadata_json
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [tenantId, estimateId, takeoffId, warning.warningType, warning.severity, warning.message, warning.requiresConfirmation, JSON.stringify({ source: "ai_estimator" })]
    );
  }

  await createEstimatorFoundationRecords(tenantId, estimateId, takeoffId, calculation, costs, parsed.data.qualityLevel);

  await queryPostgres(
    `
    update public.service_estimates
    set estimating_profile_id = $1,
        material_cost_cents = $2,
        labor_cost_cents = $3,
        overhead_cost_cents = $4,
        profit_cents = $5,
        estimator_status = $6,
        customer_display_mode = $7,
        customer_intro = $8,
        customer_scope_summary = $9,
        customer_exclusions = $10,
        payment_terms = $11,
        customer_next_steps = $12,
        show_line_item_prices = $13,
        show_quantities = $14,
        show_material_details = $15,
        show_labor_details = $16,
        show_overhead_details = $17,
        show_profit_details = $18,
        estimated_crew_size = $19,
        estimated_tearout_hours = $20,
        estimated_install_hours = $21,
        estimated_duration_hours = $22,
        labor_rate_cents = $23,
        labor_notes = $24,
        market_price_low_cents = $25,
        market_price_high_cents = $26,
        market_price_source = $27,
        market_price_checked_at = $28,
        market_price_notes = $29,
        internal_notes = concat_ws(E'\n\n', internal_notes, $30),
        updated_at = now()
    where tenant_id = $31 and id = $32
    `,
    [
      profileId,
      materialCostCents,
      costs.laborCostCents,
      costs.overheadCostCents,
      costs.markupCents,
      calculation.status === "ready_for_bid" ? "ready_for_bid" : "review_required",
      parsed.data.customerDisplayMode,
      parsed.data.customerIntro ?? "Thanks for the opportunity. Below is the reviewed scope and estimated investment for this work.",
      parsed.data.customerScopeSummary ?? calculation.interpretedInput,
      parsed.data.customerExclusions ?? null,
      parsed.data.customerTerms ?? null,
      parsed.data.customerNextSteps ?? "Reply with questions or approval. We will confirm schedule, product choices, and any required deposits before work begins.",
      parsed.data.showLineItemPrices,
      parsed.data.showQuantities,
      parsed.data.showMaterialDetails,
      parsed.data.showLaborDetails,
      parsed.data.showOverheadDetails,
      parsed.data.showProfitDetails,
      costs.crewSize ?? null,
      costs.tearoutHours || null,
      costs.installHours || null,
      costs.estimatedDurationHours ?? null,
      costs.laborRateCents,
      [
        parsed.data.laborNotes,
        parsed.data.equipmentNotes ? `Equipment: ${parsed.data.equipmentNotes}` : null,
        parsed.data.weatherRisk !== "normal" ? `Weather risk: ${parsed.data.weatherRisk}` : null,
        parsed.data.accessDifficulty !== "normal" ? `Access: ${parsed.data.accessDifficulty}` : null
      ].filter(Boolean).join("\n") || null,
      cents(parsed.data.marketPriceLow) || null,
      cents(parsed.data.marketPriceHigh) || null,
      parsed.data.marketPriceSource ?? null,
      parsed.data.marketPriceSource ? new Date().toISOString() : null,
      parsed.data.marketPriceNotes ?? null,
      `AI Estimator prepared a ${parsed.data.tradeKey.replaceAll("_", " ")} takeoff. Review measurements, assumptions, supplier pricing, products, and warnings before sending.`,
      tenantId,
      estimateId
    ]
  );

  revalidatePath("/app/estimator");
  revalidatePath("/app/job-tracker");
  revalidatePath(`/app/service/estimates/${estimateId}`);
}

export async function createBidFromTakeoffAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = bidSchema.safeParse({ takeoffId: text(formData, "takeoffId") });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const takeoffResult = await queryPostgres<{
    id: string;
    estimate_id: string;
    trade_key: string;
    interpreted_input: string | null;
    recommended_customer_price_cents: number;
    material_cost_cents: number;
    labor_cost_cents: number;
    overhead_cost_cents: number;
    markup_cents: number;
    metadata_json: Record<string, unknown> | null;
    status: string;
  }>(
    `
    select id, estimate_id, trade_key, interpreted_input, recommended_customer_price_cents,
      material_cost_cents, labor_cost_cents, overhead_cost_cents, markup_cents, metadata_json, status
    from public.material_takeoffs
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, parsed.data.takeoffId]
  );
  const takeoff = takeoffResult?.rows[0];
  if (!takeoff) return;

  await createEstimateVersionSnapshot(tenantId, takeoff.estimate_id, "before_ai_estimator_bid_draft");

  const itemsResult = await queryPostgres<{ label: string; rounded_purchase_quantity: string; unit: string }>(
    `
    select label, rounded_purchase_quantity::text, unit
    from public.material_takeoff_items
    where tenant_id = $1 and takeoff_id = $2 and status <> 'removed'
    order by product_category_key, label
    `,
    [tenantId, takeoff.id]
  );
  const materialSummary = (itemsResult?.rows ?? [])
    .map((item) => `${item.label}: ${item.rounded_purchase_quantity} ${item.unit}`)
    .join("\n");
  const metadata = (takeoff.metadata_json ?? {}) as {
    customerPresentation?: {
      mode?: "simple" | "grouped" | "detailed";
      showMaterialDetails?: boolean;
      showLaborDetails?: boolean;
      showOverheadDetails?: boolean;
      showProfitDetails?: boolean;
    };
  };
  const presentation = metadata.customerPresentation ?? {};
  const tradeLabel = takeoff.trade_key.replaceAll("_", " ");

  await queryPostgres(
    `
    delete from public.estimate_line_items
    where tenant_id = $1 and estimate_id = $2 and group_key = 'ai_estimator_bid'
    `,
    [tenantId, takeoff.estimate_id]
  );

  if (presentation.mode === "detailed" || presentation.showMaterialDetails || presentation.showLaborDetails) {
    const rows: Array<[string, string, string, number, number]> = [];
    if (presentation.showMaterialDetails) {
      rows.push([
        `${tradeLabel} materials`,
        `Material takeoff summary:\n${materialSummary || "Material list prepared for owner review."}`,
        "material",
        takeoff.material_cost_cents,
        900
      ]);
    }
    if (presentation.showLaborDetails) {
      rows.push([
        `${tradeLabel} labor`,
        "Tear-out, installation, cleanup, and normal job labor based on the reviewed work plan.",
        "labor",
        takeoff.labor_cost_cents,
        901
      ]);
    }
    const privateRemainder = Math.max(takeoff.recommended_customer_price_cents - rows.reduce((sum, row) => sum + row[3], 0), 0);
    rows.push([
      `${tradeLabel} project total`,
      "Equipment, delivery, disposal, permits, overhead, contingency, and margin are included in the reviewed project price.",
      "service",
      privateRemainder,
      902
    ]);
    for (const [name, description, type, amount, position] of rows.filter((row) => row[3] > 0)) {
      await queryPostgres(
        `
        insert into public.estimate_line_items (
          tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents, position,
          line_item_type, group_key, customer_visible, customer_label, internal_cost_cents, internal_notes
        )
        values ($1,$2,$3,$4,1,$5,$5,$6,$7,'ai_estimator_bid',true,$3,$8,$9)
        `,
        [
          tenantId,
          takeoff.estimate_id,
          name,
          description,
          amount,
          position,
          type,
          type === "service" ? takeoff.overhead_cost_cents + takeoff.markup_cents : amount,
          "Created from AI Estimator. Review before sending."
        ]
      );
    }
  } else {
    await queryPostgres(
      `
      insert into public.estimate_line_items (
        tenant_id, estimate_id, name, description, quantity, unit_price_cents, total_cents, position,
        line_item_type, group_key, customer_visible, customer_label, internal_cost_cents, internal_notes
      )
      values ($1,$2,$3,$4,1,$5,$5,900,'service','ai_estimator_bid',true,$3,$6,$7)
      `,
      [
        tenantId,
        takeoff.estimate_id,
        `${tradeLabel} project`,
        takeoff.interpreted_input || "Reviewed scope prepared from measurements and field notes.",
        takeoff.recommended_customer_price_cents,
        takeoff.material_cost_cents + takeoff.labor_cost_cents + takeoff.overhead_cost_cents,
        `Internal takeoff summary:\n${materialSummary}\n\nProfit/markup: ${takeoff.markup_cents} cents. Do not show internal costs to customer unless configured.`
      ]
    );
  }

  await queryPostgres(
    `
    update public.service_estimates
    set subtotal_cents = $1,
        total_cents = $1,
        estimator_status = 'ready_for_bid',
        customer_summary = coalesce(customer_scope_summary, 'Draft bid prepared from reviewed material takeoff. Final approval is required before sending.'),
        updated_at = now()
    where tenant_id = $2 and id = $3
    `,
    [takeoff.recommended_customer_price_cents, tenantId, takeoff.estimate_id]
  );

  await queryPostgres(
    "update public.material_takeoffs set status = 'ready_for_bid', updated_at = now() where tenant_id = $1 and id = $2",
    [tenantId, takeoff.id]
  );

  revalidatePath("/app/estimator");
  revalidatePath("/app/job-tracker");
  revalidatePath(`/app/service/estimates/${takeoff.estimate_id}`);
}

export async function createOrderListFromTakeoffAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = bidSchema.safeParse({ takeoffId: text(formData, "takeoffId") });
  if (!parsed.success) return;

  const tenantId = await getCurrentWorkspaceId();
  const takeoffResult = await queryPostgres<{
    id: string;
    estimate_id: string | null;
    trade_key: string;
    job_address: string | null;
    material_cost_cents: number;
    metadata_json: Record<string, unknown> | null;
    estimate_title: string | null;
  }>(
    `
    select t.id, t.estimate_id, t.trade_key, t.job_address, t.material_cost_cents, t.metadata_json, e.title as estimate_title
    from public.material_takeoffs t
    left join public.service_estimates e on e.id = t.estimate_id and e.tenant_id = t.tenant_id
    where t.tenant_id = $1 and t.id = $2
    limit 1
    `,
    [tenantId, parsed.data.takeoffId]
  );
  const takeoff = takeoffResult?.rows[0];
  if (!takeoff) return;

  const itemsResult = await queryPostgres<{
    id: string;
    label: string;
    rounded_purchase_quantity: string;
    unit: string;
    estimated_unit_price_cents: number;
    estimated_total_cents: number;
    selected_supplier_product_id: string | null;
    assumptions: string[] | null;
    quote_required: boolean;
    non_returnable_custom: boolean;
    pricing_type: string;
    pricing_confidence: string;
  }>(
    `
    select id, label, rounded_purchase_quantity::text, unit, estimated_unit_price_cents, estimated_total_cents,
      selected_supplier_product_id, assumptions, quote_required, non_returnable_custom, pricing_type, pricing_confidence
    from public.material_takeoff_items
    where tenant_id = $1 and takeoff_id = $2 and status <> 'removed'
    order by product_category_key, label
    `,
    [tenantId, takeoff.id]
  );
  const items = itemsResult?.rows ?? [];
  if (items.length === 0) return;

  const poResult = await queryPostgres<{ id: string }>(
    `
    insert into public.purchase_orders (
      tenant_id, estimate_id, status, job_name, job_address, notes, subtotal_cents, total_cents, metadata_json
    )
    values ($1,$2,'draft',$3,$4,$5,$6,$6,$7::jsonb)
    returning id
    `,
    [
      tenantId,
      takeoff.estimate_id,
      takeoff.estimate_title ?? `${takeoff.trade_key.replaceAll("_", " ")} order list`,
      takeoff.job_address,
      "Draft order list from AI Estimator. Supplier, SKU, current price, substitutions, pickup/delivery, and required date must be reviewed before ordering.",
      items.reduce((sum, item) => sum + item.estimated_total_cents, 0),
      JSON.stringify({
        source: "ai_estimator",
        takeoffId: takeoff.id,
        approvalRequiredBeforeOrdering: true,
        supplierSelectionRequired: true
      })
    ]
  );
  const purchaseOrderId = poResult?.rows[0]?.id;
  if (!purchaseOrderId) return;

  for (const item of items) {
    await queryPostgres(
      `
      insert into public.purchase_order_items (
        tenant_id, purchase_order_id, takeoff_item_id, supplier_product_id, product_name,
        quantity, unit, unit_price_cents, extended_price_cents, substitution_rules, notes, metadata_json
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      `,
      [
        tenantId,
        purchaseOrderId,
        item.id,
        item.selected_supplier_product_id,
        item.label,
        Number(item.rounded_purchase_quantity),
        item.unit,
        item.estimated_unit_price_cents,
        item.estimated_total_cents,
        "No substitution without owner approval.",
        [
          "Supplier and current price must be selected or refreshed before ordering.",
          item.quote_required ? "Quote required. Do not order or price from a guess." : null,
          item.non_returnable_custom ? "Non-returnable/custom item. Confirm exact measurements before ordering." : null,
          item.pricing_confidence !== "phone_confirmed" && item.pricing_confidence !== "reserved" ? "Inventory and pricing are not confirmed." : null
        ].filter(Boolean).join(" "),
        JSON.stringify({
          assumptions: item.assumptions ?? [],
          source: "ai_estimator",
          quoteRequired: item.quote_required,
          nonReturnableCustom: item.non_returnable_custom,
          pricingType: item.pricing_type,
          pricingConfidence: item.pricing_confidence,
          packageOptimizationRequired: true,
          landedCostRequired: true
        })
      ]
    );
  }

  await queryPostgres(
    "update public.material_takeoffs set metadata_json = metadata_json || $1::jsonb, updated_at = now() where tenant_id = $2 and id = $3",
    [JSON.stringify({ lastPurchaseOrderId: purchaseOrderId, orderListPreparedAt: new Date().toISOString() }), tenantId, takeoff.id]
  );

  await queryPostgres(
    `
    insert into public.estimator_delivery_reviews (
      tenant_id, takeoff_id, purchase_order_id, delivery_method, landed_cost_cents, notes, metadata_json
    )
    values ($1,$2,$3,'needs_selection',0,$4,$5::jsonb)
    `,
    [
      tenantId,
      takeoff.id,
      purchaseOrderId,
      "Review fuel surcharge, boom delivery, minimum delivery, multiple trips, remote location, jobsite access, and pickup vs delivery before order.",
      JSON.stringify({ source: "ai_estimator", purchaseOrderId })
    ]
  );

  revalidateEstimator();
}

export async function prepareSupplierOrderReadinessAction(formData: FormData) {
  await requirePermission("approval:review_medium");
  const parsed = recordIdSchema.safeParse({ id: text(formData, "id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const orderResult = await queryPostgres<{
    id: string;
    supplier_id: string | null;
    supplier_name: string | null;
    supplier_source_type: string | null;
    unpriced_items: string;
    unconfirmed_items: string;
  }>(
    `
    select
      po.id,
      po.supplier_id,
      s.name as supplier_name,
      s.source_type as supplier_source_type,
      (
        select count(*)::text
        from public.purchase_order_items poi
        where poi.tenant_id = po.tenant_id
          and poi.purchase_order_id = po.id
          and poi.unit_price_cents <= 0
      ) as unpriced_items,
      (
        select count(*)::text
        from public.purchase_order_items poi
        where poi.tenant_id = po.tenant_id
          and poi.purchase_order_id = po.id
          and coalesce(poi.supplier_product_id::text, '') = ''
      ) as unconfirmed_items
    from public.purchase_orders po
    left join public.suppliers s on s.id = po.supplier_id and s.tenant_id = po.tenant_id
    where po.tenant_id = $1 and po.id = $2
    limit 1
    `,
    [tenantId, parsed.data.id]
  );
  const order = orderResult?.rows[0];
  if (!order) return;

  const blockers = [
    !order.supplier_id ? "Choose a supplier before ordering." : null,
    Number(order.unpriced_items) > 0 ? `${order.unpriced_items} item(s) still need current pricing.` : null,
    Number(order.unconfirmed_items) > 0 ? `${order.unconfirmed_items} item(s) still need confirmed supplier products/SKUs.` : null,
    order.supplier_source_type && ["authorized_api", "account_pricing"].includes(order.supplier_source_type)
      ? null
      : "Supplier account/API connection is not ready for live order submission."
  ].filter(Boolean);

  const status = blockers.length ? "blocked" : "ready_for_review";
  await queryPostgres(
    `
    insert into public.estimator_supplier_order_attempts (
      tenant_id, purchase_order_id, supplier_id, status, provider_key, blocked_reason, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      tenantId,
      order.id,
      order.supplier_id,
      status,
      order.supplier_source_type ?? "manual",
      blockers.join(" "),
      JSON.stringify({
        source: "estimator_ui",
        supplierName: order.supplier_name,
        unpricedItems: Number(order.unpriced_items),
        unconfirmedItems: Number(order.unconfirmed_items),
        liveSubmissionEnabled: false
      })
    ]
  );

  await queryPostgres(
    `
    update public.purchase_orders
    set metadata_json = metadata_json || $1::jsonb,
        updated_at = now()
    where tenant_id = $2 and id = $3
    `,
    [
      JSON.stringify({
        liveOrderReadiness: status,
        liveOrderBlockedReason: blockers.join(" "),
        checkedAt: new Date().toISOString()
      }),
      tenantId,
      order.id
    ]
  );

  revalidateEstimator();
}

export async function markQuoteRequestedAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = recordIdSchema.safeParse({ id: text(formData, "id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.estimator_quote_requests
    set status = 'requested',
        metadata_json = metadata_json || $1::jsonb,
        updated_at = now()
    where tenant_id = $2 and id = $3
    `,
    [JSON.stringify({ requestedAt: new Date().toISOString(), source: "estimator_ui" }), tenantId, parsed.data.id]
  );
  revalidateEstimator();
}

export async function markQuoteReceivedAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = recordIdSchema.safeParse({ id: text(formData, "id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.estimator_quote_requests
    set status = 'received',
        quote_expires_at = coalesce(quote_expires_at, now() + interval '14 days'),
        metadata_json = metadata_json || $1::jsonb,
        updated_at = now()
    where tenant_id = $2 and id = $3
    `,
    [JSON.stringify({ receivedAt: new Date().toISOString(), source: "estimator_ui", priceStillRequiresEntry: true }), tenantId, parsed.data.id]
  );
  revalidateEstimator();
}

export async function updateInventoryMatchAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = inventoryDecisionSchema.safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.estimator_inventory_matches
    set match_status = $1,
        confidence = case when $1 = 'reserved' then 'confirmed' when $1 = 'recommended' then 'medium' else confidence end,
        metadata_json = metadata_json || $2::jsonb
    where tenant_id = $3 and id = $4
    `,
    [parsed.data.status, JSON.stringify({ decidedAt: new Date().toISOString(), source: "estimator_ui" }), tenantId, parsed.data.id]
  );
  if (parsed.data.status === "reserved") {
    await queryPostgres(
      `
      insert into public.estimator_inventory_reservations (
        tenant_id, inventory_match_id, inventory_item_id, takeoff_item_id, reserved_quantity, unit, notes, metadata_json
      )
      select tenant_id, id, inventory_item_id, takeoff_item_id, usable_quantity, null,
        'Reserved from estimator inventory match. Confirm exact spec and pull location before job start.',
        jsonb_build_object('source', 'estimator_ui', 'reservedAt', now())
      from public.estimator_inventory_matches
      where tenant_id = $1 and id = $2
      on conflict (tenant_id, inventory_match_id) do update
      set status = 'reserved',
          reserved_quantity = excluded.reserved_quantity,
          metadata_json = estimator_inventory_reservations.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [tenantId, parsed.data.id]
    );
  }
  if (parsed.data.status === "rejected") {
    await queryPostgres(
      `
      update public.estimator_inventory_reservations
      set status = 'released',
          metadata_json = metadata_json || $1::jsonb,
          updated_at = now()
      where tenant_id = $2 and inventory_match_id = $3 and status = 'reserved'
      `,
      [JSON.stringify({ releasedAt: new Date().toISOString(), reason: "match_rejected" }), tenantId, parsed.data.id]
    );
  }
  revalidateEstimator();
}

export async function selectPackageOptionAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = recordIdSchema.safeParse({ id: text(formData, "id") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.estimator_package_options
    set selected = true,
        metadata_json = metadata_json || $1::jsonb
    where tenant_id = $2 and id = $3
    `,
    [JSON.stringify({ selectedAt: new Date().toISOString(), source: "estimator_ui", supplierPricingStillRequired: true }), tenantId, parsed.data.id]
  );
  revalidateEstimator();
}

export async function updateEstimatorApprovalAction(formData: FormData) {
  await requirePermission("approval:review_medium");
  const parsed = approvalDecisionSchema.safeParse({
    id: text(formData, "id"),
    status: text(formData, "status")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.estimator_approval_requirements
    set status = $1,
        metadata_json = metadata_json || $2::jsonb,
        updated_at = now()
    where tenant_id = $3 and id = $4
    `,
    [parsed.data.status, JSON.stringify({ decidedAt: new Date().toISOString(), source: "estimator_ui" }), tenantId, parsed.data.id]
  );
  revalidateEstimator();
}

export async function createChangeOrderAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = changeOrderSchema.safeParse({
    estimateId: text(formData, "estimateId"),
    changeType: text(formData, "changeType") ?? "scope_change",
    title: text(formData, "title"),
    description: text(formData, "description"),
    amountCents: cents(text(formData, "amount"))
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await createEstimateVersionSnapshot(tenantId, parsed.data.estimateId, "before_change_order");
  await queryPostgres(
    `
    insert into public.estimate_change_orders (
      tenant_id, estimate_id, change_type, title, description, amount_cents, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      tenantId,
      parsed.data.estimateId,
      parsed.data.changeType,
      parsed.data.title,
      parsed.data.description ?? null,
      parsed.data.amountCents,
      JSON.stringify({ source: "estimator_ui", approvalRequired: true })
    ]
  );
  revalidateEstimator();
  revalidatePath(`/app/service/estimates/${parsed.data.estimateId}`);
}

export async function createEstimatorReviewRecordAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = validationSchema.safeParse({
    estimateId: text(formData, "estimateId"),
    takeoffId: text(formData, "takeoffId"),
    kind: text(formData, "kind"),
    type: text(formData, "type"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const estimateId = parsed.data.estimateId ?? null;
  const takeoffId = parsed.data.takeoffId ?? null;
  if (parsed.data.kind === "plan") {
    await queryPostgres(
      `
      insert into public.estimator_plan_validations (tenant_id, estimate_id, takeoff_id, validation_type, notes, metadata_json)
      values ($1,$2,$3,$4,$5,$6::jsonb)
      `,
      [tenantId, estimateId, takeoffId, parsed.data.type ?? "scale_check", parsed.data.notes ?? null, JSON.stringify({ source: "estimator_ui" })]
    );
  } else if (parsed.data.kind === "compliance") {
    await queryPostgres(
      `
      insert into public.estimator_compliance_checks (tenant_id, estimate_id, takeoff_id, check_type, status, notes, metadata_json)
      values ($1,$2,$3,$4,'needs_review',$5,$6::jsonb)
      `,
      [tenantId, estimateId, takeoffId, parsed.data.type ?? "local_code", parsed.data.notes ?? null, JSON.stringify({ source: "estimator_ui", verified: false })]
    );
  } else {
    await queryPostgres(
      `
      insert into public.estimator_insurance_scopes (tenant_id, estimate_id, scope_summary, status, metadata_json)
      values ($1,$2,$3,'needs_review',$4::jsonb)
      `,
      [tenantId, estimateId, parsed.data.notes ?? "Insurance scope needs review.", JSON.stringify({ source: "estimator_ui" })]
    );
  }
  revalidateEstimator();
  if (estimateId) revalidatePath(`/app/service/estimates/${estimateId}`);
}

export async function recordManualPriceAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = manualPriceSchema.safeParse({
    takeoffItemId: text(formData, "takeoffItemId"),
    supplierName: text(formData, "supplierName"),
    priceType: text(formData, "priceType") ?? "manual",
    unitPriceCents: cents(text(formData, "unitPrice")),
    packageQuantity: text(formData, "packageQuantity") ?? "1",
    packageUnit: text(formData, "packageUnit"),
    expiresInDays: text(formData, "expiresInDays"),
    confidence: text(formData, "confidence") ?? "unverified",
    source: text(formData, "source"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const itemResult = await queryPostgres<{ rounded_purchase_quantity: string }>(
    `
    select rounded_purchase_quantity::text
    from public.material_takeoff_items
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [tenantId, parsed.data.takeoffItemId]
  );
  const quantity = Number(itemResult?.rows[0]?.rounded_purchase_quantity ?? 0);
  const packageCount = parsed.data.packageQuantity > 0 ? Math.ceil(quantity / parsed.data.packageQuantity) : quantity;
  const estimatedTotal = Math.round(packageCount * parsed.data.unitPriceCents);

  await queryPostgres(
    `
    insert into public.estimator_manual_price_entries (
      tenant_id, takeoff_item_id, supplier_name, price_type, unit_price_cents, package_quantity,
      package_unit, expires_at, confidence, source, notes, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    `,
    [
      tenantId,
      parsed.data.takeoffItemId,
      parsed.data.supplierName ?? null,
      parsed.data.priceType,
      parsed.data.unitPriceCents,
      parsed.data.packageQuantity,
      parsed.data.packageUnit ?? null,
      expiresAt,
      parsed.data.confidence,
      parsed.data.source ?? null,
      parsed.data.notes ?? null,
      JSON.stringify({ source: "estimator_ui", packageCount })
    ]
  );

  await queryPostgres(
    `
    update public.material_takeoff_items
    set estimated_unit_price_cents = $3,
        estimated_total_cents = $4,
        pricing_type = $5,
        pricing_confidence = $6,
        price_expires_at = $7,
        price_lock_status = case when $7::timestamptz is null then 'not_locked' else 'locked' end,
        price_refresh_required = false,
        status = case when status = 'needs_product' then 'needs_review' else status end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.takeoffItemId, parsed.data.unitPriceCents, estimatedTotal, parsed.data.priceType, parsed.data.confidence, expiresAt]
  );
  revalidateEstimator();
}

export async function createSubstitutionReviewAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = substitutionSchema.safeParse({
    takeoffItemId: text(formData, "takeoffItemId"),
    substituteName: text(formData, "substituteName"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  const itemResult = await queryPostgres<{ product_specification_json: Record<string, unknown> }>(
    "select product_specification_json from public.material_takeoff_items where tenant_id = $1 and id = $2 limit 1",
    [tenantId, parsed.data.takeoffItemId]
  );
  await queryPostgres(
    `
    insert into public.estimator_substitution_reviews (
      tenant_id, takeoff_item_id, original_spec_json, substitute_spec_json, status, notes, metadata_json
    )
    values ($1,$2,$3::jsonb,$4::jsonb,'needs_review',$5,$6::jsonb)
    `,
    [
      tenantId,
      parsed.data.takeoffItemId,
      JSON.stringify(itemResult?.rows[0]?.product_specification_json ?? {}),
      JSON.stringify({ name: parsed.data.substituteName, enteredBy: "estimator_ui" }),
      parsed.data.notes ?? "Review appearance, performance, warranty, compatibility, customer spec, and insurance rules before approving.",
      JSON.stringify({ source: "estimator_ui" })
    ]
  );
  revalidateEstimator();
}

export async function importSupplierPriceListAction(formData: FormData) {
  await requirePermission("lead:manage");
  const uploaded = formData.get("csvFile");
  const uploadedText = uploaded instanceof File && uploaded.size > 0 ? await uploaded.text() : "";
  const parsed = priceImportSchema.safeParse({
    supplierName: text(formData, "supplierName"),
    importName: text(formData, "importName"),
    csvText: uploadedText || String(formData.get("csvText") ?? ""),
    fileName: uploaded instanceof File && uploaded.size > 0 ? uploaded.name : undefined
  });
  if (!parsed.success || !parsed.data.csvText?.trim()) return;
  const tenantId = await getCurrentWorkspaceId();
  const rows = parseCsv(parsed.data.csvText);
  const headers = (rows.shift() ?? []).map((header) => header.trim().toLowerCase().replaceAll(" ", "_"));
  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;

  const existingSupplier = await queryPostgres<{ id: string }>(
    "select id from public.suppliers where tenant_id = $1 and lower(name) = lower($2) and status <> 'archived' limit 1",
    [tenantId, parsed.data.supplierName]
  );
  const supplierResult = existingSupplier?.rows[0]?.id
    ? existingSupplier
    : await queryPostgres<{ id: string }>(
        `
        insert into public.suppliers (tenant_id, name, source_type, status, metadata_json)
        values ($1,$2,'uploaded_price_list','active',$3::jsonb)
        returning id
        `,
        [tenantId, parsed.data.supplierName, JSON.stringify({ source: "estimator_price_import" })]
      );
  const supplierId = supplierResult?.rows[0]?.id;
  if (!supplierId) return;

  for (const [index, row] of rows.entries()) {
    const productName = rowValue(headers, row, ["product_name", "name", "item"]);
    const categoryKey = rowValue(headers, row, ["category_key", "category", "product_category_key"]) ?? "other";
    const unitPrice = cents(rowValue(headers, row, ["unit_price", "price", "cost"]));
    if (!productName || unitPrice <= 0) {
      skipped += 1;
      warnings.push(`Skipped row ${index + 2}: product_name and unit_price are required.`);
      continue;
    }

    const categoryResult = await queryPostgres<{ id: string }>(
      `
      insert into public.product_categories (category_key, name, trade_key, metadata_json)
      values ($1,$2,$3,$4::jsonb)
      on conflict (category_key) do update
      set name = excluded.name
      returning id
      `,
      [
        categoryKey,
        categoryKey.replaceAll("_", " "),
        rowValue(headers, row, ["trade_key", "trade"]) ?? "general",
        JSON.stringify({ source: "price_import" })
      ]
    );
    const categoryId = categoryResult?.rows[0]?.id;
    if (!categoryId) {
      skipped += 1;
      warnings.push(`Skipped row ${index + 2}: category could not be created.`);
      continue;
    }

    const productResult = await queryPostgres<{ id: string }>(
      `
      insert into public.supplier_products (
        tenant_id, supplier_id, product_category_id, product_name, sku, brand, model,
        material_type, package_size, coverage_value, coverage_unit, grade, warranty_system,
        product_url, status, specs_json, metadata_json
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15::jsonb,$16::jsonb)
      returning id
      `,
      [
        tenantId,
        supplierId,
        categoryId,
        productName,
        rowValue(headers, row, ["sku", "item_number", "product_id"]) ?? null,
        rowValue(headers, row, ["brand", "manufacturer"]) ?? null,
        rowValue(headers, row, ["model", "model_number"]) ?? null,
        rowValue(headers, row, ["material_type", "type"]) ?? null,
        rowValue(headers, row, ["package_size", "package", "package_unit"]) ?? rowValue(headers, row, ["unit", "uom"]) ?? null,
        num(rowValue(headers, row, ["coverage_value", "coverage", "coverage_per_package"])) ?? null,
        rowValue(headers, row, ["coverage_unit", "coverage_uom"]) ?? null,
        rowValue(headers, row, ["grade"]) ?? null,
        rowValue(headers, row, ["warranty_system", "warranty"]) ?? null,
        rowValue(headers, row, ["url", "product_url"]) ?? null,
        JSON.stringify({
          source: "estimator_price_import",
          unit: rowValue(headers, row, ["unit", "uom"]) ?? "each",
          packageQuantity: num(rowValue(headers, row, ["package_quantity", "package_qty", "qty_per_package"])) ?? 1
        }),
        JSON.stringify({ source: "estimator_price_import", rawRow: row })
      ]
    );
    const productId = productResult?.rows[0]?.id;
    if (!productId) {
      skipped += 1;
      warnings.push(`Skipped row ${index + 2}: product could not be created.`);
      continue;
    }

    await queryPostgres(
      `
      insert into public.supplier_prices (
        tenant_id, supplier_product_id, source_type, unit_price_cents, price_unit,
        price_per_base_unit_cents, availability, quantity_available, pickup_or_delivery,
        confidence, product_url, metadata_json
      )
      values ($1,$2,'uploaded_price_list',$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      `,
      [
        tenantId,
        productId,
        unitPrice,
        rowValue(headers, row, ["unit", "uom", "price_unit"]) ?? "each",
        cents(rowValue(headers, row, ["price_per_base_unit", "base_unit_price"])) || unitPrice,
        ["unknown", "in_stock", "limited", "out_of_stock", "special_order"].includes(rowValue(headers, row, ["availability", "availability_status"]) ?? "")
          ? rowValue(headers, row, ["availability", "availability_status"])
          : "unknown",
        num(rowValue(headers, row, ["quantity_available", "qty_available", "stock"])) ?? null,
        rowValue(headers, row, ["fulfillment", "pickup_or_delivery"]) ?? null,
        ["low", "medium", "high", "verified"].includes(rowValue(headers, row, ["confidence"]) ?? "")
          ? rowValue(headers, row, ["confidence"])
          : "medium",
        rowValue(headers, row, ["url", "product_url"]) ?? null,
        JSON.stringify({
          source: "estimator_price_import",
          importName: parsed.data.importName ?? null,
          fileName: parsed.data.fileName ?? null,
          currency: "usd",
          priceType: rowValue(headers, row, ["price_type", "type"]) ?? null,
          accountPrice: ["contractor", "account_pricing", "negotiated"].includes(rowValue(headers, row, ["price_type", "type"]) ?? ""),
          volumePrice: (rowValue(headers, row, ["price_type", "type"]) ?? "") === "volume",
          rebateAvailable: (rowValue(headers, row, ["rebate", "rebate_available"]) ?? "").toLowerCase() === "true",
          taxExemptAvailable: (rowValue(headers, row, ["tax_exempt", "tax_exempt_available"]) ?? "").toLowerCase() === "true",
          quoteRequired: (rowValue(headers, row, ["quote_required"]) ?? "").toLowerCase() === "true"
        })
      ]
    );
    imported += 1;
  }

  await queryPostgres(
    `
    insert into public.estimator_supplier_price_imports (
      tenant_id, supplier_id, import_name, source_type, row_count, imported_count, skipped_count, status, warnings, metadata_json
    )
    values ($1,$2,$3,'manual_paste',$4,$5,$6,$7,$8,$9::jsonb)
    `,
    [
      tenantId,
      supplierId,
      parsed.data.importName ?? `${parsed.data.supplierName} price import`,
      rows.length,
      imported,
      skipped,
      skipped > 0 ? "partial" : "completed",
      warnings,
      JSON.stringify({ headers, source: "estimator_ui", fileName: parsed.data.fileName ?? null })
    ]
  );
  revalidateEstimator();
}
