import { describe, expect, it } from "vitest";
import { readBusinessActionForCommand, summarizeBusinessActionItems } from "./business-action-routing";

describe("authenticated Ferocity business-action routing", () => {
  it.each([
    ["Show me stale leads that need attention", "getStaleLeads", "/app/leads"],
    ["List open leads", "getOpenLeads", "/app/leads"],
    ["Which unsold estimates need follow-up?", "getUnsoldEstimates", "/app/estimates"],
    ["Who owes us on overdue invoices?", "getOutstandingInvoices", "/app/cash-collection"],
    ["What did we promise that is still open?", "getOpenCommitments", "/app/commitments"],
  ])("routes %s to the audited action layer", (command, action, href) => {
    expect(readBusinessActionForCommand(command)).toEqual({ action, href });
  });

  it("does not guess an action for an unrelated request", () => {
    expect(readBusinessActionForCommand("Help me think through next year's strategy")).toBeNull();
  });

  it("summarizes real action output without inventing records", () => {
    expect(summarizeBusinessActionItems("getOutstandingInvoices", {
      items: [{ customerName: "Northwind", status: "past_due", balanceCents: 125050 }],
    })).toEqual(["Invoice: Northwind — past due — $1250.50 outstanding"]);
    expect(summarizeBusinessActionItems("getOpenLeads", { items: [] })).toEqual([]);
  });
});
