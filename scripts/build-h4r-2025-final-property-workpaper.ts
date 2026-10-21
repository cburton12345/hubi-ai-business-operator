import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const expected = { expenseRows: 1762, expenseCents: 8405279, incomeCents: 7168400 };
const version = "h4r_2025_final_property_workpaper_v11";

type Location = { city?: string | null; state?: string | null };
type SourceRow = { transactionId: string; date: string | null; description: string; amountCents: number; merchantLocation: Location | null };
type SourceFile = {
  version: string;
  sourceGuard: { expenses: number; expenseCents: number };
  propertyRoster: Array<{ ref: string; label: string; location: { city: string; state: string } }>;
  assignments: SourceRow[];
};
type IncomeFile = {
  version: string;
  totals: { exactTenantCandidateDepositCents: number; unmatchedCashAppPaymentCents: number; bankTransferCents: number };
  propertyTotals: Array<{ propertyId: string; propertyName: string; exactDepositCents: number }>;
};
type Region = "wi_west" | "wi_central" | "wi_north" | "mn_blue_earth" | "st_louis" | "tx";
type Property = { id: string; name: string; city: string; state: string; region: Region; incomeCapacity: number; evidenceCents: number };
type ExpenseOnlyProperty = { id: string; name: string; city: string; state: string; locationKey: "martinsville" | "st_paul" };

const activeNames = new Map<string, { display: string; region: Region; incomeCapacity?: number }>([
  ["w2535 770th springvalley wi", { display: "W2535 770th, Spring Valley WI", region: "wi_west" }],
  ["135 tonnar ridgeland wi", { display: "135 Tonnar, Ridgeland WI", region: "wi_west" }],
  ["6822 old amish road plover wi", { display: "6822 Old Amish Road, Plover WI", region: "wi_central" }],
  ["11646 raymond ave st louis mo", { display: "11646 Raymond Ave, St Louis MO", region: "st_louis" }],
  ["726 w 1st blue earth mn", { display: "726 W 1st, Blue Earth MN", region: "mn_blue_earth" }],
  ["408 cedar colfax lower", { display: "408 Cedar, Colfax WI", region: "wi_west" }],
  ["105 n herndon kirbyville tx", { display: "105 N Herndon, Kirbyville TX", region: "tx" }],
  ["464 west karner stevens point wi", { display: "464 West Karner, Stevens Point WI", region: "wi_central" }],
  ["10132 winkler st louis mo", { display: "10132 Winkler, St Louis MO", region: "st_louis", incomeCapacity: 0.25 }],
  ["1500 garden lane st louis mo", { display: "1500 Garden Lane, St Louis MO", region: "st_louis" }],
  ["241 glen garry st louis mo", { display: "241 Glen Garry, St Louis MO", region: "st_louis" }],
  ["3214 dodier st louis mo", { display: "3214 Dodier, St Louis MO", region: "st_louis" }],
  ["26720 martin ln spooner", { display: "26720 Martin Lane, Spooner WI", region: "wi_north" }],
]);

const expenseOnlyNames = new Map<string, ExpenseOnlyProperty["locationKey"]>([
  ["201 west kendall martinsville il", "martinsville"],
  ["940 albemarle st paul mn", "st_paul"],
  ["1095 4th st e st paul mn", "st_paul"],
]);

function normalize(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function allocateCents(totalCents: number, weighted: Array<{ id: string; weight: number }>) {
  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) throw new Error("Allocation weights must total more than zero.");
  const raw = weighted.map((item) => ({ ...item, raw: totalCents * item.weight / weightTotal }));
  const rows = raw.map((item) => ({ id: item.id, cents: Math.floor(item.raw), remainder: item.raw - Math.floor(item.raw) }));
  let remaining = totalCents - rows.reduce((sum, item) => sum + item.cents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))) {
    if (remaining <= 0) break;
    row.cents += 1;
    remaining -= 1;
  }
  if (remaining !== 0 || rows.reduce((sum, item) => sum + item.cents, 0) !== totalCents) throw new Error("Cent allocation failed.");
  return rows.filter((row) => row.cents > 0);
}

function locationRoute(location: Location | null) {
  const city = normalize(location?.city);
  const state = String(location?.state ?? "").toUpperCase();
  if (state === "IL" && city.includes("martinsville")) return { kind: "expense_only" as const, key: "martinsville" as const };
  if (state === "MN" && ["saint paul", "st paul", "edina", "hastings"].some((value) => city.includes(value))) {
    return { kind: "expense_only" as const, key: "st_paul" as const };
  }
  if (state === "TX") return { kind: "active_region" as const, region: "tx" as const };
  if (state === "MO" || state === "IL") return { kind: "active_region" as const, region: "st_louis" as const };
  if (state === "MN" && ["blue earth", "mankato", "fairmont", "new ulm"].some((value) => city.includes(value))) {
    return { kind: "active_region" as const, region: "mn_blue_earth" as const };
  }
  if (state !== "WI") return { kind: "portfolio" as const };
  if (["plover", "stevens point", "wisconsin rapids", "nekoosa", "wausau", "marathon", "wisconsin dells", "portage", "madison"].some((value) => city.includes(value))) {
    return { kind: "active_region" as const, region: "wi_central" as const };
  }
  if (["spooner", "brule", "superior", "ashland", "hayward"].some((value) => city.includes(value))) {
    return { kind: "active_region" as const, region: "wi_north" as const };
  }
  if (["menomonie", "elk mound", "hudson", "chippewa falls", "ridgeland", "baldwin", "altoona", "wilson", "colfax", "somerset", "cumberland", "spring valley", "amery", "eau claire", "barron", "bloomer", "lake hallie"].some((value) => city.includes(value))) {
    return { kind: "active_region" as const, region: "wi_west" as const };
  }
  return { kind: "portfolio" as const };
}

