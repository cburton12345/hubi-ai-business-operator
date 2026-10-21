import { describe, expect, it } from "vitest";
import { parseCashAppStatementPages } from "./cash-app-statement";

describe("deterministic Cash App statement parser", () => {
  it("preserves every table row, direction, fee, transfer, and summary reconciliation", () => {
    const result = parseCashAppStatementPages([
      `December 2025\nAccount Statement\nCash App\nMoney In + $125.00\nMoney Out - $32.50\nFees $0.00`,
      `Date Description Details Fee Amount\nDec 1 From Jane Doe Cash App payment $0.00 + $125.00\nDec 2 Hardware Store Cash App Card $0.00 $20.00\nDec 3 To Checking 9 1234 external transfer $0.00 $12.50`,
    ]);

    expect(result?.extractionMethod).toBe("deterministic_cash_app");
    expect(result?.documentDate).toBe("2025-12-31");
    expect(result?.statementTransactions).toHaveLength(3);
    expect(result?.statementTransactions[0]).toMatchObject({ direction: "credit", counterpartyName: "Jane Doe", amountCents: 12_500, feeCents: 0 });
    expect(result?.statementTransactions[1]).toMatchObject({ direction: "debit", merchantName: "Hardware Store", transactionType: "cash_app_card" });
    expect(result?.statementTransactions[2]).toMatchObject({ direction: "debit", isTransfer: true, transactionType: "external_transfer" });
    expect(result?.statementSummary).toMatchObject({
      moneyInCents: 12_500,
      moneyOutCents: 3_250,
      parsedCreditCents: 12_500,
      parsedDebitCents: 3_250,
      differences: { moneyInCents: 0, moneyOutCents: 0, feeCents: 0 },
    });
    expect(result?.reviewReasons).toEqual([]);
  });

  it("refuses unrelated PDFs and flags summary mismatches", () => {
    expect(parseCashAppStatementPages(["Unrelated invoice"])).toBeNull();
    const result = parseCashAppStatementPages([
      `January 2025\nAccount Statement\nCash App\nMoney In + $10.00\nMoney Out - $0.00\nFees $0.00\nJan 2 From Jane Doe Cash App payment $0.00 + $9.00`,
    ]);
    expect(result?.reviewReasons).toContain("Parsed transaction totals do not reconcile to the Cash App statement summary.");
    expect(result?.overallConfidence).toBe(0.75);
  });

  it("joins a wrapped transaction row before parsing", () => {
    const result = parseCashAppStatementPages([
      `April 2025\nAccount Statement\nCash App\nMoney In + $0.00\nMoney Out - $18.56\nFees $0.00\nApr 9 A merchant description that wrapped\n$0.00 $18.56`,
    ]);
    expect(result?.statementTransactions).toHaveLength(1);
    expect(result?.statementTransactions[0]).toMatchObject({ amountCents: 1_856, direction: "debit" });
    expect(result?.reviewReasons).toEqual([]);
  });
});
