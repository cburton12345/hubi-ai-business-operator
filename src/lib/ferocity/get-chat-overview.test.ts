import { describe, expect, it, vi } from "vitest";

const queryPostgres = vi.fn();
vi.mock("@/lib/db/postgres", () => ({ queryPostgres }));

describe("Ferocity chat overview", () => {
  it("uses one tenant-scoped query and returns actionable, evidence-backed priorities", async () => {
    queryPostgres.mockResolvedValueOnce({ rows: [{
      critical_events: "1",
      owner_events: "2",
      growth_approvals: "3",
      provider_gaps: "1",
      document_review: "4",
    }] });
    const { getFerocityChatOverview } = await import("./get-chat-overview");
    const result = await getFerocityChatOverview("tenant-1");

    expect(queryPostgres).toHaveBeenCalledTimes(1);
    expect(queryPostgres.mock.calls[0][1]).toEqual(["tenant-1"]);
    expect(result.attentionItems).toHaveLength(5);
    expect(result.opportunityBrief.discoveredCount).toBe(5);
    expect(result.opportunityBrief.focusNow.every((item) => item.evidence.length > 0)).toBe(true);
  });
});
