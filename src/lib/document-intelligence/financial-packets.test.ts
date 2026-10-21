import { describe, expect, it } from "vitest";
import { buildFinancialPackets } from "@/lib/document-intelligence/financial-packets";
import type { StatementTransaction } from "@/lib/document-intelligence/types";

const row = (overrides: Partial<StatementTransaction>): StatementTransaction => ({
  sourceKey: "row-1", transactionDate: "2026-01-01", postedDate: null, description: "", merchantName: null,
  counterpartyName: null, counterpartyHandle: null, note: null, transactionType: null, providerStatus: null,
  referenceNumber: null, amountCents: 100, feeCents: 0, direction: "debit", balanceCents: null,
  suggestedCategory: null, isTransfer: false, transferReason: null, confidence: 1, ...overrides
});

describe("financial packets", () => {
  it("separates transfers, withdrawals, refunds, income, expenses, and unresolved rows without double counting", () => {
    const result = buildFinancialPackets([
      row({ sourceKey: "income", direction: "credit", description: "Rent payment", amountCents: 1000 }),
      row({ sourceKey: "expense", description: "Materials", amountCents: 400 }),
      row({ sourceKey: "transfer", isTransfer: true, description: "Transfer to bank", amountCents: 300 }),
      row({ sourceKey: "withdrawal", description: "ATM cash withdrawal", amountCents: 200 }),
      row({ sourceKey: "refund", direction: "credit", description: "Merchant refund", amountCents: 50 }),
      row({ sourceKey: "unknown", description: "Unknown", amountCents: 25 })
    ]);
    expect(result.totals).toMatchObject({ sourceRows: 6, debitCents: 925, creditCents: 1050, incomeCents: 1000, expenseCents: 400, transferCents: 300, withdrawalCents: 200, refundCents: 50, unresolvedCents: 25 });
    expect(Object.values(result.packets).flat()).toHaveLength(6);
  });

  it("fails closed on duplicate source row identities", () => {
    expect(() => buildFinancialPackets([row({ sourceKey: "same" }), row({ sourceKey: "same" })])).toThrow(/Duplicate/);
  });
});
