import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
const outputDir = process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length);
if (!inputPath || !outputDir) throw new Error("Provide --input and --output-dir.");
const report = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
if (report.version !== "h4r_2025_final_property_workpaper_v11" || report.sourceGuard.expenseRows !== 1762
  || report.totals.allocatedExpenseCents !== 8405279 || report.totals.allocatedIncomeCents !== 7168400) {
  throw new Error("Final workpaper failed the workbook source guard.");
}
if (Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents)) > 1200000) throw new Error("Income reasonableness guard failed.");
if (report.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)) throw new Error("Transaction reconciliation failed.");

const money = (cents) => Number(cents) / 100;
const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
await fs.mkdir(path.resolve(outputDir), { recursive: true });

const summaryRows = report.propertyTotals.map((row) => [
  row.propertyName, row.city, row.state, row.role, money(row.allocatedIncomeCents), money(row.allocatedExpenseCents), money(row.cashDifferenceCents), row.expenseLineCount,
]);
await fs.writeFile(path.join(outputDir, "H4R-2025-final-property-summary.csv"), csv([
  ["Property", "City", "State", "Role", "Allocated Cash App income", "Allocated expenses", "Income less expenses", "Expense allocation lines"],
  ...summaryRows,
]), "utf8");

const detailRows = report.allocationLines.map((row) => [
  row.propertyName, row.date ?? "", row.description, money(row.sourceAmountCents), row.merchantCity ?? "", row.merchantState ?? "", row.allocationBasis, money(row.allocatedCents), row.transactionId,
]);
await fs.writeFile(path.join(outputDir, "H4R-2025-final-property-expense-detail.csv"), csv([
  ["Property", "Date", "Description", "Source transaction amount", "Merchant city", "Merchant state", "Allocation basis", "Allocated expense", "Transaction ID"],
  ...detailRows,
]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-final-transaction-reconciliation.csv"), csv([
  ["Transaction ID", "Source amount", "Allocated amount", "Difference", "Basis", "Allocation lines"],
  ...report.transactionControls.map((row) => [row.transactionId, money(row.sourceAmountCents), money(row.allocatedCents), money(row.allocatedCents - row.sourceAmountCents), row.basis, row.allocationLines]),
]), "utf8");

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Property summary");
const detail = workbook.worksheets.add("Expense detail");
const controls = workbook.worksheets.add("Transaction control");
const method = workbook.worksheets.add("Method and limits");
for (const sheet of [summary, detail, controls, method]) sheet.showGridLines = false;
const font = "Arial";
const navy = "#17324D";
const blue = "#315A78";
const light = "#EAF0F5";
const amber = "#FFF2CC";

summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["H4R 2025 Cash App property summary"]];
summary.getRange("A2:H2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
summary.getRange("A4:B8").values = [
  ["Allocated Cash App income", money(report.totals.allocatedIncomeCents)],
  ["Allocated expenses", money(report.totals.allocatedExpenseCents)],
  ["Income less expenses*", money(report.totals.cashDifferenceCents)],
  ["Unclassified incoming - separate", money(report.totals.unclassifiedIncomingCents)],
  ["Bank/card transfers - separate", money(report.totals.separateBankTransferCents)],
];
summary.getRange("A4:A8").format = { fill: light, font: { name: font, bold: true } };
summary.getRange("B4:B8").format = { font: { name: font, bold: true }, numberFormat: "$#,##0.00;[Red]($#,##0.00)" };
summary.getRange("D4:H8").merge();
summary.getRange("D4").values = [["* Not tax profit. This page allocates only the identified Cash App income pool and the outgoing non-transfer expense pool. Unclassified incoming payments and bank/card transfers remain separate to prevent unsupported rent claims and double counting."]];
summary.getRange("D4:H8").format = { fill: amber, font: { name: font, size: 10, bold: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };
summary.getRange("A10:H10").values = [["Property", "City", "State", "Treatment", "Allocated income", "Allocated expenses", "Income less expenses*", "Expense lines"]];
summary.getRange("A10:H10").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 30 };
summary.getRangeByIndexes(10, 0, summaryRows.length, 8).values = summaryRows;
summary.getRange(`A11:H${10 + summaryRows.length}`).format = { font: { name: font, size: 10 }, verticalAlignment: "center" };
summary.getRange(`E11:G${10 + summaryRows.length}`).format.numberFormat = "$#,##0.00;[Red]($#,##0.00)";
const totalRow = 11 + summaryRows.length;
summary.getRange(`A${totalRow}:H${totalRow}`).values = [["TOTAL", "", "", "", money(report.totals.allocatedIncomeCents), money(report.totals.allocatedExpenseCents), money(report.totals.cashDifferenceCents), report.allocationLines.length]];
summary.getRange(`A${totalRow}:H${totalRow}`).format = { fill: light, font: { name: font, bold: true }, borders: { preset: "doubleBottom", style: "medium", color: navy } };
summary.getRange(`E${totalRow}:G${totalRow}`).format.numberFormat = "$#,##0.00;[Red]($#,##0.00)";
summary.getRange("A:A").format.columnWidth = 38;
summary.getRange("B:B").format.columnWidth = 18;
summary.getRange("C:C").format.columnWidth = 8;
summary.getRange("D:D").format.columnWidth = 28;
summary.getRange("E:G").format.columnWidth = 18;
summary.getRange("H:H").format.columnWidth = 14;
summary.freezePanes.freezeRows(10);
summary.tables.add(`A10:H${10 + summaryRows.length}`, true, "FinalPropertySummaryTable").style = "TableStyleMedium2";

detail.getRange("A2:I2").merge();
detail.getRange("A2").values = [["Expense allocation detail - filter by property, date, merchant, or basis"]];
detail.getRange("A2:I2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
detail.getRange("A4:I4").values = [["Property", "Date", "Description", "Source amount", "Merchant city", "State", "Allocation basis", "Allocated expense", "Transaction ID"]];
detail.getRange("A4:I4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 30 };
detail.getRangeByIndexes(4, 0, detailRows.length, 9).values = detailRows;
detail.getRange(`A5:I${4 + detailRows.length}`).format.font = { name: font, size: 9 };
detail.getRange(`B5:B${4 + detailRows.length}`).format.numberFormat = "yyyy-mm-dd";
detail.getRange(`D5:D${4 + detailRows.length}`).format.numberFormat = "$#,##0.00";
detail.getRange(`H5:H${4 + detailRows.length}`).format.numberFormat = "$#,##0.00";
detail.getRange("A:A").format.columnWidth = 34;
detail.getRange("B:B").format.columnWidth = 13;
detail.getRange("C:C").format.columnWidth = 42;
detail.getRange("D:D").format.columnWidth = 16;
detail.getRange("E:E").format.columnWidth = 18;
detail.getRange("F:F").format.columnWidth = 9;
detail.getRange("G:G").format.columnWidth = 27;
detail.getRange("H:H").format.columnWidth = 17;
detail.getRange("I:I").format.columnWidth = 38;
detail.freezePanes.freezeRows(4);
detail.tables.add(`A4:I${4 + detailRows.length}`, true, "FinalExpenseDetailTable").style = "TableStyleMedium2";

const controlRows = report.transactionControls.map((row) => [row.transactionId, money(row.sourceAmountCents), money(row.allocatedCents), money(row.allocatedCents - row.sourceAmountCents), row.basis, row.allocationLines]);
controls.getRange("A2:F2").merge();
controls.getRange("A2").values = [["Transaction reconciliation - every source expense balances to the cent"]];
controls.getRange("A2:F2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
controls.getRange("A4:F4").values = [["Transaction ID", "Source amount", "Allocated amount", "Difference", "Basis", "Allocation lines"]];
controls.getRange("A4:F4").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
controls.getRangeByIndexes(4, 0, controlRows.length, 6).values = controlRows;
controls.getRange(`B5:D${4 + controlRows.length}`).format.numberFormat = "$#,##0.00";
controls.getRange(`A5:F${4 + controlRows.length}`).format.font = { name: font, size: 9 };
controls.getRange("A:A").format.columnWidth = 38;
controls.getRange("B:D").format.columnWidth = 16;
controls.getRange("E:E").format.columnWidth = 28;
controls.getRange("F:F").format.columnWidth = 14;
controls.freezePanes.freezeRows(4);
controls.tables.add(`A4:F${4 + controlRows.length}`, true, "FinalTransactionControlTable").style = "TableStyleMedium2";

method.getRange("A2:D2").merge();
method.getRange("A2").values = [["Method, exclusions, and certification"]];
method.getRange("A2:D2").format = { fill: navy, font: { name: font, size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
method.getRange("A4:B10").values = [
  ["Income allocation", report.methodology.income],
  ["Expense allocation", report.methodology.expenses],
  ["Dells", report.methodology.exclusions[0]],
  ["Other exclusions", report.methodology.exclusions[1]],
  ["Transfers", report.methodology.exclusions[2]],
  ["Tax limitation", report.methodology.limitations[0]],
  ["Unclassified incoming", report.methodology.limitations[1]],
];
method.getRange("A4:A10").format = { fill: light, font: { name: font, bold: true }, verticalAlignment: "top" };
method.getRange("B4:B10").format = { font: { name: font }, wrapText: true, verticalAlignment: "top", rowHeight: 70 };
method.getRange("A12:D12").values = [["Control", "Expected", "Actual", "Status"]];
method.getRange("A12:D12").format = { fill: blue, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
method.getRange("A13:D18").values = [
  ["Source expense rows", 1762, report.sourceGuard.expenseRows, report.sourceGuard.expenseRows === 1762 ? "PASS" : "FAIL"],
  ["Allocated income", 71684, money(report.totals.allocatedIncomeCents), report.totals.allocatedIncomeCents === 7168400 ? "PASS" : "FAIL"],
  ["Allocated expenses", 84052.79, money(report.totals.allocatedExpenseCents), report.totals.allocatedExpenseCents === 8405279 ? "PASS" : "FAIL"],
  ["Active income properties", 13, report.sourceGuard.activeIncomeProperties, report.sourceGuard.activeIncomeProperties === 13 ? "PASS" : "FAIL"],
  ["Maximum property income", 12000, money(Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents))), Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents)) <= 1200000 ? "PASS" : "FAIL"],
  ["Unbalanced transactions", 0, report.transactionControls.filter((row) => row.sourceAmountCents !== row.allocatedCents).length, "PASS"],
];
method.getRange("B14:C15").format.numberFormat = "$#,##0.00";
method.getRange("B17:C17").format.numberFormat = "$#,##0.00";
method.getRange("A:A").format.columnWidth = 28;
method.getRange("B:B").format.columnWidth = 68;
method.getRange("C:C").format.columnWidth = 20;
method.getRange("D:D").format.columnWidth = 12;

workbook.recalculate();
const previewDir = path.join(outputDir, "xlsx-previews");
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["Property summary", "A1:H28"], ["Expense detail", "A1:I28"], ["Transaction control", "A1:F28"], ["Method and limits", "A1:D20"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "-").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const inspection = await workbook.inspect({ kind: "workbook,sheet,table,formula", maxChars: 8000, tableMaxRows: 5, tableMaxCols: 9 });
await fs.writeFile(path.join(outputDir, "xlsx-inspection.ndjson"), inspection.ndjson, "utf8");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "H4R-2025-final-property-workpaper.xlsx"));
console.log(JSON.stringify({ xlsx: path.join(outputDir, "H4R-2025-final-property-workpaper.xlsx"), properties: summaryRows.length, expenseDetailRows: detailRows.length, transactionRows: controlRows.length }, null, 2));
