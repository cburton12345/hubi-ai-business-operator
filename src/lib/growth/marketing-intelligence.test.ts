import { describe, expect, it } from "vitest";
import { answerEngineFindings, coreMarketingPlaybooks, marketingActionAuthority, scoreMarketingOpportunity, translateOwnerGrowthGoal } from "./marketing-intelligence";

describe("composable marketing intelligence", () => {
  it("scores business value using impact, relevance, confidence, urgency and effort", () => {
    const strong = scoreMarketingOpportunity({ impact: 95, relevance: 90, effort: 20, confidence: 85, urgency: 80 });
    const weak = scoreMarketingOpportunity({ impact: 30, relevance: 30, effort: 90, confidence: 30, urgency: 20 });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeLessThanOrEqual(100);
  });

  it("keeps risky, paid, uncertain and unauthorized external work gated", () => {
    expect(marketingActionAuthority({ autonomy: "autopilot", external: false, paid: false, reputationImpacting: false, confidence: 90 }).mayExecute).toBe(true);
    expect(marketingActionAuthority({ autonomy: "autopilot", external: true, paid: true, reputationImpacting: false, confidence: 95, ownerApprovedPattern: true }).requiresApproval).toBe(true);
    expect(marketingActionAuthority({ autonomy: "approve", external: true, paid: false, reputationImpacting: true, confidence: 95 }).requiresApproval).toBe(true);
  });

  it("turns plain owner outcomes into coordinated playbooks and constraints", () => {
    expect(translateOwnerGrowthGoal("Fill next week.").goalKey).toBe("fill_capacity");
    const profit = translateOwnerGrowthGoal("Get more profitable roofing jobs without increasing ad spend");
    expect(profit.goalKey).toBe("increase_profitable_jobs");
    expect(profit.constraints).toContain("no_increased_ad_spend");
    expect(translateOwnerGrowthGoal("Improve our Google visibility").playbooks).toContain("ai_search_visibility");
  });

  it("turns answer-engine observations into grounded corrective work", () => {
    const findings = answerEngineFindings({ businessMentioned: false, citations: [], inaccuracies: ["Wrong service area"], competitors: ["Competitor"] });
    expect(findings[0].key).toBe("factual-correction");
    expect(findings.map((item) => item.key)).toContain("source-gap");
  });

  it("defines complete reusable playbook contracts", () => {
    expect(coreMarketingPlaybooks.length).toBeGreaterThanOrEqual(4);
    for (const playbook of coreMarketingPlaybooks) {
      expect(playbook.requiredContext.length).toBeGreaterThan(0);
      expect(playbook.workflow.length).toBeGreaterThan(0);
      expect(playbook.decisionRules.length).toBeGreaterThan(0);
      expect(playbook.outputs.length).toBeGreaterThan(0);
      expect(playbook.qualityChecks.length).toBeGreaterThan(0);
      expect(playbook.successMetrics.length).toBeGreaterThan(0);
      expect(playbook.permissions.paidSpend).toBeTruthy();
    }
  });
});
