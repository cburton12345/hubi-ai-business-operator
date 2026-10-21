import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputVersion = "h4r_2025_worker_expense_workpaper_v15";
const outputVersion = "h4r_2025_schedule_e_preparer_workpaper_v15";

type ExpenseLine = {
  transactionId: string;
  description: string;
  suggestedCategory: string;
  propertyId: string;
  propertyName: string;
  sourceAmountCents: number;
  expenseCents: number;
  [key: string]: unknown;
};

function scheduleECategory(category: string, description: string) {
  if (/^To .+ Cash App payment$/i.test(description) || /^Cash App payment$/i.test(description)) return "19 Other - labor and services";
  const map: Record<string, string> = {
    fuel: "6 Auto and travel",
    vehicle: "6 Auto and travel",
    lodging: "6 Auto and travel",
    travel_needs_review: "6 Auto and travel",
    meals: "19 Other - meals",
    materials: "15 Supplies",
    general_merchandise_needs_receipt: "15 Supplies",
    office: "15 Supplies",
    tools: "15 Supplies",
    labor_and_contracted_services: "19 Other - labor and services",
    utilities: "17 Utilities",
    insurance: "9 Insurance",
    repairs: "14 Repairs",
    government_or_legal_needs_review: "10 Legal/professional or 16 Taxes",
    professional_services_needs_review: "10 Legal and professional fees",
    software_or_advertising_needs_review: "5 Advertising or 19 Other",
    software: "19 Other - software",
    fees: "19 Other - fees",
    equipment_needs_receipt: "18 Depreciation or 19 Other - equipment",
    cooperative_account_needs_review: "19 Other - cooperative account",
    education_or_training_needs_review: "19 Other - education/training",
    personal_or_nonbusiness_needs_review: "19 Other - preparer decision",
    payment_needs_classification: "19 Other - labor and services",
    uncategorized: "19 Other - uncategorized",
  };
  return map[category] ?? "19 Other - uncategorized";
}

async function main() {
  const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
  const outputPath = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  if (!inputPath || !outputPath) throw new Error("Provide --input and --output.");
  const report = JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as {
    version: string;
    totals: Record<string, number>;
    propertyTotals: Array<Record<string, unknown>>;
    expenseLines: ExpenseLine[];
    transactionControls: Array<{ sourceAmountCents: number; distributedCents: number }>;
    [key: string]: unknown;
  };
  if (report.version !== inputVersion || report.totals.estimatedCashAppIncomeCents !== 7168400
    || report.totals.totalOutflowCents !== 8405279 || report.transactionControls.length !== 1762
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.distributedCents)) {
    throw new Error("v15 source guard failed.");
  }
  const expenseLines = report.expenseLines.map((line) => ({ ...line, scheduleECategory: scheduleECategory(line.suggestedCategory, line.description) }));
  const scheduleECategories = [...new Set(expenseLines.map((line) => line.scheduleECategory))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const propertyTotals = report.propertyTotals.map((property) => {
    const propertyId = String(property.propertyId);
    const lines = expenseLines.filter((line) => line.propertyId === propertyId);
    const scheduleEExpenses = Object.fromEntries(scheduleECategories.map((category) => [category, lines.filter((line) => line.scheduleECategory === category).reduce((sum, line) => sum + line.expenseCents, 0)]));
    const totalExpenseCents = Object.values(scheduleEExpenses).reduce((sum, cents) => sum + cents, 0);
    const incomeCents = Number(property.estimatedCashAppIncomeCents);
    if (totalExpenseCents !== Number(property.totalOutflowCents)) throw new Error(`Property total mismatch for ${String(property.propertyName)}.`);
    return {
      propertyId,
      propertyName: String(property.propertyName),
      city: String(property.city),
      state: String(property.state),
      role: String(property.role),
      incomeCents,
      totalExpenseCents,
      netIncomeLossCents: incomeCents - totalExpenseCents,
      scheduleEExpenses,
    };
  });
  const totalIncomeCents = propertyTotals.reduce((sum, row) => sum + row.incomeCents, 0);
  const totalExpenseCents = propertyTotals.reduce((sum, row) => sum + row.totalExpenseCents, 0);
  const totalNetIncomeLossCents = totalIncomeCents - totalExpenseCents;
  if (totalIncomeCents !== 7168400 || totalExpenseCents !== 8405279 || totalNetIncomeLossCents !== -1236879) throw new Error("Schedule E summary control failed.");
  const workerSourceTransactions = new Set(expenseLines.filter((line) => line.scheduleECategory === "19 Other - labor and services").map((line) => line.transactionId));
  const workerPaymentCents = [...workerSourceTransactions].reduce((sum, transactionId) => {
    const line = expenseLines.find((item) => item.transactionId === transactionId);
    return sum + Number(line?.sourceAmountCents ?? 0);
  }, 0);
  if (workerSourceTransactions.size !== 35 || workerPaymentCents !== 780513) throw new Error("Worker payment control failed.");
  const output = {
    ...report,
    version: outputVersion,
    generatedAt: new Date().toISOString(),
    totals: {
      ...report.totals,
      totalIncomeCents,
      totalExpenseCents,
      totalNetIncomeLossCents,
      workerPaymentCents,
    },
    scheduleECategories,
    propertyTotals,
    expenseLines,
    taxPreparerPresentation: {
      primaryColumns: ["Property", "Rents received", "Total expenses", "Net income or (loss)"],
      note: "Prepared in the format of 2025 Schedule E Part I lines 3, 5-21. The tax preparer should apply return-level limitations, depreciation, 1099, ownership, and final deductibility decisions.",
    },
  };
  await writeFile(path.resolve(outputPath), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ version: outputVersion, properties: propertyTotals.length, scheduleECategories, workerTransactions: workerSourceTransactions.size, workerPaymentCents, totals: output.totals }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
