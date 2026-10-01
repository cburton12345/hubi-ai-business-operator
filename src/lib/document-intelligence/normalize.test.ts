import { describe, expect, it } from "vitest";
import { normalizeExpenseDocument } from "./normalize";

describe("normalizeExpenseDocument", () => {
  it("normalizes a rich provider response without app-specific fields", () => {
    const result = normalizeExpenseDocument({
      document_type: "purchase order",
      vendor_name: "ABC Supply",
      document_date: "9/10/2026",
      subtotal_cents: "10000",
      tax_cents: 550,
      total_cents: 10550,
      overall_confidence: 0.94,
      line_items: [{ description: "Roofing screws", quantity: 4, unit_price_cents: 2500, total_cents: 10000, confidence: 0.9 }]
    });
    expect(result.documentType).toBe("purchase_order");
    expect(result.totalCents).toBe(10550);
    expect(result.lineItems[0].description).toBe("Roofing screws");
  });

  it("keeps statement charges separate and identifies credits and transfers", () => {
    const result = normalizeExpenseDocument({
      document_type: "statement",
      vendor_name: "Example Bank",
      document_date: "2026-09-01",
      overall_confidence: 0.95,
      statement_transactions: [
        { transaction_date: "2026-08-12", description: "MENARDS 1234", amount_cents: 8421, direction: "debit", suggested_category: "materials", confidence: 0.96 },
        { transaction_date: "2026-08-15", description: "PAYMENT THANK YOU", amount_cents: 50000, direction: "credit", is_transfer: true, transfer_reason: "Card payment", confidence: 0.98 }
      ]
    });
    expect(result.documentType).toBe("statement");
    expect(result.totalCents).toBeNull();
    expect(result.reviewReasons).not.toContain("Total could not be read confidently.");
    expect(result.statementTransactions).toHaveLength(2);
    expect(result.statementTransactions[0]).toMatchObject({ amountCents: 8421, direction: "debit", suggestedCategory: "materials" });
    expect(result.statementTransactions[1]).toMatchObject({ direction: "credit", isTransfer: true });
    expect(result.statementTransactions[0].sourceKey).toHaveLength(64);
  });

  it("trusts an explicit debit direction even when a bank exports the amount as negative", () => {
    const result = normalizeExpenseDocument({
      document_type: "statement",
      vendor_name: "Example Bank",
      document_date: "2026-09-01",
      overall_confidence: 0.91,
      statement_transactions: [
        { transaction_date: "2026-08-12", description: "MENARDS 1234", amount_cents: -8421, direction: "debit", confidence: 0.93 }
      ]
    });
    expect(result.statementTransactions[0]).toMatchObject({ amountCents: 8421, direction: "debit", isTransfer: false });
  });

  it("conservatively recognizes a card payment when direction metadata is missing", () => {
    const result = normalizeExpenseDocument({
      document_type: "statement",
      vendor_name: "Example Card",
      document_date: "2026-09-01",
      overall_confidence: 0.91,
      statement_transactions: [
        { transaction_date: "2026-08-15", description: "ONLINE PAYMENT THANK YOU", amount_cents: 50000, confidence: 0.9 }
      ]
    });
    expect(result.statementTransactions[0]).toMatchObject({ direction: "credit", isTransfer: true });
  });

  it("keeps identical legitimate charges distinct while producing stable import keys", () => {
    const raw = {
      document_type: "statement",
      vendor_name: "Example Bank",
      document_date: "2026-09-01",
      overall_confidence: 0.95,
      statement_transactions: [
        { transaction_date: "2026-08-20", description: "PARKING METER", amount_cents: 500, direction: "debit", confidence: 0.98 },
        { transaction_date: "2026-08-20", description: "PARKING METER", amount_cents: 500, direction: "debit", confidence: 0.98 }
      ]
    };
    const first = normalizeExpenseDocument(raw);
    const second = normalizeExpenseDocument(raw);
    expect(first.statementTransactions[0].sourceKey).not.toBe(first.statementTransactions[1].sourceKey);
    expect(first.statementTransactions.map((row) => row.sourceKey)).toEqual(second.statementTransactions.map((row) => row.sourceKey));
  });
});
