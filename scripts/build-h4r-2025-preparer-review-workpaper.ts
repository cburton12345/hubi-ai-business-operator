import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const expected = { expenseRows: 1762, expenseCents: 8405279, incomeCents: 7168400, deposits: 143 };
const version = "h4r_2025_preparer_review_workpaper_v15_source";

type Location = { city?: string | null; state?: string | null };
type SourceRow = { transactionId: string; date: string | null; description: string; amountCents: number; merchantLocation: Location | null };
type SourceFile = { version: string; sourceGuard: { expenses: number; expenseCents: number }; assignments: SourceRow[] };
type V11File = {
  version: string;
  totals: { allocatedIncomeCents: number; unclassifiedIncomingCents: number; separateBankTransferCents: number };
  propertyTotals: Array<{ propertyId: string; propertyName: string; city: string; state: string; role: string; allocatedIncomeCents: number }>;
};
type ReviewExpense = { id: string; review_bucket: string; suggested_category: string; amount_cents: number; description: string };
type ReviewDeposit = { id: string; review_bucket: string; amount_cents: number; description: string; transaction_date: string | null };
type PayerSummary = { payer: string; source_type: string; count: number; amount_cents: number; months: string[]; recurring_pattern: boolean; tenant_match: string | null };
type ReviewFile = { expenses: ReviewExpense[]; deposits: ReviewDeposit[]; payerSummaries: PayerSummary[] };
type Region = "wi_west" | "wi_central" | "wi_north" | "mn_blue_earth" | "st_louis" | "tx";
type Property = { id: string; name: string; city: string; state: string; role: string; incomeCents: number; region: Region | null };

