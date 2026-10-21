import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const expected = { rows: 1762, cents: 8405279 };
const outputVersion = "h4r_2025_balanced_shared_expense_v1";

type Location = { city?: string | null; state?: string | null };
type SourceAssignment = {
  transactionId: string;
  date: string | null;
  description: string;
  amountCents: number;
  merchantLocation: Location | null;
};
type SourceFile = {
  version: string;
  sourceGuard: { expenses: number; expenseCents: number };
  propertyRoster: Array<{ ref: string; label: string; location: { city: string; state: string }; source: string }>;
  assignments: SourceAssignment[];
};
type IncomeFile = {
  version: string;
  totals: { exactTenantCandidateDepositCents: number };
  propertyTotals: Array<{ propertyId: string; propertyName: string; exactDepositCents: number }>;
};
type Region = "wi_west" | "wi_central" | "wi_north" | "mn_st_paul" | "mn_blue_earth" | "st_louis" | "ks" | "tx";
type Property = {
  id: string;
  name: string;
  city: string;
  state: string;
  region: Region;
  incomeCents: number;
};

const excludedProperties = new Set(["elk mound"]);

function normalize(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function propertyRegion(label: string, city: string, state: string): Region | null {
  const name = normalize(label);
  const normalizedCity = normalize(city);
  const normalizedState = state.toUpperCase();
  if (normalizedState === "KS") return "ks";
  if (normalizedState === "TX") return "tx";
  if (normalizedState === "MO" || normalizedState === "IL") return "st_louis";
  if (normalizedState === "MN") return name.includes("blue earth") || normalizedCity === "blue earth" ? "mn_blue_earth" : "mn_st_paul";
  if (normalizedState !== "WI") return null;
  if (["plover", "stevens point", "wisconsin dells"].some((value) => name.includes(value) || normalizedCity === value)) return "wi_central";
  if (["spooner", "brule"].some((value) => name.includes(value) || normalizedCity === value)) return "wi_north";
  return "wi_west";
}

function expenseRegion(location: Location | null): Region | null {
  const city = normalize(location?.city);
  const state = String(location?.state ?? "").toUpperCase();
  if (state === "KS") return "ks";
  if (state === "TX") return "tx";
  if (state === "MO" || state === "IL") return "st_louis";
  if (state === "MN") {
    return ["blue earth", "mankato", "fairmont", "new ulm"].some((value) => city.includes(value)) ? "mn_blue_earth" : "mn_st_paul";
  }
  if (state !== "WI") return null;
  if (["plover", "stevens point", "wisconsin rapids", "nekoosa", "wausau", "marathon", "wisconsin dells", "portage"].some((value) => city.includes(value))) return "wi_central";
  if (["spooner", "brule", "superior", "ashland", "hayward"].some((value) => city.includes(value))) return "wi_north";
  if (["elk mound", "chippewa", "altoona", "eau claire", "lake hallie", "menomonie", "durand", "colfax", "amery", "boyceville", "ridgeland", "prairie farm", "spring valley", "hudson", "baldwin", "river falls"].some((value) => city.includes(value))) return "wi_west";
  return null;
}

function weights(properties: Property[]) {
  const totalIncome = properties.reduce((sum, property) => sum + property.incomeCents, 0);
  return properties.map((property) => ({
    property,
    weight: totalIncome > 0
      ? (0.5 / properties.length) + (0.5 * property.incomeCents / totalIncome)
      : 1 / properties.length,
  }));
}

function allocateCents(totalCents: number, weighted: Array<{ property: Property; weight: number }>) {
  const raw = weighted.map(({ property, weight }) => ({ property, raw: totalCents * weight }));
  const allocations = raw.map((item) => ({ property: item.property, cents: Math.floor(item.raw), remainder: item.raw - Math.floor(item.raw) }));
  let remaining = totalCents - allocations.reduce((sum, item) => sum + item.cents, 0);
  for (const item of [...allocations].sort((left, right) => right.remainder - left.remainder || left.property.name.localeCompare(right.property.name))) {
    if (remaining <= 0) break;
    item.cents += 1;
    remaining -= 1;
  }
  if (remaining !== 0 || allocations.reduce((sum, item) => sum + item.cents, 0) !== totalCents) {
    throw new Error(`Largest-remainder allocation failed for ${totalCents} cents.`);
  }
  return allocations.filter((item) => item.cents > 0);
}

async function main() {
  const sourcePath = process.argv.find((value) => value.startsWith("--source="))?.slice("--source=".length);
  const incomePath = process.argv.find((value) => value.startsWith("--income="))?.slice("--income=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  if (!sourcePath || !incomePath || !outputPath) throw new Error("Provide --source, --income, and --output paths.");
  const source = JSON.parse(await readFile(path.resolve(sourcePath), "utf8")) as SourceFile;
  const income = JSON.parse(await readFile(path.resolve(incomePath), "utf8")) as IncomeFile;
  if (source.version !== "h4r_2025_nearest_property_v1" || source.sourceGuard.expenses !== expected.rows
    || source.sourceGuard.expenseCents !== expected.cents || source.assignments.length !== expected.rows) {
    throw new Error("Historical source file failed its exact source guard.");
  }
  if (income.version !== "h4r_2025_bank_transfer_property_allocation_v2") throw new Error("Income evidence file version is not recognized.");
  const incomeById = new Map(income.propertyTotals.map((item) => [item.propertyId, Number(item.exactDepositCents)]));
  const incomeByName = new Map(income.propertyTotals.map((item) => [normalize(item.propertyName), Number(item.exactDepositCents)]));
  const properties: Property[] = source.propertyRoster.flatMap((item) => {
    if (excludedProperties.has(normalize(item.label))) return [];
    const region = propertyRegion(item.label, item.location.city, item.location.state);
    if (!region) return [];
    return [{
      id: item.ref,
      name: item.label,
      city: item.location.city,
      state: item.location.state,
      region,
      incomeCents: incomeById.get(item.ref) ?? incomeByName.get(normalize(item.label)) ?? 0,
    }];
  });
  if (properties.length !== 26 || new Set(properties.map((property) => property.id)).size !== properties.length) {
    throw new Error(`Expected 26 unique properties after excluding Elk Mound; received ${properties.length}.`);
  }
  const byRegion = new Map<Region, Property[]>();
  for (const property of properties) byRegion.set(property.region, [...(byRegion.get(property.region) ?? []), property]);
  const portfolioWeights = weights(properties);
  const regionWeights = new Map([...byRegion.entries()].map(([region, items]) => [region, weights(items)]));
  const lines: Array<Record<string, unknown>> = [];
  const transactionControls: Array<Record<string, unknown>> = [];
  for (const row of source.assignments) {
    const amountCents = Number(row.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error(`Invalid amount for ${row.transactionId}.`);
    const region = expenseRegion(row.merchantLocation);
    const basis = region && regionWeights.has(region) ? `regional_shared:${region}` : "portfolio_shared";
    const selectedWeights = region && regionWeights.has(region) ? regionWeights.get(region)! : portfolioWeights;
    const allocations = allocateCents(amountCents, selectedWeights);
    for (const allocation of allocations) {
      lines.push({
        transactionId: row.transactionId,
        date: row.date,
        description: row.description,
        sourceAmountCents: amountCents,
        merchantCity: row.merchantLocation?.city ?? null,
        merchantState: row.merchantLocation?.state ?? null,
        allocationBasis: basis,
        propertyId: allocation.property.id,
        propertyName: allocation.property.name,
        propertyRegion: allocation.property.region,
        provisionalIncomeCents: allocation.property.incomeCents,
        allocatedCents: allocation.cents,
      });
    }
    const allocatedCents = allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
    if (allocatedCents !== amountCents) throw new Error(`Transaction ${row.transactionId} did not reconcile.`);
    transactionControls.push({ transactionId: row.transactionId, sourceAmountCents: amountCents, allocatedCents, basis, allocationLines: allocations.length });
  }
  const totalSource = source.assignments.reduce((sum, row) => sum + Number(row.amountCents), 0);
  const totalAllocated = lines.reduce((sum, line) => sum + Number(line.allocatedCents), 0);
  if (totalSource !== expected.cents || totalAllocated !== expected.cents
    || transactionControls.some((item) => item.sourceAmountCents !== item.allocatedCents)) {
    throw new Error("Portfolio reconciliation failed.");
  }
  const propertyTotals = properties.map((property) => {
    const propertyLines = lines.filter((line) => line.propertyId === property.id);
    return {
      propertyId: property.id,
      propertyName: property.name,
      city: property.city,
      state: property.state,
      region: property.region,
      provisionalIncomeCents: property.incomeCents,
      regionalSharedExpenseCents: propertyLines.filter((line) => String(line.allocationBasis).startsWith("regional_shared:")).reduce((sum, line) => sum + Number(line.allocatedCents), 0),
      portfolioSharedExpenseCents: propertyLines.filter((line) => line.allocationBasis === "portfolio_shared").reduce((sum, line) => sum + Number(line.allocatedCents), 0),
      totalExpenseCents: propertyLines.reduce((sum, line) => sum + Number(line.allocatedCents), 0),
    };
  }).sort((left, right) => right.totalExpenseCents - left.totalExpenseCents || left.propertyName.localeCompare(right.propertyName));
  const output = {
    version: outputVersion,
    generatedAt: new Date().toISOString(),
    sourceGuard: { expenseRows: source.assignments.length, expenseCents: totalSource, propertyCount: properties.length, excludedProperties: ["Elk mound"] },
    methodology: {
      description: "Expenses are treated as shared estimates rather than forced to one property. A merchant location selects a supported region when possible; otherwise the expense is portfolio-shared.",
      withinPoolWeight: "50% equal property share plus 50% provisional exact tenant-name payment share. If a pool has no provisional payment evidence, allocation is equal.",
      limitations: [
        "The method does not prove business purpose, deductibility, or which property incurred a specific purchase.",
        "Current H4R existence is not treated as proof of 2025 rental activity; owner/tax-preparer review remains required.",
        "Provisional tenant-name payments are weighting evidence only and are not represented as confirmed rent.",
      ],
    },
    totals: {
      provisionalIdentifiedIncomeCents: properties.reduce((sum, property) => sum + property.incomeCents, 0),
      expenseCents: totalAllocated,
      regionalSharedExpenseCents: lines.filter((line) => String(line.allocationBasis).startsWith("regional_shared:")).reduce((sum, line) => sum + Number(line.allocatedCents), 0),
      portfolioSharedExpenseCents: lines.filter((line) => line.allocationBasis === "portfolio_shared").reduce((sum, line) => sum + Number(line.allocatedCents), 0),
    },
    propertyTotals,
    allocationLines: lines,
    transactionControls,
  };
  await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ version: output.version, sourceGuard: output.sourceGuard, totals: output.totals, propertyTotals }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
