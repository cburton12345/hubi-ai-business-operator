import { describe, expect, it } from "vitest";
import { applyCommandActionPolicy, isFinancialDocumentCommand } from "./command-action-policy";

describe("financial command action policy", () => {
  it("blocks growth actions for the exact expense-total request", () => {
    const result = applyCommandActionPolicy({
      command: "I need you to add everything up. I need the expenses added up",
      plannedActions: ["prepare_marketing", "prepare_seo", "scan_business", "create_expense_review_task"],
    });

    expect(result.financialDocumentScope).toBe(true);
    expect(result.existingFinancialReport).toBe(true);
    expect(result.plannedActions).toEqual([]);
  });

  it("uses financial conversation context for vague follow-ups", () => {
    const result = applyCommandActionPolicy({
      command: "assist quick",
      conversationContext: "prepare a printable expense summary report for 2025",
      plannedActions: ["prepare_marketing", "scan_revenue_loop", "scan_business"],
    });

    expect(result.financialDocumentScope).toBe(true);
    expect(result.plannedActions).toEqual([]);
  });

  it("keeps a genuine imported-receipt review inside the expense domain", () => {
    const result = applyCommandActionPolicy({
      command: "Review this receipt and create an expense review task",
      plannedActions: ["create_expense_review_task", "prepare_marketing"],
    });

    expect(result.plannedActions).toEqual(["create_expense_review_task"]);
  });

  it("does not constrain an actual growth request", () => {
    expect(isFinancialDocumentCommand({ command: "Prepare a roofing referral campaign" })).toBe(false);
  });

  it("blocks every planned mutation when the owner explicitly requests read-only handling", () => {
    const result = applyCommandActionPolicy({
      command: "Read only: tell me how many financial documents need review. Do not change anything.",
      plannedActions: ["create_expense_review_task", "prepare_marketing", "scan_business"],
    });

    expect(result.readOnlyRequested).toBe(true);
    expect(result.financialDocumentScope).toBe(true);
    expect(result.plannedActions).toEqual([]);
  });
});
