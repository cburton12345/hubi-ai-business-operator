import { normalizeExpenseDocument } from "./normalize";
import type { NormalizedExpenseDocument } from "./types";

const monthNumbers: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const shortMonths: Record<string, number> = Object.fromEntries(Object.entries(monthNumbers).map(([name, number]) => [name.slice(0, 3), number]));

function cents(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

function summaryAmount(lines: string[], pattern: RegExp) {
  const line = lines.find((candidate) => pattern.test(candidate));
  const match = line?.match(/([+-]?)\s*(\$[\d,]+\.\d{2})\s*$/);
  return match ? cents(match[2]) : null;
}

export function parseCashAppStatementPages(pages: string[]): NormalizedExpenseDocument | null {
  const allText = pages.join("\n");
  if (!/\bCash App\b/i.test(allText) || !/\bAccount Statement\b/i.test(allText)) return null;
  const period = allText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (!period) return null;
  const month = monthNumbers[period[1].toLowerCase()];
  const year = Number(period[2]);
  const lines = pages.flatMap((page) => page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const rowPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+(\$[\d,]+\.\d{2})\s+([+-]?)\s*(\$[\d,]+\.\d{2})$/i;
  const rows: Record<string, unknown>[] = [];
  const unmatchedTransactionLines: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i.test(line)) continue;
    let match = line.match(rowPattern);
    if (!match) {
      for (let continuation = 1; continuation <= 3 && index + continuation < lines.length; continuation += 1) {
        const next = lines[index + continuation];
        if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i.test(next)) break;
        match = lines.slice(index, index + continuation + 1).join(" ").match(rowPattern);
        if (match) {
          index += continuation;
          break;
        }
      }
    }
    if (!match) {
      unmatchedTransactionLines.push(line);
      continue;
    }
    const transactionDate = isoDate(year, shortMonths[match[1].toLowerCase()], Number(match[2]));
    const description = match[3].trim();
    const feeCents = cents(match[4]);
    const amountCents = cents(match[6]);
    if (!transactionDate || amountCents === null || amountCents <= 0 || feeCents === null) continue;
    const fromPayment = description.match(/^From\s+(.+?)\s+Cash App payment$/i);
    const toPayment = description.match(/^To\s+(.+?)\s+Cash App payment$/i);
    const externalTransfer = /\b(?:external|standard|instant) transfer\b/i.test(description);
    const isCard = /Cash App Card/i.test(description);
    rows.push({
      transaction_date: transactionDate,
      posted_date: transactionDate,
      description,
      merchant_name: isCard ? description.replace(/\s+Cash App Card(?:\s+\(pending\))?$/i, "").trim() || null : null,
      counterparty_name: fromPayment?.[1] ?? toPayment?.[1] ?? null,
      transaction_type: externalTransfer ? "external_transfer" : fromPayment || toPayment ? "cash_app_payment" : isCard ? "cash_app_card" : "other",
      provider_status: /\(pending\)/i.test(description) ? "pending" : "completed",
      amount_cents: amountCents,
      fee_cents: feeCents,
      direction: match[5] === "+" || Boolean(fromPayment) || /\brefund\b/i.test(description) ? "credit" : "debit",
      is_transfer: externalTransfer,
      transfer_reason: externalTransfer ? "Cash App identified this as an external transfer." : null,
      confidence: 0.99,
    });
  }
  if (!rows.length) return null;

  const moneyIn = summaryAmount(lines, /^Money In\s*\+/i);
  const moneyOut = summaryAmount(lines, /^Money Out\s*-/i);
  const fees = summaryAmount(lines, /^Fees\b/i);
  const parsedCredits = rows.filter((row) => row.direction === "credit").reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const parsedDebits = rows.filter((row) => row.direction === "debit").reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const parsedFees = rows.reduce((sum, row) => sum + Number(row.fee_cents), 0);
  const differences = {
    moneyInCents: moneyIn === null ? null : parsedCredits - moneyIn,
    moneyOutCents: moneyOut === null ? null : parsedDebits - moneyOut,
    feeCents: fees === null ? null : parsedFees - fees,
  };
  const reviewReasons = [
    ...(unmatchedTransactionLines.length ? [`${unmatchedTransactionLines.length} dated statement row(s) could not be parsed.`] : []),
    ...(Object.values(differences).some((difference) => difference !== null && difference !== 0)
      ? ["Parsed transaction totals do not reconcile to the Cash App statement summary."]
      : []),
  ];

  const document = normalizeExpenseDocument({
    document_type: "statement",
    vendor_name: "Cash App",
    document_date: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    currency: "USD",
    fee_cents: fees,
    payment_method: "Cash App",
    statement_transactions: rows,
    extracted_text: allText,
    field_confidence: { documentType: 1, documentDate: 1, statementTransactions: 0.99 },
    overall_confidence: reviewReasons.length ? 0.75 : 0.99,
    review_reasons: reviewReasons,
  });
  return {
    ...document,
    extractionMethod: "deterministic_cash_app",
    statementSummary: {
      moneyInCents: moneyIn,
      moneyOutCents: moneyOut,
      feeCents: fees,
      parsedCreditCents: parsedCredits,
      parsedDebitCents: parsedDebits,
      parsedFeeCents: parsedFees,
      differences,
    },
  };
}
