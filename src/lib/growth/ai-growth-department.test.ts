import { describe, expect, it } from "vitest";
import { normalizeGrowthDepartmentActions, type GrowthDepartmentAction } from "./ai-growth-department";

describe("AI Growth Department prioritization", () => {
  it("deduplicates, bounds scores, ranks value, and defaults to organic approval", () => {
    const actions = [
      { key: " Best Conversation ", category: "conversation", title: "Reply helpfully", whyNow: "Intent", nextStep: "Review", ownerInvolvement: "approval", organicFirst: true, priorityScore: 72, confidenceScore: 80, estimatedValueCents: null, evidence: ["source"], channels: ["reddit"] },
      { key: "website-gap", category: "website", title: "Fix CTA", whyNow: "Gap", nextStep: "Edit", ownerInvolvement: "automatic", organicFirst: true, priorityScore: 140, confidenceScore: -2, estimatedValueCents: -1, evidence: [], channels: ["website"] },
      { key: "best-conversation", category: "conversation", title: "Duplicate", whyNow: "Intent", nextStep: "Ignore", ownerInvolvement: "approval", organicFirst: true, priorityScore: 99, confidenceScore: 90, estimatedValueCents: null, evidence: [], channels: [] }
    ] as GrowthDepartmentAction[];
    expect(normalizeGrowthDepartmentActions(actions, 5)).toEqual([
      expect.objectContaining({ key: "website-gap", priorityScore: 100, confidenceScore: 0, estimatedValueCents: 0 }),
      expect.objectContaining({ key: "best-conversation", title: "Reply helpfully" })
    ]);
  });

  it("returns only the requested small daily set", () => {
    const actions = Array.from({ length: 12 }, (_, index) => ({ key: `a-${index}`, category: "content", title: `Action ${index}`, whyNow: "Evidence", nextStep: "Act", ownerInvolvement: "approval", organicFirst: true, priorityScore: index, confidenceScore: 80, estimatedValueCents: null, evidence: ["signal"], channels: [] })) as GrowthDepartmentAction[];
    expect(normalizeGrowthDepartmentActions(actions, 3).map((item) => item.key)).toEqual(["a-11", "a-10", "a-9"]);
  });
});
