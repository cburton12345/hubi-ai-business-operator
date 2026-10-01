import { describe, expect, it } from "vitest";
import { buildBusinessOpportunityBrief } from "./business-opportunity-diagnostic";

describe("business opportunity diagnostic", () => {
  it("deduplicates, ranks, and separates preparation from owner decisions", () => {
    const result = buildBusinessOpportunityBrief([
      { title: "Collect invoices", detail: "Two invoices are overdue.", href: "/app/cash-collection", urgency: "high", evidence: "2 overdue invoices", confidence: 96, handling: "ferocity_can_prepare", valueCents: 200_000 },
      { title: "Approve campaign", detail: "One campaign is waiting.", href: "/app/growth", urgency: "critical", evidence: "1 approval", confidence: 90, handling: "owner_decision" },
      { title: "Collect invoices", detail: "Duplicate.", href: "/app/cash-collection", urgency: "low", evidence: "duplicate", confidence: 30, handling: "monitor" },
      { title: "Connect email", detail: "Email is not connected.", href: "/app/integrations", urgency: "medium", evidence: "provider status", confidence: 99, handling: "connection_required" }
    ]);

    expect(result.discoveredCount).toBe(3);
    expect(result.focusNow.map((item) => item.title)).toEqual(["Approve campaign", "Collect invoices"]);
    expect(result.ferocityCanPrepareCount).toBe(1);
    expect(result.ownerDecisionCount).toBe(1);
    expect(result.connectionRequiredCount).toBe(1);
    expect(result.summary).toContain("Ferocity can prepare 1");
  });

  it("does not invent a diagnosis when there is no evidence", () => {
    const result = buildBusinessOpportunityBrief([]);
    expect(result.discoveredCount).toBe(0);
    expect(result.focusNow).toEqual([]);
    expect(result.summary).toContain("before it makes a stronger claim");
  });
});
