import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolPath = process.env.CODEX_ARTIFACT_TOOL_PATH?.trim();
const { SpreadsheetFile, Workbook } = await import(
  artifactToolPath ? pathToFileURL(artifactToolPath).href : "@oai/artifact-tool"
);

const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
const outputDir = process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length);
if (!inputPath || !outputDir) throw new Error("Provide --input and --output-dir.");

const report = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
if (report.version !== "h4r_2025_worker_expense_workpaper_v13"
  || report.sourceGuard.expenseRows !== 1762
  || report.sourceGuard.unmatchedDeposits !== 143
  || report.totals.estimatedCashAppIncomeCents !== 7168400
  || report.totals.candidateExpenseCents !== 6322375
  || report.totals.reviewExpenseCents !== 2082904
  || report.totals.confirmedWorkerPaymentCents !== 738513
  || report.totals.totalOutflowCents !== 8405279) {
  throw new Error("Preparer-review workpaper failed the workbook source guard.");
}
if (report.propertyTotals.some((row) => /dells|elk mound/i.test(row.propertyName))) {
  throw new Error("Excluded property appeared in the report.");
}
if (report.transactionControls.some((row) => row.sourceAmountCents !== row.distributedCents)) {
  throw new Error("Transaction reconciliation failed.");
}

const money = (cents) => Number(cents) / 100;
const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const titleCase = (value) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
await fs.mkdir(path.resolve(outputDir), { recursive: true });

const summaryRows = report.propertyTotals.map((row) => [
  row.propertyName,
  row.role === "income_and_expense" ? "Income and expense" : "Location expense only",
  money(row.estimatedCashAppIncomeCents),
  money(row.candidateExpenseCents),
  money(row.reviewExpenseCents),
  money(row.totalOutflowCents),
  money(row.candidateIncomeLessExpenseCents),
  money(row.capitalizationReviewCents),
]);

const detailRows = report.expenseLines.map((row) => [
  row.propertyName,
  row.date ?? "",
  row.description,
  money(row.sourceAmountCents),
  row.merchantCity ?? "",
  row.merchantState ?? "",
  titleCase(row.expenseBasis),
  titleCase(row.reviewTreatment),
  row.suggestedCategory,
  row.capitalizationReview ? "Review repair vs improvement" : "",
  money(row.expenseCents),
  row.transactionId,
]);

const linesByTransaction = new Map();
for (const row of report.expenseLines) {
  const current = linesByTransaction.get(row.transactionId) ?? [];
  current.push(row);
  linesByTransaction.set(row.transactionId, current);
}
const expenseDecisionRows = [];
for (const [transactionId, lines] of linesByTransaction) {
  const first = lines[0];
  if (first.reviewTreatment === "candidate_rental_expense" && !first.capitalizationReview) continue;
  const shares = lines.map((row) => `${row.propertyName}: $${money(row.expenseCents).toFixed(2)}`).join(" | ");
  expenseDecisionRows.push([
    first.date ?? "",
    first.description,
    money(first.sourceAmountCents),
    first.merchantCity ?? "",
    first.merchantState ?? "",
    first.suggestedCategory,
    titleCase(first.reviewTreatment),
    first.capitalizationReview ? "Yes" : "No",
    shares,
    "",
    "",
    "",
    "",
    "",
    transactionId,
  ]);
}
expenseDecisionRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[14]).localeCompare(String(b[14])));

const depositDecisionRows = report.depositReview.map((row) => [
  row.date ?? "",
  row.description,
  money(row.amountCents),
  row.payer ?? "",
  row.recurringPattern ? "Yes" : "No",
  money(row.payerAnnualCents),
  titleCase(row.treatment),
  row.tenantMatch ?? "",
  "",
  "",
  "",
  row.id,
]);

const workerPaymentRows = [...linesByTransaction.values()]
  .map((lines) => lines[0])
  .filter((row) => row.workerPayment === true)
  .map((row) => [row.date ?? "", row.workerPayee ?? "", row.description, money(row.sourceAmountCents), "Labor and contracted services", "Business expense candidate - owner confirmed worker", "Retain payee records for preparer reporting decisions", row.transactionId])
  .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
if (workerPaymentRows.length !== 34 || Math.round(workerPaymentRows.reduce((sum, row) => sum + Number(row[3]), 0) * 100) !== 738513) {
  throw new Error("Worker-payment workbook guard failed.");
}

