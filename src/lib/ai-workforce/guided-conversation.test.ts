import { describe, expect, it } from "vitest";
import { ferocityGoals, ferocityOnboardingGoals, hasUsefulIndustry, moneyCommand } from "./guided-conversation";

describe("Ferocity guided conversation", () => {
  it("offers outcome-first choices instead of tool names", () => {
    expect(ferocityGoals.map((goal) => goal.label)).toEqual([
      "Make more money",
      "Bring in more customers",
      "Get paid faster",
      "Run work more smoothly",
      "Tell me what needs attention",
      "Set Ferocity up for me"
    ]);
  });

  it("keeps onboarding diagnostic instead of dumping product features", () => {
    expect(ferocityOnboardingGoals.map((goal) => goal.label)).toEqual([
      "Find my biggest bottleneck",
      "Make more money",
      "Show me what is worth automating",
      "Set Ferocity up for me"
    ]);
    expect(ferocityOnboardingGoals[0].command).toContain("evidence-backed");
    expect(ferocityOnboardingGoals[0].command).toContain("three items that matter first");
    expect(ferocityOnboardingGoals[2].command).toContain("meaningful value");
  });

  it("does not treat placeholder industries as useful context", () => {
    expect(hasUsefulIndustry("Roofing")).toBe(true);
    expect(hasUsefulIndustry("Uncategorized")).toBe(false);
    expect(hasUsefulIndustry(null)).toBe(false);
  });

  it("keeps consequential growth work approval safe", () => {
    const command = moneyCommand("Roofing", "Create a plan to bring in new customers");
    expect(command).toContain("Roofing");
    expect(command).toContain("without publishing or spending until approved");
  });
});
