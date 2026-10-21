import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recipient = "burtonchristopher125@gmail.com";
const expected = { version: "h4r_2025_balanced_shared_expense_v1", rows: 1762, cents: 8405279, properties: 26 };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!directory) throw new Error("Provide the verified workpaper directory.");
  if ((process.env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") throw new Error("EMAIL_PROVIDER must be resend.");
  const report = JSON.parse(await readFile(path.join(directory, "H4R-2025-balanced-property-expense-allocation.json"), "utf8")) as {
    version: string;
    sourceGuard: { expenseRows: number; expenseCents: number; propertyCount: number; excludedProperties: string[] };
    totals: { expenseCents: number; regionalSharedExpenseCents: number; portfolioSharedExpenseCents: number };
    transactionControls: Array<{ sourceAmountCents: number; allocatedCents: number }>;
    propertyTotals: Array<{ propertyName: string }>;
  };
  if (report.version !== expected.version || report.sourceGuard.expenseRows !== expected.rows
    || report.totals.expenseCents !== expected.cents || report.sourceGuard.propertyCount !== expected.properties
    || report.transactionControls.some((row) => row.sourceAmountCents !== row.allocatedCents)
    || report.propertyTotals.some((row) => row.propertyName.toLowerCase().includes("elk mound"))) {
    throw new Error("Balanced workpaper failed the exact delivery guard.");
  }
  const fileNames = [
    "H4R-2025-balanced-property-expense-summary.pdf",
    "H4R-2025-balanced-property-expense-workpaper.xlsx",
    "H4R-2025-property-expense-summary.csv",
    "H4R-2025-property-expense-allocation-detail.csv",
    "H4R-2025-transaction-reconciliation.csv",
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
      "Idempotency-Key": `h4r-2025-balanced-property-${digest.digest("hex")}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: required("EMAIL_FROM_ADDRESS"),
      to: [recipient],
      reply_to: process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || required("EMAIL_FROM_ADDRESS"),
      subject: "H4R 2025 corrected property expense workpaper - balanced allocation",
      text: [
        "This replaces every earlier property-assigned H4R 2025 packet. Do not use the earlier v4-v9 property schedules.",
        "",
        "Start with the attached three-page PDF. The Excel workbook contains the readable property summary, the transaction-level reconciliation, and the method/limitations. The CSV files preserve the full electronic detail.",
        "",
        `Certified source: ${expected.rows.toLocaleString()} outgoing non-transfer transactions totaling ${money(expected.cents)} across ${expected.properties} properties.`,
        `Regional shared allocation: ${money(report.totals.regionalSharedExpenseCents)}.`,
        `Portfolio shared allocation: ${money(report.totals.portfolioSharedExpenseCents)}.`,
        "Elk Mound is excluded. Every transaction balances to the cent.",
        "",
        "This version does not force a purchase to one nearest house. Merchant-location purchases are shared within a supported region; transactions without usable location evidence are shared across the portfolio. Within each pool, the method is 50% equal and 50% weighted by provisional exact tenant-name payment evidence.",
        "",
        "Transfers are excluded from the expense calculation and must not be counted as income or expense. Payment matches are only a weighting reference and are not represented as confirmed rent.",
        "",
        "Important: this is a bookkeeping allocation workpaper for owner and tax-preparer review, not a filed return or a final Schedule E. The preparer still needs to review business purpose, deductibility, repair-versus-capital treatment, and which properties were active in 2025. Original statements remain the source evidence.",
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
