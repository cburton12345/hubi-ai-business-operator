import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolPath = process.env.CODEX_ARTIFACT_TOOL_PATH?.trim();
const { SpreadsheetFile, Workbook } = await import(artifactToolPath ? pathToFileURL(artifactToolPath).href : "@oai/artifact-tool");
const inputPath = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length);
const outputDir = process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length);
if (!inputPath || !outputDir) throw new Error("Provide --input and --output-dir.");
const report = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
if (report.version !== "h4r_2025_schedule_e_preparer_workpaper_v15" || report.totals.totalIncomeCents !== 7168400
  || report.totals.totalExpenseCents !== 8405279 || report.totals.totalNetIncomeLossCents !== -1236879
  || report.totals.workerPaymentCents !== 780513 || report.transactionControls.length !== 1762
  || report.transactionControls.some((row) => row.sourceAmountCents !== row.distributedCents)) throw new Error("Schedule E workbook source guard failed.");

const money = (cents) => Number(cents) / 100;
const csvCell = (value) => /[",\r\n]/.test(String(value ?? "")) ? `"${String(value ?? "").replaceAll('"', '""')}"` : String(value ?? "");
const csv = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
await fs.mkdir(path.resolve(outputDir), { recursive: true });

const propertyRows = report.propertyTotals.map((row) => [row.propertyName, money(row.incomeCents), money(row.totalExpenseCents), money(row.netIncomeLossCents)]);
const scheduleRows = report.propertyTotals.map((row) => [row.propertyName, money(row.incomeCents), ...report.scheduleECategories.map((category) => money(row.scheduleEExpenses[category] ?? 0)), money(row.totalExpenseCents), money(row.netIncomeLossCents)]);
const detailRows = report.expenseLines.map((row) => [row.propertyName, row.date ?? "", row.description, money(row.sourceAmountCents), row.merchantCity ?? "", row.merchantState ?? "", row.scheduleECategory, money(row.expenseCents), row.transactionId]);
const uniqueLines = [...new Map(report.expenseLines.map((row) => [row.transactionId, row])).values()];
const workerRows = uniqueLines.filter((row) => row.scheduleECategory === "19 Other - labor and services").map((row) => [row.date ?? "", row.workerPayee ?? (row.description === "Cash App payment" ? "Unidentified worker payment" : ""), row.description, money(row.sourceAmountCents), row.transactionId]);
await fs.writeFile(path.join(outputDir, "H4R-2025-Schedule-E-property-summary.csv"), csv([["Property", "Rents received", "Total expenses", "Net income or (loss)"], ...propertyRows]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-Schedule-E-category-detail.csv"), csv([["Property", "Rents received", ...report.scheduleECategories, "Total expenses", "Net income or (loss)"], ...scheduleRows]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-expense-transaction-detail.csv"), csv([["Property", "Date", "Description", "Source amount", "Merchant city", "State", "Schedule E line", "Property expense", "Transaction ID"], ...detailRows]), "utf8");
await fs.writeFile(path.join(outputDir, "H4R-2025-worker-payments.csv"), csv([["Date", "Payee", "Description", "Amount", "Transaction ID"], ...workerRows]), "utf8");

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Property summary");
const schedule = workbook.worksheets.add("Schedule E detail");
const detail = workbook.worksheets.add("Transaction detail");
const workers = workbook.worksheets.add("Worker payments");
const controls = workbook.worksheets.add("Controls and notes");
for (const sheet of [summary, schedule, detail, workers, controls]) sheet.showGridLines = false;
const navy = "#17324D";
const blue = "#315A78";
const light = "#EAF0F5";
const moneyFormat = "$#,##0.00;[Red]($#,##0.00)";
const header = { fill: blue, font: { name: "Arial", bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };

summary.getRange("A2:D2").merge();
summary.getRange("A2").values = [["H4R 2025 Schedule E preparer worksheet"]];
summary.getRange("A2:D2").format = { fill: navy, font: { name: "Arial", size: 15, bold: true, color: "#FFFFFF" }, rowHeight: 28 };
summary.getRange("A4:D4").values = [["Property", "Rents received", "Total expenses", "Net income or (loss)"]];
summary.getRange("A4:D4").format = { ...header, rowHeight: 30 };
summary.getRangeByIndexes(4, 0, propertyRows.length, 4).values = propertyRows;
summary.getRange(`B5:D${4 + propertyRows.length}`).format.numberFormat = moneyFormat;
const totalRow = 5 + propertyRows.length;
summary.getRange(`A${totalRow}:D${totalRow}`).values = [["TOTAL", money(report.totals.totalIncomeCents), money(report.totals.totalExpenseCents), money(report.totals.totalNetIncomeLossCents)]];
summary.getRange(`A${totalRow}:D${totalRow}`).format = { fill: light, font: { name: "Arial", bold: true }, borders: { preset: "doubleBottom", style: "medium", color: navy } };
summary.getRange(`B${totalRow}:D${totalRow}`).format.numberFormat = moneyFormat;
summary.getRange("A:A").format.columnWidth = 44;
summary.getRange("B:D").format.columnWidth = 22;
summary.freezePanes.freezeRows(4);
summary.tables.add(`A4:D${4 + propertyRows.length}`, true, "ScheduleEPropertySummary").style = "TableStyleMedium2";
summary.getRange(`A${totalRow + 2}:D${totalRow + 4}`).merge();
summary.getRange(`A${totalRow + 2}`).values = [["Losses appear in parentheses. The tax preparer can enter rents on Schedule E line 3, category totals on lines 5-19, total expenses on line 20, and net income or loss on line 21. Return-level limitations, depreciation, property type/days, ownership, and information-return requirements remain preparer decisions."]];
summary.getRange(`A${totalRow + 2}:D${totalRow + 4}`).format = { fill: "#FFF2CC", font: { name: "Arial", bold: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };

const scheduleHeaders = ["Property", "Rents received", ...report.scheduleECategories, "Total expenses", "Net income or (loss)"];
schedule.getRange("A2:U2").merge();
schedule.getRange("A2").values = [["Schedule E lines by property - prepared for direct tax-preparer entry"]];
schedule.getRange("A2:T2").format = { fill: navy, font: { name: "Arial", size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
schedule.getRangeByIndexes(3, 0, 1, scheduleHeaders.length).values = [scheduleHeaders];
schedule.getRangeByIndexes(3, 0, 1, scheduleHeaders.length).format = { ...header, rowHeight: 45 };
schedule.getRangeByIndexes(4, 0, scheduleRows.length, scheduleHeaders.length).values = scheduleRows;
schedule.getRangeByIndexes(4, 1, scheduleRows.length, scheduleHeaders.length - 1).format.numberFormat = moneyFormat;
schedule.getRange("A:A").format.columnWidth = 38;
for (let column = 1; column < scheduleHeaders.length; column += 1) schedule.getRangeByIndexes(0, column, 1, 1).format.columnWidth = 18;
schedule.freezePanes.freezeRows(4);
schedule.freezePanes.freezeColumns(1);
schedule.tables.add(`A4:${String.fromCharCode(64 + scheduleHeaders.length)}${4 + scheduleRows.length}`, true, "ScheduleECategoryTable").style = "TableStyleMedium2";

detail.getRange("A2:I2").merge();
detail.getRange("A2").values = [["Transaction detail - filter by property, date, description, merchant, or Schedule E line"]];
detail.getRange("A2:I2").format = { fill: navy, font: { name: "Arial", size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
detail.getRange("A4:I4").values = [["Property", "Date", "Description", "Source amount", "Merchant city", "State", "Schedule E line", "Property expense", "Transaction ID"]];
detail.getRange("A4:I4").format = { ...header, rowHeight: 38 };
detail.getRangeByIndexes(4, 0, detailRows.length, 9).values = detailRows;
detail.getRange(`D5:D${4 + detailRows.length}`).format.numberFormat = moneyFormat;
detail.getRange(`H5:H${4 + detailRows.length}`).format.numberFormat = moneyFormat;
for (const [column, width] of [["A", 36], ["B", 13], ["C", 44], ["D", 16], ["E", 18], ["F", 9], ["G", 36], ["H", 17], ["I", 38]]) detail.getRange(`${column}:${column}`).format.columnWidth = width;
detail.freezePanes.freezeRows(4);
detail.tables.add(`A4:I${4 + detailRows.length}`, true, "ScheduleETransactionDetail").style = "TableStyleMedium2";

workers.getRange("A2:E2").merge();
workers.getRange("A2").values = [["Worker payments included in Other - labor and services"]];
workers.getRange("A2:E2").format = { fill: navy, font: { name: "Arial", size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
workers.getRange("A4:E4").values = [["Date", "Payee", "Description", "Amount", "Transaction ID"]];
workers.getRange("A4:E4").format = { ...header, rowHeight: 30 };
workers.getRangeByIndexes(4, 0, workerRows.length, 5).values = workerRows;
workers.getRange(`D5:D${4 + workerRows.length}`).format.numberFormat = moneyFormat;
workers.getRange("A:A").format.columnWidth = 13;
workers.getRange("B:B").format.columnWidth = 25;
workers.getRange("C:C").format.columnWidth = 44;
workers.getRange("D:D").format.columnWidth = 16;
workers.getRange("E:E").format.columnWidth = 38;
workers.freezePanes.freezeRows(4);
workers.tables.add(`A4:E${4 + workerRows.length}`, true, "ScheduleEWorkerPayments").style = "TableStyleMedium2";

controls.getRange("A2:D2").merge();
controls.getRange("A2").values = [["Controls and tax-preparer notes"]];
controls.getRange("A2:D2").format = { fill: navy, font: { name: "Arial", size: 14, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
controls.getRange("A4:D4").values = [["Control", "Expected", "Actual", "Status"]];
controls.getRange("A4:D4").format = header;
controls.getRange("A5:D10").values = [
  ["Rents received", 71684, money(report.totals.totalIncomeCents), "PASS"],
  ["Total expenses", 84052.79, money(report.totals.totalExpenseCents), "PASS"],
  ["Net income or (loss)", -12368.79, money(report.totals.totalNetIncomeLossCents), "PASS"],
  ["Worker payments", 7805.13, money(report.totals.workerPaymentCents), "PASS"],
  ["Source expense transactions", 1762, report.transactionControls.length, "PASS"],
  ["Unbalanced transactions", 0, report.transactionControls.filter((row) => row.sourceAmountCents !== row.distributedCents).length, "PASS"],
];
controls.getRange("B5:C8").format.numberFormat = moneyFormat;
controls.getRange("A12:D16").merge();
controls.getRange("A12").values = [[report.taxPreparerPresentation.note + " The 35 worker-payment transactions total $7,805.13 and are included in Other - labor and services. The detailed statement-derived records remain available for substantiation and adjustment."]];
controls.getRange("A12:D16").format = { fill: "#FFF2CC", font: { name: "Arial", bold: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };
controls.getRange("A:A").format.columnWidth = 34;
controls.getRange("B:C").format.columnWidth = 20;
controls.getRange("D:D").format.columnWidth = 12;

workbook.recalculate();
const previewDir = path.join(outputDir, "xlsx-previews");
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["Property summary", "A1:D26"], ["Schedule E detail", "A1:U22"], ["Transaction detail", "A1:I26"], ["Worker payments", "A1:E30"], ["Controls and notes", "A1:D17"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "-").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const formulaErrors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
await fs.writeFile(path.join(outputDir, "xlsx-formula-errors.ndjson"), formulaErrors.ndjson, "utf8");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "H4R-2025-Schedule-E-preparer-workbook.xlsx"));
console.log(JSON.stringify({ xlsx: path.join(outputDir, "H4R-2025-Schedule-E-preparer-workbook.xlsx"), properties: propertyRows.length, scheduleCategories: report.scheduleECategories.length, workerRows: workerRows.length, detailRows: detailRows.length }, null, 2));
