import type { StatementTransaction } from "@/lib/document-intelligence/types";

export type FinancialPacketKind = "income" | "expense" | "transfer" | "withdrawal" | "refund" | "unresolved";
export type FinancialPacketRow<T extends StatementTransaction = StatementTransaction> = T & { packetKind: FinancialPacketKind };

const withdrawalPattern = /\b(atm|cash withdrawal|cash out|withdrawal)\b/i;
const refundPattern = /\b(refund|reversal|credit memo|merchant credit|chargeback credit)\b/i;
const incomePattern = /\b(rent|sale|invoice payment|service payment|revenue|deposit income)\b/i;
const expensePattern = /\b(materials?|supplies|labor|contractors?|repairs?|utilities|utility|insurance|legal|fuel|vehicle|advertising|fees?|expenses?)\b/i;

export function classifyFinancialPacketRow(row: StatementTransaction): FinancialPacketKind {
  const evidence = [row.transactionType, row.suggestedCategory, row.description, row.note].filter(Boolean).join(" ");
  if (row.isTransfer) return "transfer";
  if (row.direction === "debit" && withdrawalPattern.test(evidence)) return "withdrawal";
  if (row.direction === "credit" && refundPattern.test(evidence)) return "refund";
  if (row.direction === "credit" && incomePattern.test(evidence)) return "income";
  if (row.direction === "debit" && expensePattern.test(evidence)) return "expense";
  return "unresolved";
}

export function buildFinancialPackets<T extends StatementTransaction>(rows: T[]) {
  const seen = new Set<string>();
  const packets: Record<FinancialPacketKind, FinancialPacketRow<T>[]> = {
    income: [], expense: [], transfer: [], withdrawal: [], refund: [], unresolved: []
  };
  let debitCents = 0;
  let creditCents = 0;
  for (const row of rows) {
    if (!row.sourceKey || seen.has(row.sourceKey)) throw new Error(`Duplicate or missing statement row identity: ${row.sourceKey || "missing"}`);
    seen.add(row.sourceKey);
    const packetKind = classifyFinancialPacketRow(row);
    packets[packetKind].push({ ...row, packetKind });
    if (row.direction === "debit") debitCents += Math.abs(row.amountCents);
    else creditCents += Math.abs(row.amountCents);
  }
  const packetDebitCents = Object.values(packets).flat().filter((row) => row.direction === "debit").reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
  const packetCreditCents = Object.values(packets).flat().filter((row) => row.direction === "credit").reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
  if (packetDebitCents !== debitCents || packetCreditCents !== creditCents) throw new Error("Financial packet totals do not reconcile to the source rows.");
  return {
    packets,
    totals: {
      sourceRows: rows.length,
      debitCents,
      creditCents,
      incomeCents: packets.income.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      expenseCents: packets.expense.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      transferCents: packets.transfer.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      withdrawalCents: packets.withdrawal.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      refundCents: packets.refund.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
      unresolvedCents: packets.unresolved.reduce((sum, row) => sum + Math.abs(row.amountCents), 0)
    }
  };
}
