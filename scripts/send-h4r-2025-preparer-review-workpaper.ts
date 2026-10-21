import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recipient = "burtonchristopher125@gmail.com";
const version = "h4r_2025_schedule_e_preparer_workpaper_v15";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!directory) throw new Error("Provide the verified report directory.");
  if ((process.env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") throw new Error("EMAIL_PROVIDER must be resend.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-Schedule-E-workpaper.json"), "utf8")) as {
    version: string;
    sourceGuard: { expenseRows: number; activeIncomeProperties: number; unmatchedDeposits: number };
    totals: { totalIncomeCents: number; totalExpenseCents: number; totalNetIncomeLossCents: number; workerPaymentCents: number; unclassifiedIncomingCents: number; separateBankTransferCents: number };
    propertyTotals: Array<{ propertyName: string; incomeCents: number; totalExpenseCents: number; netIncomeLossCents: number }>;
    transactionControls: Array<{ sourceAmountCents: number; distributedCents: number }>;
    depositReview: unknown[];
  };
  const maxPropertyOutflow = Math.max(...report.propertyTotals.map((row) => row.totalExpenseCents));
  if (report.version !== version || report.sourceGuard.expenseRows !== 1762
    || report.sourceGuard.activeIncomeProperties !== 13 || report.sourceGuard.unmatchedDeposits !== 143
    || report.totals.totalIncomeCents !== 7168400 || report.totals.totalExpenseCents !== 8405279
    || report.totals.totalNetIncomeLossCents !== -1236879 || report.totals.workerPaymentCents !== 780513
    || report.depositReview.length !== 143 || maxPropertyOutflow / report.totals.totalExpenseCents > 0.15
    || report.propertyTotals.some((row) => /dells|elk mound/i.test(row.propertyName))
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.distributedCents)) {
    throw new Error("Preparer-review workpaper failed the exact delivery guard.");
  }

  const fileNames = [
    "H4R-2025-Schedule-E-one-page-summary.pdf",
    "H4R-2025-Schedule-E-preparer-workbook.xlsx",
    "H4R-2025-Schedule-E-property-summary.csv",
    "H4R-2025-Schedule-E-category-detail.csv",
    "H4R-2025-worker-payments.csv",
    "H4R-2025-expense-transaction-detail.csv",
  ];
  const digest = createHash("sha256");
  const attachments = [];
  for (const fileName of fileNames) {
    const bytes = await readFile(path.join(directory, fileName));
    if (bytes.byteLength < 1) throw new Error(`${fileName} is empty.`);
    digest.update(fileName).update(bytes);
    attachments.push({ filename: fileName, content: bytes.toString("base64") });
  }
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("EMAIL_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `h4r-2025-schedule-e-v15-${digest.digest("hex")}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: required("EMAIL_FROM_ADDRESS"),
      to: [recipient],
      reply_to: process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || required("EMAIL_FROM_ADDRESS"),
      subject: "USE THIS ONE - H4R 2025 Schedule E preparer worksheet",
      text: [
        "Use this packet instead of every earlier H4R 2025 property-summary email.",
        "",
        "Start with the one-page PDF. It shows rents received, total expenses, and net income or loss for every property. Losses are shown in parentheses. The Excel workbook groups the expenses into the 2025 Schedule E lines for direct preparer entry and includes the full transaction detail.",
        "",
        `Rents received: ${money(report.totals.totalIncomeCents)}.`,
        `Total expenses: ${money(report.totals.totalExpenseCents)}.`,
        `Net income or loss: ${report.totals.totalNetIncomeLossCents < 0 ? `(${money(Math.abs(report.totals.totalNetIncomeLossCents))})` : money(report.totals.totalNetIncomeLossCents)}.`,
        `Worker payments included in Other - labor and services: ${money(report.totals.workerPaymentCents)}.`,
        `Unmatched incoming payments kept separate: ${money(report.totals.unclassifiedIncomingCents)}.`,
        `Bank/card transfers kept separate: ${money(report.totals.separateBankTransferCents)}.`,
        "",
        "Western Wisconsin purchasing hubs such as Menomonie, Chippewa Falls, Eau Claire, and Elk Mound are shared across the full active property set rather than being forced onto only Spring Valley, Ridgeland, and Colfax. Exact geographic evidence for St. Louis, Texas, central Wisconsin, St. Paul, and Martinsville remains scoped to the applicable properties.",
        "",
        "The owner confirmed that the outgoing Cash App payees were workers. Those 35 payments are included in Other - labor and services. The Worker payments sheet preserves payee and transaction detail for preparer reporting records.",
        "",
        "This is a tax-preparer worksheet, not a filed return. The preparer remains responsible for depreciation, property type and days, ownership, information-return requirements, return-level limitations, and final tax treatment. Unmatched incoming payments and bank/card transfers remain separate and are not counted again in the property table.",
      ].join("\n"),
      attachments,
      tags: [
        { name: "source", value: "ferocity" },
        { name: "action", value: "owner_financial_report_delivery" },
      ],
    }),
  });
  const body = await response.json().catch(() => null) as { id?: string; message?: string; error?: string } | null;
  if (!response.ok || !body?.id) throw new Error(`Email delivery request failed with HTTP ${response.status}: ${body?.message ?? body?.error ?? "unknown error"}`);
  console.log(JSON.stringify({ ok: true, provider: "resend", messageId: body.id, recipient, attachmentCount: attachments.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
