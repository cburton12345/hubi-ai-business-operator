import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
const outputDir = process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length);
if (!inputPath || !outputDir) throw new Error("Provide --input and --output-dir.");

const input = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
if (input.version !== "h4r_2025_balanced_shared_expense_v1") throw new Error("Unexpected input version.");
if (input.sourceGuard.expenseRows !== 1762 || input.totals.expenseCents !== 8405279 || input.sourceGuard.propertyCount !== 26) {
  throw new Error("Input controls do not match the certified source totals.");
}
if (input.propertyTotals.some((row) => String(row.propertyName).toLowerCase().includes("elk mound"))) {
  throw new Error("Elk Mound must not appear in the replacement workpaper.");
}
if (input.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)) {
  throw new Error("At least one transaction allocation does not reconcile.");
}

const escaped = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows) => rows.map((row) => row.map(escaped).join(",")).join("\r\n") + "\r\n";
const money = (cents) => Number(cents) / 100;

await fs.mkdir(path.resolve(outputDir), { recursive: true });

const propertyCsvRows = [[
  "Property", "City", "State", "Region", "Provisional payment evidence", "Regional shared expenses", "Portfolio shared expenses", "Total allocated expenses",
], ...input.propertyTotals.map((row) => [
  row.propertyName, row.city, row.state, row.region, money(row.provisionalIncomeCents), money(row.regionalSharedExpenseCents), money(row.portfolioSharedExpenseCents), money(row.totalExpenseCents),
])];
await fs.writeFile(path.join(outputDir, "H4R-2025-property-expense-summary.csv"), csv(propertyCsvRows), "utf8");

const detailCsvRows = [[
  "Transaction ID", "Date", "Description", "Source amount", "Merchant city", "Merchant state", "Allocation basis", "Property", "Property region", "Allocated amount",
], ...input.allocationLines.map((row) => [
  row.transactionId, row.date ?? "", row.description, money(row.sourceAmountCents), row.merchantCity ?? "", row.merchantState ?? "", row.allocationBasis, row.propertyName, row.propertyRegion, money(row.allocatedCents),
])];
await fs.writeFile(path.join(outputDir, "H4R-2025-property-expense-allocation-detail.csv"), csv(detailCsvRows), "utf8");

const controlCsvRows = [["Transaction ID", "Source amount", "Allocated amount", "Difference", "Basis", "Allocation lines"],
  ...input.transactionControls.map((row) => [row.transactionId, money(row.sourceAmountCents), money(row.allocatedCents), money(row.allocatedCents - row.sourceAmountCents), row.basis, row.allocationLines])];
await fs.writeFile(path.join(outputDir, "H4R-2025-transaction-reconciliation.csv"), csv(controlCsvRows), "utf8");

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Property summary");
const controls = workbook.worksheets.add("Transaction control");
const method = workbook.worksheets.add("Method and checks");
for (const sheet of [summary, controls, method]) sheet.showGridLines = false;

const titleFill = "#17324D";
const headerFill = "#315A78";
const lightFill = "#EAF0F5";
const warnFill = "#FFF2CC";
const font = "Arial";

summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["H4R 2025 balanced property expense workpaper"]];
summary.getRange("A2:H2").format = { fill: titleFill, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 26 };
summary.getRange("A4:B8").values = [
  ["Certified source expense rows", input.sourceGuard.expenseRows],
  ["Certified source expenses", money(input.totals.expenseCents)],
  ["Properties included", input.sourceGuard.propertyCount],
  ["Regional shared expenses", money(input.totals.regionalSharedExpenseCents)],
  ["Portfolio shared expenses", money(input.totals.portfolioSharedExpenseCents)],
];
summary.getRange("A4:A8").format = { fill: lightFill, font: { name: font, bold: true } };
summary.getRange("B4:B8").format.font = { name: font, bold: true };
summary.getRange("B5:B5").format.numberFormat = "$#,##0.00";
summary.getRange("B7:B8").format.numberFormat = "$#,##0.00";
summary.getRange("D4:H8").merge();
summary.getRange("D4").values = [["Use this as a bookkeeping allocation workpaper, not proof that a specific purchase belonged to a specific property. Transfers are excluded and must not be counted as income or expense. Provisional payment matches are used only to weight shared expenses; they are not confirmed rent."]];
summary.getRange("D4:H8").format = { fill: warnFill, font: { name: font, size: 10, bold: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };

summary.getRange("A10:H10").values = [["Property", "City", "State", "Region", "Payment evidence*", "Regional share", "Portfolio share", "Total expenses"]];
summary.getRange("A10:H10").format = { fill: headerFill, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 30 };
const summaryRows = input.propertyTotals.map((row) => [row.propertyName, row.city, row.state, row.region, money(row.provisionalIncomeCents), money(row.regionalSharedExpenseCents), money(row.portfolioSharedExpenseCents), money(row.totalExpenseCents)]);
summary.getRangeByIndexes(10, 0, summaryRows.length, 8).values = summaryRows;
summary.getRange(`A11:H${10 + summaryRows.length}`).format.font = { name: font, size: 10 };
summary.getRange(`E11:H${10 + summaryRows.length}`).format.numberFormat = "$#,##0.00";
summary.getRange(`A${11 + summaryRows.length}:H${11 + summaryRows.length}`).values = [["TOTAL", "", "", "", money(input.totals.provisionalIdentifiedIncomeCents), money(input.totals.regionalSharedExpenseCents), money(input.totals.portfolioSharedExpenseCents), money(input.totals.expenseCents)]];
summary.getRange(`A${11 + summaryRows.length}:H${11 + summaryRows.length}`).format = { fill: lightFill, font: { name: font, bold: true }, borders: { preset: "doubleBottom", style: "medium", color: "#17324D" } };
summary.getRange(`E${11 + summaryRows.length}:H${11 + summaryRows.length}`).format.numberFormat = "$#,##0.00";
summary.getRange(`A10:H${11 + summaryRows.length}`).format.verticalAlignment = "center";
summary.getRange("A:A").format.columnWidth = 36;
summary.getRange("B:B").format.columnWidth = 18;
summary.getRange("C:C").format.columnWidth = 9;
summary.getRange("D:D").format.columnWidth = 16;
summary.getRange("E:H").format.columnWidth = 18;
summary.freezePanes.freezeRows(10);
summary.tables.add(`A10:H${10 + summaryRows.length}`, true, "PropertySummaryTable").style = "TableStyleMedium2";

controls.getRange("A2:F2").merge();
controls.getRange("A2").values = [["Transaction reconciliation - every source expense must balance to the cent"]];
controls.getRange("A2:F2").format = { fill: titleFill, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 26 };
controls.getRange("A4:F4").values = [["Transaction ID", "Source amount", "Allocated amount", "Difference", "Basis", "Allocation lines"]];
controls.getRange("A4:F4").format = { fill: headerFill, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true };
const controlRows = input.transactionControls.map((row) => [row.transactionId, money(row.sourceAmountCents), money(row.allocatedCents), money(row.allocatedCents - row.sourceAmountCents), row.basis, row.allocationLines]);
controls.getRangeByIndexes(4, 0, controlRows.length, 6).values = controlRows;
controls.getRange(`B5:D${4 + controlRows.length}`).format.numberFormat = "$#,##0.00";
controls.getRange(`A5:F${4 + controlRows.length}`).format.font = { name: font, size: 10 };
controls.getRange("A:A").format.columnWidth = 38;
controls.getRange("B:D").format.columnWidth = 16;
controls.getRange("E:E").format.columnWidth = 24;
controls.getRange("F:F").format.columnWidth = 14;
controls.freezePanes.freezeRows(4);
controls.tables.add(`A4:F${4 + controlRows.length}`, true, "TransactionControlTable").style = "TableStyleMedium2";

method.getRange("A2:D2").merge();
method.getRange("A2").values = [["Method, limitations, and certified checks"]];
method.getRange("A2:D2").format = { fill: titleFill, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 26 };
method.getRange("A4:B9").values = [
  ["Allocation method", input.methodology.description],
  ["Weight within each pool", input.methodology.withinPoolWeight],
  ["Property roster", "26 owner-known/current properties; Elk Mound excluded."],
  ["Transfers", "Not included in expense totals and not represented as income or expenses."],
  ["Detail files", "The companion CSVs preserve full split-allocation detail and transaction-level reconciliation."],
  ["Tax treatment", "Owner and tax-preparer review is still required for business purpose, deductibility, capitalization, and historical property activity."],
];
method.getRange("A4:A9").format = { fill: lightFill, font: { name: font, bold: true }, verticalAlignment: "top" };
method.getRange("B4:B9").format = { font: { name: font }, wrapText: true, verticalAlignment: "top" };
method.getRange("A11:D11").values = [["Control", "Expected", "Actual", "Status"]];
method.getRange("A11:D11").format = { fill: headerFill, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
method.getRange("A12:D16").values = [
  ["Source expense rows", 1762, input.sourceGuard.expenseRows, input.sourceGuard.expenseRows === 1762 ? "PASS" : "FAIL"],
  ["Source expense total", 84052.79, money(input.totals.expenseCents), input.totals.expenseCents === 8405279 ? "PASS" : "FAIL"],
  ["Property count", 26, input.sourceGuard.propertyCount, input.sourceGuard.propertyCount === 26 ? "PASS" : "FAIL"],
  ["Elk Mound rows", 0, input.propertyTotals.filter((row) => String(row.propertyName).toLowerCase().includes("elk mound")).length, "PASS"],
  ["Unbalanced transactions", 0, input.transactionControls.filter((row) => row.sourceAmountCents !== row.allocatedCents).length, "PASS"],
];
method.getRange("B13:C13").format.numberFormat = "$#,##0.00";
method.getRange("A12:D16").format.font = { name: font, size: 10 };
method.getRange("A:A").format.columnWidth = 26;
method.getRange("B:B").format.columnWidth = 62;
method.getRange("C:C").format.columnWidth = 18;
method.getRange("D:D").format.columnWidth = 12;
method.getRange("A4:B9").format.rowHeight = 82;

workbook.recalculate();
const previewDir = path.join(outputDir, "xlsx-previews");
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["Property summary", "A1:H38"], ["Transaction control", "A1:F30"], ["Method and checks", "A1:D18"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "-").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const inspection = await workbook.inspect({ kind: "workbook,sheet,table,formula", maxChars: 8000, tableMaxRows: 5, tableMaxCols: 8 });
await fs.writeFile(path.join(outputDir, "xlsx-inspection.ndjson"), inspection.ndjson, "utf8");
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "H4R-2025-balanced-property-expense-workpaper.xlsx"));

console.log(JSON.stringify({
  xlsx: path.join(outputDir, "H4R-2025-balanced-property-expense-workpaper.xlsx"),
  propertyRows: summaryRows.length,
  transactionRows: controlRows.length,
  allocationDetailRows: input.allocationLines.length,
}, null, 2));
