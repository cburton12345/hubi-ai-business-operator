import { beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackCommandUnderstanding } from "@/lib/ai-workforce/command-understanding";

const { generateJsonWithAiService, independentReviewerConfigured } = vi.hoisted(() => ({
  generateJsonWithAiService: vi.fn(),
  independentReviewerConfigured: vi.fn(),
}));
vi.mock("@/lib/ai/ai-service", () => ({ generateJsonWithAiService }));
vi.mock("@/lib/ai/model-routing", () => ({ independentReviewerConfigured }));

import { deterministicCommandPlanReviewIssues, independentlyReviewFerocityCommandPlan } from "./command-plan-review";

describe("Ask Ferocity independent plan review", () => {
  beforeEach(() => {
    generateJsonWithAiService.mockReset();
    independentReviewerConfigured.mockReset().mockReturnValue(true);
  });

  it("cannot pass a consequential plan when primary planning fell back and evidence is missing", async () => {
    generateJsonWithAiService.mockResolvedValue({ status: "passed", issues: [], humanReviewRequired: false });
    const understanding = {
      ...fallbackCommandUnderstanding("File these tax expenses"),
      requestedMode: "workspace_changing" as const,
      capabilities: ["expenses_tax" as const],
    };
    const result = await independentlyReviewFerocityCommandPlan({
      tenantId: "tenant",
      command: "File these tax expenses",
      understanding,
      evidence: [],
    });
    expect(result.status).toBe("disagreed");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("fallback"),
      expect.stringContaining("No authoritative workspace evidence"),
    ]));
  });

  it("permits a distinct reviewer verdict only after deterministic gates pass", async () => {
    generateJsonWithAiService.mockResolvedValue({ status: "passed", issues: [], humanReviewRequired: false });
    const understanding = {
      ...fallbackCommandUnderstanding("Prepare a reply to this customer email"),
      planningAiStatus: "completed" as const,
      responseAiStatus: "completed" as const,
      requestedMode: "draft_preparation" as const,
      capabilities: ["communications" as const],
    };
    expect(deterministicCommandPlanReviewIssues({
      domain: "customer_communication",
      understanding,
      evidence: [{ key: "communications", status: "verified" }],
    })).toEqual([]);
    const result = await independentlyReviewFerocityCommandPlan({
      tenantId: "tenant",
      command: "Prepare a reply to this customer email",
      understanding,
      evidence: [{ key: "communications", status: "verified" }],
    });
    expect(result.status).toBe("passed");
  });
});