function normalize(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function propertyRegion(name: string): Region | null {
  const value = normalize(name);
  if (value.includes("spring valley") || value.includes("ridgeland") || value.includes("408 cedar")) return "wi_west";
  if (value.includes("plover") || value.includes("stevens point")) return "wi_central";
  if (value.includes("spooner")) return "wi_north";
  if (value.includes("blue earth")) return "mn_blue_earth";
  if (["raymond", "winkler", "garden lane", "glen garry", "dodier"].some((token) => value.includes(token))) return "st_louis";
  if (value.includes("herndon")) return "tx";
  return null;
}

function locationRoute(location: Location | null) {
  const city = normalize(location?.city);
  const state = String(location?.state ?? "").toUpperCase();
  if (state === "IL" && city.includes("martinsville")) return { kind: "expense_only" as const, key: "martinsville" };
  if (state === "MN" && ["saint paul", "st paul", "edina", "hastings"].some((value) => city.includes(value))) return { kind: "expense_only" as const, key: "st_paul" };
  if (state === "TX") return { kind: "region" as const, region: "tx" as Region };
  if (state === "MO" || state === "IL") return { kind: "region" as const, region: "st_louis" as Region };
  if (state === "MN" && ["blue earth", "mankato", "fairmont", "new ulm"].some((value) => city.includes(value))) return { kind: "region" as const, region: "mn_blue_earth" as Region };
  if (state !== "WI") return { kind: "portfolio" as const };
  if (["plover", "stevens point", "wisconsin rapids", "nekoosa", "wausau", "marathon", "wisconsin dells", "portage", "madison"].some((value) => city.includes(value))) return { kind: "region" as const, region: "wi_central" as Region };
  if (["spooner", "brule", "superior", "ashland", "hayward"].some((value) => city.includes(value))) return { kind: "region" as const, region: "wi_north" as Region };
  if (["menomonie", "elk mound", "hudson", "chippewa falls", "ridgeland", "baldwin", "altoona", "wilson", "colfax", "somerset", "cumberland", "spring valley", "amery", "eau claire", "barron", "bloomer", "lake hallie"].some((value) => city.includes(value))) return { kind: "portfolio" as const };
  return { kind: "portfolio" as const };
}

function allocateCents(totalCents: number, weighted: Array<{ id: string; weight: number }>) {
  const weightTotal = weighted.reduce((sum, row) => sum + row.weight, 0);
  if (weightTotal <= 0) throw new Error("Weights must total more than zero.");
  const rows = weighted.map((row) => {
    const raw = totalCents * row.weight / weightTotal;
    return { id: row.id, cents: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = totalCents - rows.reduce((sum, row) => sum + row.cents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))) {
    if (remaining <= 0) break;
    row.cents += 1;
    remaining -= 1;
  }
  if (remaining !== 0 || rows.reduce((sum, row) => sum + row.cents, 0) !== totalCents) throw new Error("Cent allocation failed.");
  return rows.filter((row) => row.cents > 0);
}

function boundedActivityWeights(properties: Property[]) {
  const incomeTotal = properties.reduce((sum, property) => sum + property.incomeCents, 0);
  const count = properties.length;
  const weights = properties.map((property) => ({
    id: property.id,
    weight: 0.7 / count + 0.3 * (incomeTotal > 0 ? property.incomeCents / incomeTotal : 1 / count),
  }));
  const maxWeight = count === 1 ? 1 : count === 2 ? 0.7 : 0.4;
  if (weights.some((row) => row.weight > maxWeight)) throw new Error(`Expense concentration guard exceeded ${maxWeight}.`);
  return weights;
}

function reviewTreatment(bucket: string) {
  if (bucket === "categorized_candidate") return "candidate_rental_expense";
  if (bucket === "likely_personal_or_nonbusiness_review") return "likely_personal_excluded_pending_override";
  if (bucket === "receipt_and_business_purpose_needed") return "receipt_or_business_purpose_review";
  if (bucket === "classification_needed") return "classification_review";
  return "category_review";
}

function capitalizationFlag(expense: ReviewExpense) {
  const value = normalize(`${expense.suggested_category} ${expense.description}`);
  const improvementWords = /\b(furnace|hvac|roof|roofing|flooring|carpet|water heater|septic|fence|deck|window|door|appliance|remodel|renovation|equipment)\b/;
  const materialMerchant = /\b(menards|home depot|lowes|vevor)\b/;
  return improvementWords.test(value) || (expense.amount_cents >= 250000 && materialMerchant.test(value));
}

function depositPayer(description: string) {
  const match = description.match(/^From\s+(.+?)\s+Cash App payment$/i);
  return match?.[1]?.trim() ?? null;
}

async function main() {
  const sourcePath = process.argv.find((value) => value.startsWith("--source="))?.slice("--source=".length);
  const v11Path = process.argv.find((value) => value.startsWith("--v11="))?.slice("--v11=".length);
  const reviewPath = process.argv.find((value) => value.startsWith("--review="))?.slice("--review=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  if (!sourcePath || !v11Path || !reviewPath || !outputPath) throw new Error("Provide --source, --v11, --review, and --output.");
  const source = JSON.parse(await readFile(path.resolve(sourcePath), "utf8")) as SourceFile;
  const v11 = JSON.parse(await readFile(path.resolve(v11Path), "utf8")) as V11File;
  const review = JSON.parse(await readFile(path.resolve(reviewPath), "utf8")) as ReviewFile;
  if (source.version !== "h4r_2025_nearest_property_v1" || source.assignments.length !== expected.expenseRows
    || source.sourceGuard.expenseCents !== expected.expenseCents) throw new Error("Expense source guard failed.");
  if (v11.version !== "h4r_2025_final_property_workpaper_v11" || v11.totals.allocatedIncomeCents !== expected.incomeCents) throw new Error("v11 source guard failed.");
  const reviewById = new Map(review.expenses.map((row) => [row.id, row]));
  if (reviewById.size !== expected.expenseRows || source.assignments.some((row) => !reviewById.has(row.transactionId))) throw new Error("Review evidence does not cover every expense row.");

  const properties: Property[] = v11.propertyTotals.map((row) => ({
    id: row.propertyId,
    name: row.propertyName,
    city: row.city,
    state: row.state,
    role: row.role,
    incomeCents: row.allocatedIncomeCents,
    region: row.role === "income_and_expense" ? propertyRegion(row.propertyName) : null,
  }));
  const active = properties.filter((property) => property.role === "income_and_expense");
  const byRegion = new Map<Region, Property[]>();
  for (const property of active) {
    if (!property.region) throw new Error(`Active property ${property.name} has no region.`);
    byRegion.set(property.region, [...(byRegion.get(property.region) ?? []), property]);
  }
  const expenseOnlyByKey = new Map([
    ["martinsville", properties.filter((property) => normalize(property.name).includes("west kendall"))],
    ["st_paul", properties.filter((property) => /albemarle|4th st/i.test(property.name))],
  ]);
  const portfolioWeights = boundedActivityWeights(active);
  const regionWeights = new Map([...byRegion.entries()].map(([region, items]) => [region, boundedActivityWeights(items)]));
  const lines: Array<Record<string, unknown>> = [];
  const controls: Array<Record<string, unknown>> = [];
  for (const sourceRow of source.assignments) {
    const reviewRow = reviewById.get(sourceRow.transactionId)!;
    const route = locationRoute(sourceRow.merchantLocation);
    let targets: Array<{ id: string; weight: number }>;
    let basis: string;
    if (route.kind === "expense_only") {
      const matches = expenseOnlyByKey.get(route.key) ?? [];
      if (matches.length === 0) throw new Error(`Missing expense-only target for ${route.key}.`);
      targets = matches.map((property) => ({ id: property.id, weight: 1 }));
      basis = `location_exception:${route.key}`;
    } else if (route.kind === "region") {
      targets = regionWeights.get(route.region) ?? portfolioWeights;
      basis = regionWeights.has(route.region) ? `regional_activity_weighted:${route.region}` : "portfolio_activity_weighted";
    } else {
      targets = portfolioWeights;
      basis = "portfolio_activity_weighted";
    }
    const allocations = allocateCents(sourceRow.amountCents, targets);
    for (const allocation of allocations) {
      const property = properties.find((item) => item.id === allocation.id);
      if (!property) throw new Error(`Unknown property ${allocation.id}.`);
      lines.push({
        transactionId: sourceRow.transactionId,
        date: sourceRow.date,
        description: sourceRow.description,
        sourceAmountCents: sourceRow.amountCents,
        merchantCity: sourceRow.merchantLocation?.city ?? null,
        merchantState: sourceRow.merchantLocation?.state ?? null,
        expenseBasis: basis,
        reviewBucket: reviewRow.review_bucket,
        reviewTreatment: reviewTreatment(reviewRow.review_bucket),
        suggestedCategory: reviewRow.suggested_category,
        capitalizationReview: capitalizationFlag(reviewRow),
        propertyId: property.id,
        propertyName: property.name,
        expenseCents: allocation.cents,
      });
    }
    const distributed = allocations.reduce((sum, row) => sum + row.cents, 0);
    if (distributed !== sourceRow.amountCents) throw new Error(`Transaction ${sourceRow.transactionId} did not reconcile.`);
    controls.push({ transactionId: sourceRow.transactionId, sourceAmountCents: sourceRow.amountCents, distributedCents: distributed, basis, allocationLines: allocations.length });
  }
  const propertyTotals = properties.map((property) => {
    const propertyLines = lines.filter((line) => line.propertyId === property.id);
    const sumTreatment = (treatment: string) => propertyLines.filter((line) => line.reviewTreatment === treatment).reduce((sum, line) => sum + Number(line.expenseCents), 0);
    const candidateExpenseCents = sumTreatment("candidate_rental_expense");
    const likelyPersonalCents = sumTreatment("likely_personal_excluded_pending_override");
    const receiptReviewCents = sumTreatment("receipt_or_business_purpose_review");
    const classificationReviewCents = sumTreatment("classification_review");
    const categoryReviewCents = sumTreatment("category_review");
    const reviewExpenseCents = likelyPersonalCents + receiptReviewCents + classificationReviewCents + categoryReviewCents;
    const totalOutflowCents = candidateExpenseCents + reviewExpenseCents;
    return {
      propertyId: property.id,
      propertyName: property.name,
      city: property.city,
      state: property.state,
      role: property.role,
      estimatedCashAppIncomeCents: property.incomeCents,
      candidateExpenseCents,
      reviewExpenseCents,
      likelyPersonalCents,
      receiptReviewCents,
      classificationReviewCents,
      categoryReviewCents,
      totalOutflowCents,
      candidateIncomeLessExpenseCents: property.incomeCents - candidateExpenseCents,
      capitalizationReviewCents: propertyLines.filter((line) => line.capitalizationReview).reduce((sum, line) => sum + Number(line.expenseCents), 0),
      expenseLineCount: propertyLines.length,
    };
  }).filter((property) => property.estimatedCashAppIncomeCents > 0 || property.totalOutflowCents > 0)
    .sort((a, b) => b.estimatedCashAppIncomeCents - a.estimatedCashAppIncomeCents || b.totalOutflowCents - a.totalOutflowCents || a.propertyName.localeCompare(b.propertyName));
  const unmatchedDeposits = review.deposits.filter((row) => row.review_bucket === "deposit_source_needs_review");
  if (unmatchedDeposits.length !== expected.deposits) throw new Error(`Expected ${expected.deposits} unmatched deposits; received ${unmatchedDeposits.length}.`);
  const payerMap = new Map(review.payerSummaries.map((row) => [normalize(row.payer), row]));
  const depositReview = unmatchedDeposits.map((row) => {
    const payer = depositPayer(row.description);
    const summary = payer ? payerMap.get(normalize(payer)) : null;
    const merchantCredit = /cash app card/i.test(row.description);
    const treatment = merchantCredit ? "merchant_refund_or_other_credit_review"
      : summary?.recurring_pattern ? "recurring_payment_likely_rent_review" : "one_off_or_irregular_payment_review";
    return { id: row.id, date: row.transaction_date, description: row.description, amountCents: row.amount_cents, payer, treatment, recurringPattern: summary?.recurring_pattern ?? false, payerAnnualCents: summary?.amount_cents ?? row.amount_cents, tenantMatch: summary?.tenant_match ?? null };
  });
  const reviewBucketTotals = Object.fromEntries(["candidate_rental_expense", "receipt_or_business_purpose_review", "likely_personal_excluded_pending_override", "classification_review", "category_review"].map((treatment) => {
    const matching = lines.filter((line) => line.reviewTreatment === treatment);
    return [treatment, { cents: matching.reduce((sum, line) => sum + Number(line.expenseCents), 0), sourceTransactions: new Set(matching.map((line) => line.transactionId)).size }];
  }));
  const totalOutflow = propertyTotals.reduce((sum, row) => sum + row.totalOutflowCents, 0);
  const candidateExpenses = propertyTotals.reduce((sum, row) => sum + row.candidateExpenseCents, 0);
  const reviewExpenses = propertyTotals.reduce((sum, row) => sum + row.reviewExpenseCents, 0);
  if (totalOutflow !== expected.expenseCents || candidateExpenses !== 5583862 || reviewExpenses !== 2821417
    || controls.some((row) => row.sourceAmountCents !== row.distributedCents)) throw new Error("Final v12 controls failed.");
  const output = {
    version,
    generatedAt: new Date().toISOString(),
    sourceGuard: { expenseRows: expected.expenseRows, totalOutflowCents: totalOutflow, estimatedIncomeCents: expected.incomeCents, activeIncomeProperties: 13, unmatchedDeposits: unmatchedDeposits.length },
    methodology: {
      income: "Estimated Cash App income retains the v11 75% balanced / 25% eligible payer-evidence method with Winkler limited and a $12,000 property cap.",
      expenses: "Exact St Louis, Texas, central-Wisconsin, northern-Wisconsin, Blue Earth, St Paul, and Martinsville evidence selects the applicable property pool. Western-Wisconsin purchasing hubs such as Menomonie, Chippewa Falls, Eau Claire, and Elk Mound serve multiple distant properties and therefore use the full active portfolio. Within every multi-property pool, 70% is a common operating base and 30% follows estimated Cash App income; no three-or-more-property pool may give one property more than 40%.",
      review: "Only categorized candidates appear as candidate rental expenses. Receipt/business-purpose, likely personal, classification, category, and capitalization items remain separately visible for preparer decisions.",
      limitations: ["This is a bookkeeping and preparer-review schedule, not proof of business purpose, property use, deductibility, or repair-versus-improvement treatment.", "Unmatched deposits are grouped into recurring-payment, irregular-payment, and merchant-credit review rather than silently treated as rent."],
    },
    totals: {
      estimatedCashAppIncomeCents: expected.incomeCents,
      candidateExpenseCents: candidateExpenses,
      reviewExpenseCents: reviewExpenses,
      totalOutflowCents: totalOutflow,
      candidateIncomeLessExpenseCents: expected.incomeCents - candidateExpenses,
      unclassifiedIncomingCents: v11.totals.unclassifiedIncomingCents,
      separateBankTransferCents: v11.totals.separateBankTransferCents,
    },
    reviewBucketTotals,
    propertyTotals,
    expenseLines: lines,
    transactionControls: controls,
    depositReview,
  };
  await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ version, sourceGuard: output.sourceGuard, totals: output.totals, reviewBucketTotals, propertyTotals }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