async function main() {
  const sourcePath = process.argv.find((value) => value.startsWith("--source="))?.slice("--source=".length);
  const incomePath = process.argv.find((value) => value.startsWith("--income="))?.slice("--income=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  if (!sourcePath || !incomePath || !outputPath) throw new Error("Provide --source, --income, and --output.");
  const source = JSON.parse(await readFile(path.resolve(sourcePath), "utf8")) as SourceFile;
  const income = JSON.parse(await readFile(path.resolve(incomePath), "utf8")) as IncomeFile;
  if (source.version !== "h4r_2025_nearest_property_v1" || source.sourceGuard.expenses !== expected.expenseRows
    || source.sourceGuard.expenseCents !== expected.expenseCents || source.assignments.length !== expected.expenseRows) {
    throw new Error("Expense source guard failed.");
  }
  if (income.version !== "h4r_2025_bank_transfer_property_allocation_v2"
    || income.totals.exactTenantCandidateDepositCents !== expected.incomeCents) throw new Error("Income source guard failed.");
  const incomeEvidenceById = new Map(income.propertyTotals.map((row) => [row.propertyId, row.exactDepositCents]));
  const incomeEvidenceByName = new Map(income.propertyTotals.map((row) => [normalize(row.propertyName), row.exactDepositCents]));
  const properties: Property[] = [];
  const expenseOnly: ExpenseOnlyProperty[] = [];
  for (const item of source.propertyRoster) {
    const key = normalize(item.label);
    const active = activeNames.get(key);
    if (active) {
      properties.push({
        id: item.ref,
        name: active.display,
        city: item.location.city,
        state: item.location.state,
        region: active.region,
        incomeCapacity: active.incomeCapacity ?? 1,
        evidenceCents: incomeEvidenceById.get(item.ref) ?? incomeEvidenceByName.get(key) ?? 0,
      });
    }
    const expenseLocationKey = expenseOnlyNames.get(key);
    if (expenseLocationKey) expenseOnly.push({ id: item.ref, name: item.label, city: item.location.city, state: item.location.state, locationKey: expenseLocationKey });
  }
  if (properties.length !== 13 || expenseOnly.length !== 3) throw new Error(`Expected 13 active and 3 expense-only properties; received ${properties.length} and ${expenseOnly.length}.`);
  const propertyById = new Map([...properties, ...expenseOnly].map((item) => [item.id, item]));
  const activeByRegion = new Map<Region, Property[]>();
  for (const property of properties) activeByRegion.set(property.region, [...(activeByRegion.get(property.region) ?? []), property]);
  const expenseOnlyByKey = new Map<ExpenseOnlyProperty["locationKey"], ExpenseOnlyProperty[]>();
  for (const property of expenseOnly) expenseOnlyByKey.set(property.locationKey, [...(expenseOnlyByKey.get(property.locationKey) ?? []), property]);

  const eligibleEvidenceTotal = properties.reduce((sum, property) => sum + property.evidenceCents, 0);
  const balancedIncomePool = Math.floor(expected.incomeCents * 0.75);
  const evidenceIncomePool = expected.incomeCents - balancedIncomePool;
  const balancedIncome = allocateCents(balancedIncomePool, properties.map((property) => ({ id: property.id, weight: property.incomeCapacity })));
  const evidenceIncome = allocateCents(evidenceIncomePool, properties.map((property) => ({ id: property.id, weight: eligibleEvidenceTotal > 0 ? property.evidenceCents : property.incomeCapacity })));
  const incomeByProperty = new Map<string, number>();
  for (const row of [...balancedIncome, ...evidenceIncome]) incomeByProperty.set(row.id, (incomeByProperty.get(row.id) ?? 0) + row.cents);
  if ([...incomeByProperty.values()].reduce((sum, cents) => sum + cents, 0) !== expected.incomeCents) throw new Error("Income allocation failed.");
  if (Math.max(...incomeByProperty.values()) > 1200000) throw new Error("Income allocation exceeded the $12,000 reasonableness guard.");

  const allocationLines: Array<Record<string, unknown>> = [];
  const transactionControls: Array<Record<string, unknown>> = [];
  for (const row of source.assignments) {
    const route = locationRoute(row.merchantLocation);
    let targets: Array<{ id: string; weight: number }>;
    let basis: string;
    if (route.kind === "expense_only") {
      const matches = expenseOnlyByKey.get(route.key) ?? [];
      if (matches.length === 0) throw new Error(`No expense-only property for ${route.key}.`);
      targets = matches.map((property) => ({ id: property.id, weight: 1 }));
      basis = `direct_location_exception:${route.key}`;
    } else if (route.kind === "active_region") {
      const matches = activeByRegion.get(route.region) ?? [];
      if (matches.length === 0) {
        targets = properties.map((property) => ({ id: property.id, weight: 1 }));
        basis = "portfolio_shared";
      } else {
        targets = matches.map((property) => ({ id: property.id, weight: 1 }));
        basis = `regional_shared:${route.region}`;
      }
    } else {
      targets = properties.map((property) => ({ id: property.id, weight: 1 }));
      basis = "portfolio_shared";
    }
    const allocations = allocateCents(row.amountCents, targets);
    for (const allocation of allocations) {
      const property = propertyById.get(allocation.id);
      if (!property) throw new Error(`Unknown property ${allocation.id}.`);
      allocationLines.push({
        transactionId: row.transactionId,
        date: row.date,
        description: row.description,
        sourceAmountCents: row.amountCents,
        merchantCity: row.merchantLocation?.city ?? null,
        merchantState: row.merchantLocation?.state ?? null,
        allocationBasis: basis,
        propertyId: property.id,
        propertyName: property.name,
        allocatedCents: allocation.cents,
      });
    }
    const allocatedCents = allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
    if (allocatedCents !== row.amountCents) throw new Error(`Expense transaction ${row.transactionId} did not reconcile.`);
    transactionControls.push({ transactionId: row.transactionId, sourceAmountCents: row.amountCents, allocatedCents, basis, allocationLines: allocations.length });
  }
  const propertyTotals = [...properties, ...expenseOnly].map((property) => {
    const lines = allocationLines.filter((line) => line.propertyId === property.id);
    const incomeCents = incomeByProperty.get(property.id) ?? 0;
    const expenseCents = lines.reduce((sum, line) => sum + Number(line.allocatedCents), 0);
    return {
      propertyId: property.id,
      propertyName: property.name,
      city: property.city,
      state: property.state,
      role: incomeCents > 0 ? "income_and_expense" : "expense_only_location_exception",
      allocatedIncomeCents: incomeCents,
      allocatedExpenseCents: expenseCents,
      cashDifferenceCents: incomeCents - expenseCents,
      expenseLineCount: lines.length,
    };
  }).filter((property) => property.allocatedIncomeCents > 0 || property.allocatedExpenseCents > 0)
    .sort((a, b) => b.allocatedIncomeCents - a.allocatedIncomeCents || b.allocatedExpenseCents - a.allocatedExpenseCents || a.propertyName.localeCompare(b.propertyName));
  const totalExpenses = propertyTotals.reduce((sum, property) => sum + property.allocatedExpenseCents, 0);
  const totalIncome = propertyTotals.reduce((sum, property) => sum + property.allocatedIncomeCents, 0);
  if (totalExpenses !== expected.expenseCents || totalIncome !== expected.incomeCents
    || transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)) throw new Error("Final reconciliation failed.");
  const output = {
    version,
    generatedAt: new Date().toISOString(),
    sourceGuard: { expenseRows: expected.expenseRows, expenseCents: expected.expenseCents, allocatedIncomeCents: expected.incomeCents, activeIncomeProperties: 13 },
    methodology: {
      income: "75% balanced across the 13 owner-confirmed Cash App income properties using a limited-capacity weight for Winkler; 25% follows eligible provisional payer/property evidence. No property may exceed $12,000.",
      expenses: "Expenses are shared equally within an owner-confirmed active region, or equally across the 13 active properties when location is unavailable. Exact Martinsville and St Paul-area rows remain expense-only location exceptions.",
      exclusions: ["Wisconsin Dells is excluded; nearby Wisconsin Dells-area expenses route to Plover and Stevens Point.", "Non-managed properties, vacant St Louis properties, 921 Cameron, and Sedan receive no shared allocation.", "Transfers remain separate and are not counted as income or expenses."],
      limitations: ["Income and expense allocations are bookkeeping estimates for preparer review, not transaction-specific proof or a final tax determination.", "Unclassified incoming person-to-person payments are not included in the allocated income total."],
    },
    totals: {
      allocatedIncomeCents: totalIncome,
      allocatedExpenseCents: totalExpenses,
      cashDifferenceCents: totalIncome - totalExpenses,
      unclassifiedIncomingCents: income.totals.unmatchedCashAppPaymentCents,
      separateBankTransferCents: income.totals.bankTransferCents,
    },
    propertyTotals,
    allocationLines,
    transactionControls,
  };
  await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ version, totals: output.totals, propertyTotals }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
