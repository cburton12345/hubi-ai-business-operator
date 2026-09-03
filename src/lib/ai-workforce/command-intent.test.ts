import { describe, expect, it } from "vitest";
import { classifyAiCommandIntent, readOnlyRouteForCommand, workspaceRouteForCommand } from "./command-intent";

describe("classifyAiCommandIntent", () => {
  it("keeps owner status questions read-only", () => {
    expect(classifyAiCommandIntent("Show me what matters today")).toBe("read_only");
    expect(classifyAiCommandIntent("What needs my attention today?")).toBe("read_only");
  });

  it("separates preparation from external actions", () => {
    expect(classifyAiCommandIntent("Make me a video ad")).toBe("draft_preparation");
    expect(classifyAiCommandIntent("Automatically post this ad to Facebook")).toBe("external");
  });

  it("routes read-only questions without mutation", () => {
    expect(readOnlyRouteForCommand("Show me what matters today")).toBe("/app/attention-command");
    expect(readOnlyRouteForCommand("Show revenue and money owed")).toBe("/app/revenue-growth");
    expect(readOnlyRouteForCommand("Show calls from yesterday")).toBe("/app/calls");
    expect(readOnlyRouteForCommand("Open the call inbox")).toBe("/app/calls");
  });
});

describe("workspaceRouteForCommand", () => {
  it("takes people to the part of Ferocity that owns the prepared work", () => {
    expect(workspaceRouteForCommand("Create a marketing plan to bring in customers")).toBe("/app/growth");
    expect(workspaceRouteForCommand("Collect unpaid invoices")).toBe("/app/cash-collection");
    expect(workspaceRouteForCommand("Prepare a job estimate")).toBe("/app/job-tracker");
    expect(workspaceRouteForCommand("Set Ferocity up for me")).toBe("/app/welcome");
  });
});
