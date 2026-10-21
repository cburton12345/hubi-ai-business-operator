import { describe, expect, it, vi } from "vitest";
import { evidenceDomainsForFerocityCommand, requestedFinancialYear } from "./scoped-business-evidence";

vi.mock("server-only", () => ({}));

describe("Ask Ferocity scoped evidence selection", () => {
  it("selects only the workspace domains needed for a focused request", () => {
    expect(evidenceDomainsForFerocityCommand(
      "Which inventory items need reordering from suppliers?",
      ["pos_inventory", "purchasing_suppliers"],
    )).toEqual(["inventory_purchasing"]);
  });

  it("combines evidence for a cross-business owner request", () => {
    expect(evidenceDomainsForFerocityCommand(
      "Check unpaid invoices and stale leads",
      ["collections", "lead_follow_up"],
    )).toEqual(expect.arrayContaining(["money_documents", "customers"]));
  });

  it("expands an explicit whole-business scan", () => {
    expect(evidenceDomainsForFerocityCommand(
      "Check the whole business",
      ["reporting_attention"],
    )).toHaveLength(8);
  });

  it("uses an explicitly requested financial year without inventing one", () => {
    expect(requestedFinancialYear("What did the 2025 Cash App statements show?")).toBe(2025);
    expect(requestedFinancialYear("What do my statements show?")).toBeNull();
    expect(requestedFinancialYear("Show the 2099 tax packet")).toBeNull();
  });
});