const controlRows = report.transactionControls.map((row) => [
  row.transactionId,
  money(row.sourceAmountCents),
  money(row.distributedCents),
  money(row.distributedCents - row.sourceAmountCents),
  titleCase(row.basis),
  row.allocationLines,
]);

await fs.writeFile(path.join(outputDir, "H4R-2025-property-summary.csv"), csv([
  ["Property", "Treatment", "Estimated Cash App income", "Candidate rental and labor expenses", "Tax treatment pending", "Total outgoing cash", "Income less candidate expenses", "Possible improvement review"],
  ...summaryRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-expense-detail.csv"), csv([
  ["Property", "Date", "Description", "Source amount", "Merchant city", "Merchant state", "Sharing method", "Review treatment", "Suggested category", "Repair or improvement review", "Property expense amount", "Transaction ID"],
  ...detailRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-expense-decisions.csv"), csv([
  ["Date", "Description", "Source amount", "Merchant city", "Merchant state", "Suggested category", "Current treatment", "Repair or improvement review", "Suggested property shares", "Final business or personal", "Final category", "Repair or improvement", "Receipt or statement support", "Notes", "Transaction ID"],
  ...expenseDecisionRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-deposit-decisions.csv"), csv([
  ["Date", "Description", "Amount", "Payer", "Recurring pattern", "Payer annual total", "Current treatment", "Possible tenant match", "Final income type", "Final property", "Notes", "Transaction ID"],
  ...depositDecisionRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-worker-payments.csv"), csv([
  ["Date", "Payee", "Description", "Amount", "Category", "Treatment", "Preparer note", "Transaction ID"],
  ...workerPaymentRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-transaction-reconciliation.csv"), csv([
  ["Transaction ID", "Source amount", "Property detail total", "Difference", "Sharing method", "Property lines"],
  ...controlRows,
]), "utf8");

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Property summary");
const detail = workbook.worksheets.add("Expense detail");
const expenseReview = workbook.worksheets.add("Expense review");
const depositReview = workbook.worksheets.add("Deposit review");
const workerPayments = workbook.worksheets.add("Worker payments");
const controls = workbook.worksheets.add("Transaction control");
const method = workbook.worksheets.add("Method and limits");
for (const sheet of [summary, detail, expenseReview, depositReview, workerPayments, controls, method]) sheet.showGridLines = false;

const font = "Arial";
const navy = "#17324D";
const blue = "#315A78";
const light = "#EAF0F5";
const amber = "#FFF2CC";
const rose = "#FCE8E6";
const green = "#E2F0D9";
const moneyFormat = "$#,##0.00;[Red]($#,##0.00)";

summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["H4R 2025 Cash App property summary - preparer review"]];
summary.getRange("A2:H2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
summary.getRange("A4:B10").values = [
  ["Estimated Cash App income", money(report.totals.estimatedCashAppIncomeCents)],
  ["Candidate rental and labor expenses", money(report.totals.candidateExpenseCents)],
  ["Tax treatment pending", money(report.totals.reviewExpenseCents)],
  ["Total outgoing cash", money(report.totals.totalOutflowCents)],
  ["Income less candidate expenses*", money(report.totals.candidateIncomeLessExpenseCents)],
  ["Unmatched incoming - separate", money(report.totals.unclassifiedIncomingCents)],
  ["Bank/card transfers - separate", money(report.totals.separateBankTransferCents)],
];
summary.getRange("A4:A10").format = { fill: light, font: { name: font, bold: true } };
summary.getRange("B4:B10").format = { font: { name: font, bold: true }, numberFormat: moneyFormat };
summary.getRange("D4:H10").merge();
summary.getRange("D4").values = [["* Not taxable profit or loss. Named worker payments confirmed by the owner are included as labor/service expense candidates. Items still pending tax treatment are not represented as deductible. Unmatched incoming payments and transfers stay separate to prevent unsupported income claims or double counting."]];
summary.getRange("D4:H10").format = { fill: amber, font: { name: font, size: 10, bold: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };
summary.getRange("A12:H12").values = [["Property", "Treatment", "Estimated income", "Candidate rental and labor expenses", "Tax treatment pending", "Total outgoing", "Income less candidate expenses*", "Possible improvement review"]];
summary.getRange("A12:H12").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 35 };
summary.getRangeByIndexes(12, 0, summaryRows.length, 8).values = summaryRows;
summary.getRange(`A13:H${12 + summaryRows.length}`).format = { font: { name: font, size: 10 }, verticalAlignment: "center" };
summary.getRange(`C13:H${12 + summaryRows.length}`).format.numberFormat = moneyFormat;
const totalRow = 13 + summaryRows.length;
summary.getRange(`A${totalRow}:H${totalRow}`).values = [["TOTAL", "", money(report.totals.estimatedCashAppIncomeCents), money(report.totals.candidateExpenseCents), money(report.totals.reviewExpenseCents), money(report.totals.totalOutflowCents), money(report.totals.candidateIncomeLessExpenseCents), money(report.propertyTotals.reduce((sum, row) => sum + row.capitalizationReviewCents, 0))]];
summary.getRange(`A${totalRow}:H${totalRow}`).format = { fill: light, font: { name: font, bold: true }, borders: { preset: "doubleBottom", style: "medium", color: navy } };
summary.getRange(`C${totalRow}:H${totalRow}`).format.numberFormat = moneyFormat;
summary.getRange("A:A").format.columnWidth = 39;
summary.getRange("B:B").format.columnWidth = 23;
summary.getRange("C:H").format.columnWidth = 18;
summary.freezePanes.freezeRows(12);
summary.tables.add(`A12:H${12 + summaryRows.length}`, true, "PreparerPropertySummaryTable").style = "TableStyleMedium2";

detail.getRange("A2:L2").merge();
detail.getRange("A2").values = [["Expense detail - filter by property, date, merchant, treatment, category, or transaction"]];
detail.getRange("A2:L2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
detail.getRange("A4:L4").values = [["Property", "Date", "Description", "Source amount", "Merchant city", "State", "Sharing method", "Review treatment", "Suggested category", "Repair or improvement review", "Property expense amount", "Transaction ID"]];
detail.getRange("A4:L4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 38 };
detail.getRangeByIndexes(4, 0, detailRows.length, 12).values = detailRows;
detail.getRange(`A5:L${4 + detailRows.length}`).format.font = { name: font, size: 9 };
detail.getRange(`B5:B${4 + detailRows.length}`).format.numberFormat = "yyyy-mm-dd";
detail.getRange(`D5:D${4 + detailRows.length}`).format.numberFormat = moneyFormat;
detail.getRange(`K5:K${4 + detailRows.length}`).format.numberFormat = moneyFormat;
for (const [column, width] of [["A", 34], ["B", 13], ["C", 42], ["D", 16], ["E", 18], ["F", 9], ["G", 28], ["H", 30], ["I", 22], ["J", 24], ["K", 18], ["L", 38]]) detail.getRange(`${column}:${column}`).format.columnWidth = width;
detail.freezePanes.freezeRows(4);
detail.tables.add(`A4:L${4 + detailRows.length}`, true, "PreparerExpenseDetailTable").style = "TableStyleMedium2";

expenseReview.getRange("A2:O2").merge();
expenseReview.getRange("A2").values = [["Expense decisions - complete only where business purpose, category, receipt support, or repair/improvement treatment needs confirmation"]];
expenseReview.getRange("A2:O2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
expenseReview.getRange("A4:O4").values = [["Date", "Description", "Source amount", "Merchant city", "State", "Suggested category", "Current treatment", "Repair or improvement review", "Suggested property shares", "Final business or personal", "Final category", "Repair or improvement", "Receipt or statement support", "Notes", "Transaction ID"]];
expenseReview.getRange("A4:O4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 44 };
expenseReview.getRangeByIndexes(4, 0, expenseDecisionRows.length, 15).values = expenseDecisionRows;
expenseReview.getRange(`A5:O${4 + expenseDecisionRows.length}`).format.font = { name: font, size: 9 };
expenseReview.getRange(`C5:C${4 + expenseDecisionRows.length}`).format.numberFormat = moneyFormat;
expenseReview.getRange(`J5:N${4 + expenseDecisionRows.length}`).format.fill = amber;
for (const [column, width] of [["A", 13], ["B", 42], ["C", 16], ["D", 18], ["E", 9], ["F", 20], ["G", 31], ["H", 22], ["I", 58], ["J", 23], ["K", 20], ["L", 22], ["M", 22], ["N", 28], ["O", 38]]) expenseReview.getRange(`${column}:${column}`).format.columnWidth = width;
expenseReview.freezePanes.freezeRows(4);
expenseReview.tables.add(`A4:O${4 + expenseDecisionRows.length}`, true, "ExpenseDecisionTable").style = "TableStyleMedium2";

depositReview.getRange("A2:L2").merge();
depositReview.getRange("A2").values = [["Unmatched incoming decisions - do not count as rent until source and property are confirmed"]];
depositReview.getRange("A2:L2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
depositReview.getRange("A4:L4").values = [["Date", "Description", "Amount", "Payer", "Recurring pattern", "Payer annual total", "Current treatment", "Possible tenant match", "Final income type", "Final property", "Notes", "Transaction ID"]];
depositReview.getRange("A4:L4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 40 };
depositReview.getRangeByIndexes(4, 0, depositDecisionRows.length, 12).values = depositDecisionRows;
depositReview.getRange(`A5:L${4 + depositDecisionRows.length}`).format.font = { name: font, size: 9 };
depositReview.getRange(`C5:C${4 + depositDecisionRows.length}`).format.numberFormat = moneyFormat;
depositReview.getRange(`F5:F${4 + depositDecisionRows.length}`).format.numberFormat = moneyFormat;
depositReview.getRange(`I5:K${4 + depositDecisionRows.length}`).format.fill = amber;
for (const [column, width] of [["A", 13], ["B", 42], ["C", 16], ["D", 23], ["E", 16], ["F", 17], ["G", 34], ["H", 23], ["I", 21], ["J", 32], ["K", 28], ["L", 38]]) depositReview.getRange(`${column}:${column}`).format.columnWidth = width;
depositReview.freezePanes.freezeRows(4);
depositReview.tables.add(`A4:L${4 + depositDecisionRows.length}`, true, "DepositDecisionTable").style = "TableStyleMedium2";

workerPayments.getRange("A2:H2").merge();
workerPayments.getRange("A2").values = [["Owner-confirmed worker payments - included as labor/service expense candidates"]];
workerPayments.getRange("A2:H2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
workerPayments.getRange("A4:H4").values = [["Date", "Payee", "Description", "Amount", "Category", "Treatment", "Preparer note", "Transaction ID"]];
workerPayments.getRange("A4:H4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 38 };
workerPayments.getRangeByIndexes(4, 0, workerPaymentRows.length, 8).values = workerPaymentRows;
workerPayments.getRange(`A5:H${4 + workerPaymentRows.length}`).format.font = { name: font, size: 9 };
workerPayments.getRange(`D5:D${4 + workerPaymentRows.length}`).format.numberFormat = moneyFormat;
for (const [column, width] of [["A", 13], ["B", 24], ["C", 42], ["D", 16], ["E", 26], ["F", 39], ["G", 46], ["H", 38]]) workerPayments.getRange(`${column}:${column}`).format.columnWidth = width;
workerPayments.freezePanes.freezeRows(4);
workerPayments.tables.add(`A4:H${4 + workerPaymentRows.length}`, true, "WorkerPaymentTable").style = "TableStyleMedium2";

controls.getRange("A2:F2").merge();
controls.getRange("A2").values = [["Transaction reconciliation - every source outflow balances to the cent"]];
controls.getRange("A2:F2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
controls.getRange("A4:F4").values = [["Transaction ID", "Source amount", "Property detail total", "Difference", "Sharing method", "Property lines"]];
controls.getRange("A4:F4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
controls.getRangeByIndexes(4, 0, controlRows.length, 6).values = controlRows;
controls.getRange(`B5:D${4 + controlRows.length}`).format.numberFormat = moneyFormat;
controls.getRange(`A5:F${4 + controlRows.length}`).format.font = { name: font, size: 9 };
controls.getRange("A:A").format.columnWidth = 38;
controls.getRange("B:D").format.columnWidth = 18;
controls.getRange("E:E").format.columnWidth = 30;
controls.getRange("F:F").format.columnWidth = 14;
controls.freezePanes.freezeRows(4);
controls.tables.add(`A4:F${4 + controlRows.length}`, true, "PreparerTransactionControlTable").style = "TableStyleMedium2";

method.getRange("A2:D2").merge();
method.getRange("A2").values = [["Method, review buckets, and limits"]];
method.getRange("A2:D2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
method.getRange("A4:B8").values = [
  ["Income estimate", report.methodology.income],
  ["Expense sharing", report.methodology.expenses],
  ["Tax limitation", report.methodology.limitations[0]],
  ["Incoming limitation", report.methodology.limitations[1]],
  ["Worker payments", report.methodology.workerPayments],
];
method.getRange("A4:A8").format = { fill: light, font: { name: font, bold: true }, verticalAlignment: "top" };
method.getRange("B4:B8").format = { font: { name: font }, wrapText: true, verticalAlignment: "top", rowHeight: 72 };
method.getRange("A10:C10").values = [["Expense treatment", "Source transactions", "Amount"]];
method.getRange("A10:C10").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
const bucketRows = Object.entries(report.reviewBucketTotals).map(([key, value]) => [titleCase(key), value.sourceTransactions, money(value.cents)]);
method.getRangeByIndexes(10, 0, bucketRows.length, 3).values = bucketRows;
method.getRange(`C11:C${10 + bucketRows.length}`).format.numberFormat = moneyFormat;
method.getRange("A17:D17").values = [["Control", "Expected", "Actual", "Status"]];
method.getRange("A17:D17").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
method.getRange("A18:D25").values = [
  ["Source outflow rows", 1762, report.sourceGuard.expenseRows, report.sourceGuard.expenseRows === 1762 ? "PASS" : "FAIL"],
  ["Estimated income", 71684, money(report.totals.estimatedCashAppIncomeCents), report.totals.estimatedCashAppIncomeCents === 7168400 ? "PASS" : "FAIL"],
  ["Candidate expenses", 63223.75, money(report.totals.candidateExpenseCents), report.totals.candidateExpenseCents === 6322375 ? "PASS" : "FAIL"],
  ["Tax treatment pending", 20829.04, money(report.totals.reviewExpenseCents), report.totals.reviewExpenseCents === 2082904 ? "PASS" : "FAIL"],
  ["Total outgoing cash", 84052.79, money(report.totals.totalOutflowCents), report.totals.totalOutflowCents === 8405279 ? "PASS" : "FAIL"],
  ["Owner-confirmed worker payments", 7385.13, money(report.totals.confirmedWorkerPaymentCents), report.totals.confirmedWorkerPaymentCents === 738513 ? "PASS" : "FAIL"],
  ["Unmatched deposits", 143, report.depositReview.length, report.depositReview.length === 143 ? "PASS" : "FAIL"],
  ["Unbalanced transactions", 0, report.transactionControls.filter((row) => row.sourceAmountCents !== row.distributedCents).length, report.transactionControls.every((row) => row.sourceAmountCents === row.distributedCents) ? "PASS" : "FAIL"],
];
method.getRange("B19:C23").format.numberFormat = moneyFormat;
method.getRange("D18:D25").format.fill = green;
method.getRange("A:A").format.columnWidth = 31;
method.getRange("B:B").format.columnWidth = 78;
method.getRange("C:C").format.columnWidth = 20;
method.getRange("D:D").format.columnWidth = 12;
method.getRange("A27:D29").merge();
method.getRange("A27").values = [["The yellow columns are intended for owner or tax-preparer decisions. Owner-confirmed worker payments are already included as labor/service expense candidates. Remaining pending items do not prove business purpose, property use, deductibility, ownership, or repair-versus-improvement treatment."]];
method.getRange("A27:D29").format = { fill: rose, font: { name: font, bold: true, color: "#9C0006" }, wrapText: true, verticalAlignment: "center" };

workbook.recalculate();
const previewDir = path.join(outputDir, "xlsx-previews");
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [
  ["Property summary", "A1:H30"],
  ["Expense detail", "A1:L26"],
  ["Expense review", "A1:O24"],
  ["Deposit review", "A1:L24"],
  ["Worker payments", "A1:H28"],
  ["Transaction control", "A1:F24"],
  ["Method and limits", "A1:D30"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "-").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const inspection = await workbook.inspect({ kind: "workbook,sheet,table,formula", maxChars: 12000, tableMaxRows: 5, tableMaxCols: 15 });
await fs.writeFile(path.join(outputDir, "xlsx-inspection.ndjson"), inspection.ndjson, "utf8");
const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "xlsx-formula-errors.ndjson"), formulaErrors.ndjson, "utf8");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "H4R-2025-preparer-review-workpaper.xlsx"));
console.log(JSON.stringify({
  xlsx: path.join(outputDir, "H4R-2025-preparer-review-workpaper.xlsx"),
  properties: summaryRows.length,
  expenseDetailRows: detailRows.length,
  expenseDecisionRows: expenseDecisionRows.length,
  depositDecisionRows: depositDecisionRows.length,
  workerPaymentRows: workerPaymentRows.length,
  transactionRows: controlRows.length,
}, null, 2));
