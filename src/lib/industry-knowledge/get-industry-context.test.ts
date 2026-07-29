import { describe, expect, it } from "vitest";
import { industryContextForPrompt, type IndustryKnowledgeContext } from "./get-industry-context";

describe("industry knowledge prompt context", () => {
  it("keeps module guardrails attached to operating knowledge", () => {
    const context: IndustryKnowledgeContext = {
      moduleKey: "roofing_core",
      industryKey: "roofing",
      moduleName: "Roofing",
      guardrails: ["Do not diagnose damage."],
      items: [{
        category: "intake",
        title: "Ask about leaks",
        content: "Collect timing and location.",
        riskLevel: "medium",
        requiresVerification: true
      }]
    };
    const prompt = industryContextForPrompt(context);
    expect(prompt).toContain("Do not diagnose damage.");
    expect(prompt).toContain("Verify before acting.");
  });

  it("uses a safe generic instruction without a module", () => {
    expect(industryContextForPrompt(null)).toContain("avoid industry-specific claims");
  });
});
