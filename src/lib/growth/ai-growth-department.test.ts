import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("collapses differently worded recommendations for the same lead-capture gap", () => {
    const actions = [
      { key: "campaign-lead-capture", category: "content", title: "Implement tracked lead capture mechanisms", whyNow: "No forms or leads exist.", nextStep: "Add contact forms linked to campaigns.", ownerInvolvement: "approval", organicFirst: true, priorityScore: 90, confidenceScore: 80, estimatedValueCents: null, evidence: ["0 forms · 0 leads"], channels: [] },
      { key: "capability:capture", category: "positioning", title: "Strengthen demand and lead capture", whyNow: "Capture is missing.", nextStep: "Give every campaign a tracked way to become a lead.", ownerInvolvement: "approval", organicFirst: true, priorityScore: 88, confidenceScore: 100, estimatedValueCents: null, evidence: ["0 forms · 0 leads"], channels: [] }
    ] as GrowthDepartmentAction[];

    expect(normalizeGrowthDepartmentActions(actions, 5)).toHaveLength(1);
    expect(normalizeGrowthDepartmentActions(actions, 5)[0]?.key).toBe("campaign-lead-capture");
  });

  it("counts only durable pending approvals as awaiting approval", () => {
    const source = readFileSync(new URL("./get-growth-operator.ts", import.meta.url), "utf8");

    expect(source).toContain("target_type='growth_action' and status='pending'");
    expect(source).toContain("needsApproval: numberFrom(growthApprovalResult?.rows[0]?.pending_approvals)");
  });

  it("re-reads the tenant-scoped recommendation before Ferocity handles it", () => {
    const source = readFileSync(new URL("../../app/app/growth/actions.ts", import.meta.url), "utf8");

    expect(source).toContain("where tenant_id=$1 and id=$2");
    expect(source).toContain("executeFerocityChatAction({ ok: false }, commandForm)");
    expect(source).toContain("preserve approval for publishing, outreach, spend");
  });
});
