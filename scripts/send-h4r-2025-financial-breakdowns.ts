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
  const csvDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const pdfDirectory = process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (!csvDirectory || !pdfDirectory) throw new Error("Provide the verified CSV and PDF directories.");
  if ((process.env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") throw new Error("EMAIL_PROVIDER must be resend.");
  const report = JSON.parse(await readFile(path.join(csvDirectory, "H4R-2025-financial-breakdown.json"), "utf8")) as {
    counts: { expenses: number; deposits: number; transfers: number };
    totals: { expenseCents: number; depositCents: number; transferCents: number };
    review: { exactTenantNameCandidates: number; unmatchedDeposits: number; expensesAssignedToProperty: number; classificationNeeded: number };
  };
  const transferAllocation = JSON.parse(await readFile(path.join(csvDirectory, "H4R-2025-bank-transfer-property-allocation.json"), "utf8")) as {
    version: string;
    totals: { exactTenantCandidateDepositCents: number; unmatchedCashAppPaymentCents: number;
      cashAppPaymentAllocationBasisCents: number; merchantRefundAndOtherCreditCents: number; bankTransferCents: number };
    propertyTotals: unknown[];
  };
  if (transferAllocation.version !== "h4r_2025_bank_transfer_property_allocation_v2"
    || transferAllocation.totals.bankTransferCents !== report.totals.transferCents) {
    throw new Error("Bank-transfer allocation failed the delivery guard.");
  }
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sources = [
    [pdfDirectory, "H4R-2025-printable-property-cash-summary.pdf"],
    [pdfDirectory, "H4R-2025-printable-expense-breakdown.pdf"],
    [pdfDirectory, "H4R-2025-printable-deposit-and-transfer-breakdown.pdf"],
    [pdfDirectory, "H4R-2025-printable-bank-transfer-property-allocation.pdf"],
    [csvDirectory, "H4R-2025-expense-candidates.csv"],
    [csvDirectory, "H4R-2025-property-totals.csv"],
    [csvDirectory, "H4R-2025-bank-transfer-property-allocation.csv"],
    [csvDirectory, "H4R-2025-deposit-candidates.csv"],
    [csvDirectory, "H4R-2025-transfers-separated.csv"],
  ] as const;
  const digest = createHash("sha256");
  const attachments = [];
  for (const [directory, fileName] of sources) {
    const bytes = await readFile(path.join(directory, fileName));
    if (bytes.byteLength < 1) throw new Error(`${fileName} is empty.`);
    digest.update(fileName).update(bytes);
    attachments.push({ filename: fileName, content: bytes.toString("base64") });
  }
  const setDigest = digest.digest("hex");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("EMAIL_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `h4r-2025-financial-breakdowns-${setDigest}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: required("EMAIL_FROM_ADDRESS"),
      to: [recipient],
      reply_to: process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || required("EMAIL_FROM_ADDRESS"),
      subject: "H4R 2025 final tax-preparer workpaper - transfers separated",
      text: [
        "Attached are the reviewed 2025 breakdowns from all twelve preserved Cash App statements, including May.",
        "",
        "Start with H4R-2025-printable-property-cash-summary.pdf. It shows only provisional identified tenant-name payments and assigned expense candidates by property. Bank/card transfers are intentionally excluded from that primary tax page to prevent double counting.",
        "",
        "Included:",
        `- One-page property cash summary across ${transferAllocation.propertyTotals.length.toLocaleString()} expense-bearing properties`,
        `- Printable expense report: ${report.counts.expenses.toLocaleString()} rows totaling ${money(report.totals.expenseCents)}`,
        `- Printable deposit report: ${report.counts.deposits.toLocaleString()} rows totaling ${money(report.totals.depositCents)}`,
        `- ${report.counts.transfers.toLocaleString()} transfers totaling ${money(report.totals.transferCents)}, separated from expense and deposit totals`,
        `- A separate reconciliation-only appendix documents ${money(transferAllocation.totals.bankTransferCents)} of bank/card transfers across ${transferAllocation.propertyTotals.length.toLocaleString()} expense-bearing properties; do not add this amount to income or expenses`,
        `- ${money(transferAllocation.totals.exactTenantCandidateDepositCents)} of provisional exact tenant-name payment candidates is shown on the primary summary`,
        "- Other incoming person-to-person payments remain unclassified in the supporting deposit/reconciliation records and are not presented as rent on the primary summary",
        `- ${money(transferAllocation.totals.merchantRefundAndOtherCreditCents)} of merchant refunds/other credits remains excluded from the transfer-allocation basis`,
        `- ${report.review.exactTenantNameCandidates.toLocaleString()} exact active-tenant name candidates; ${report.review.unmatchedDeposits.toLocaleString()} deposits remain unmatched`,
        `- ${report.review.expensesAssignedToProperty.toLocaleString()} outgoing non-transfer rows assigned exactly once to a property`,
        `- ${report.review.classificationNeeded.toLocaleString()} rows still need transaction classification`,
        "- Matching CSV files for expenses, exclusive property totals, bank-transfer property allocations, deposits, and raw transfers",
        "",
        "Important: this is an accountant/tax-review workpaper, not a filed return or final tax determination. Unclassified incoming payments are excluded from the primary summary and are not represented as confirmed rent or as non-taxable. Exact tenant-name candidates remain provisional. Bank transfers appear only in separate reconciliation support and are not counted as expenses or additional income. No H4R ledger, tenant, payment, or property record was changed.",
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
