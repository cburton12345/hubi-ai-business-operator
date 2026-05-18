import { describe, expect, it } from "vitest";
import { leadStatuses, qualificationStatuses } from "@/lib/leads/constants";

describe("lead workflow constants", () => {
  it("keeps expected CRM-lite statuses available", () => {
    expect(leadStatuses).toContain("new");
    expect(leadStatuses).toContain("qualified");
    expect(leadStatuses).toContain("spam");
  });

  it("keeps approval-sensitive qualification states available", () => {
    expect(qualificationStatuses).toContain("needs_review");
    expect(qualificationStatuses).toContain("disqualified");
  });
});
