import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recipient = "burtonchristopher125@gmail.com";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!directory) throw new Error("Provide the verified report directory.");
  if ((process.env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") throw new Error("EMAIL_PROVIDER must be resend.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-final-property-workpaper.json"), "utf8")) as {
    version: string;
    sourceGuard: { expenseRows: number; activeIncomeProperties: number };
    totals: { allocatedIncomeCents: number; allocatedExpenseCents: number; unclassifiedIncomingCents: number; separateBankTransferCents: number };
    propertyTotals: Array<{ propertyName: string; allocatedIncomeCents: number }>;
    transactionControls: Array<{ sourceAmountCents: number; allocatedCents: number }>;
  };
  if (report.version !== "h4r_2025_final_property_workpaper_v11" || report.sourceGuard.expenseRows !== 1762
    || report.sourceGuard.activeIncomeProperties !== 13 || report.totals.allocatedIncomeCents !== 7168400
    || report.totals.allocatedExpenseCents !== 8405279
    || Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents)) > 1200000
    || report.propertyTotals.some((row) => /dells|elk mound/i.test(row.propertyName))
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)) {
    throw new Error("Final workpaper failed the exact delivery guard.");
  }
  const fileNames = [
    "H4R-2025-final-one-page-property-summary.pdf",
    "H4R-2025-final-property-workpaper.xlsx",
    "H4R-2025-final-property-summary.csv",
    "H4R-2025-final-property-expense-detail.csv",
    "H4R-2025-final-transaction-reconciliation.csv",
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
      "Idempotency-Key": `h4r-2025-final-property-v11-${digest.digest("hex")}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: required("EMAIL_FROM_ADDRESS"),
      to: [recipient],
      reply_to: process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || required("EMAIL_FROM_ADDRESS"),
      subject: "USE THIS ONE - H4R 2025 one-page property summary and full breakdown",
      text: [
        "Use this packet instead of every earlier property-allocation email.",
        "",
        "Start with the attached one-page PDF. It shows allocated Cash App income, allocated expenses, and the non-tax-profit difference for every included property. The Excel workbook contains the full line-item expense allocation and transaction reconciliation and can be filtered by property.",
        "",
        `Allocated identified Cash App income: ${money(report.totals.allocatedIncomeCents)} across 13 income properties.`,
        `Allocated outgoing non-transfer expenses: ${money(report.totals.allocatedExpenseCents)} across the active properties plus three location-only exceptions.`,
        `Unclassified incoming payments kept separate: ${money(report.totals.unclassifiedIncomingCents)}.`,
        `Bank/card transfers kept separate: ${money(report.totals.separateBankTransferCents)}.`,
        `Highest allocated property income: ${money(Math.max(...report.propertyTotals.map((row) => row.allocatedIncomeCents)))}.`,
        "",
        "Dells and the non-managed/inactive properties receive no shared allocation. Dells-area purchases are divided between Plover and Stevens Point. Western Wisconsin shared expenses are divided evenly among Spring Valley, Ridgeland, and 408 Cedar. Martinsville and St Paul-area expenses remain location-only exceptions with no Cash App income.",
        "",
        "This is a bookkeeping workpaper for owner and tax-preparer review, not a filed return or final tax determination. The original Cash App statements remain the source evidence. The unclassified incoming pool is not represented as confirmed rent, and transfers are not counted as income or expenses.",
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
