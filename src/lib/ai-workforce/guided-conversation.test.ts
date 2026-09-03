import { describe, expect, it } from "vitest";
import { ferocityGoals, hasUsefulIndustry, moneyCommand } from "./guided-conversation";

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
