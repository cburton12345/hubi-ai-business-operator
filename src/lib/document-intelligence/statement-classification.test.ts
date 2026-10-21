import { describe, expect, it } from "vitest";
import { categoryForStatementDescription, classifyStatementTransaction } from "./statement-classification";
import type { AllocationTarget, StatementTransaction } from "./types";

const transaction = (description: string): StatementTransaction => ({
  sourceKey: "row", transactionDate: "2025-12-01", postedDate: null, description,
  merchantName: description, counterpartyName: null, counterpartyHandle: null, note: null,
  transactionType: "cash_app_card", providerStatus: "completed", referenceNumber: null,
  amountCents: 1000, feeCents: 0, direction: "debit", balanceCents: null,
  suggestedCategory: null, isTransfer: false, transferReason: null, confidence: 0.99,
});
const property = (ref: string, city: string, state: string, type = "property"): AllocationTarget => ({
  type, ref, label: `${city} property`, metadata: { locationCity: city, locationState: state },
});

describe("statement transaction classification", () => {
  it("classifies common expenses and suggests one location-backed property", () => {
    const result = classifyStatementTransaction(transaction("Menards Mankato MN Cash App Card"), [
      property("one", "Mankato", "MN"), property("two", "Austin", "MN"),
    ]);
    expect(result.category).toBe("materials");
    expect(result.allocation).toMatchObject({ targetRef: "one", confidence: 0.9 });
    expect(result.allocation?.metadata).toMatchObject({
      assignmentEvidence: "merchant_location_suggestion",
      matchedMerchantCity: "mankato",
      matchedMerchantState: "mn",
    });
  });

  it("does not force an ambiguous unit or property assignment", () => {
    const result = classifyStatementTransaction(transaction("Hardware Mankato MN Cash App Card"), [
      property("unit-one", "Mankato", "MN", "unit"), property("unit-two", "Mankato", "MN", "unit"),
    ]);
    expect(result.allocation).toBeNull();
  });

  it("never allocates transfers or deposits as an expense", () => {
    expect(classifyStatementTransaction({ ...transaction("To Checking Standard transfer"), isTransfer: true }, []).category).toBe("transfer");
    expect(classifyStatementTransaction({ ...transaction("From Customer Cash App payment"), direction: "credit" }, []).allocation).toBeNull();
  });

  it("recognizes common statement abbreviations without claiming deductibility", () => {
    expect(categoryForStatementDescription("Mnrd Ec West Eau Claire WI Cash App Card")).toBe("materials");
    expect(categoryForStatementDescription("Cenex Synergy Community Elk Mound WI Cash App Card")).toBe("fuel");
    expect(categoryForStatementDescription("Wm Supercenter Menomonie WI Cash App Card")).toBe("general_merchandise_needs_receipt");
    expect(categoryForStatementDescription("Netflix.com Cash App Card")).toBe("personal_or_nonbusiness_needs_review");
  });

  it("replaces placeholder categories but preserves an existing specific category", () => {
    expect(classifyStatementTransaction({ ...transaction("Mnrd Eau Claire WI Cash App Card"), suggestedCategory: "uncategorized" }, []).category).toBe("materials");
    expect(classifyStatementTransaction({ ...transaction("Walmart Cash App Card"), suggestedCategory: "office" }, []).category).toBe("office");
  });

  it("recognizes provider variants while preserving uncertain tax treatment", () => {
    expect(categoryForStatementDescription("Www.advanceautoparts Roanoke VA Cash App Card")).toBe("vehicle");
    expect(categoryForStatementDescription("XCEL ENERGY-WI XCELENERGY Direct debit")).toBe("utilities");
    expect(categoryForStatementDescription("Vevor.com Cash App Card")).toBe("equipment_needs_receipt");
    expect(categoryForStatementDescription("Allpaid City Of Altoona Cash App Card")).toBe("government_or_legal_needs_review");
    expect(categoryForStatementDescription("Frontier Reservations Cash App Card")).toBe("travel_needs_review");
    expect(categoryForStatementDescription("Zsk Ce Action City Eau Claire WI Cash App Card")).toBe("personal_or_nonbusiness_needs_review");
  });
});
