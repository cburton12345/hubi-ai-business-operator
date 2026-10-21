import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Netlify background function bundles", () => {
  it("loads the business-automation dependency graph outside the Next.js react-server condition", async () => {
    const backgroundFunction = await import("../../../netlify/functions/run-business-automation-background");

    expect(backgroundFunction.default).toBeTypeOf("function");
    expect(backgroundFunction.config).toEqual({ background: true });
  }, 15_000);

  it("passes independently bounded multi-goal capacity into the automation runtime", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "netlify/functions/run-business-automation-background.ts"),
      "utf8",
    );
    expect(source).toContain("AUTOMATION_GOAL_PLAN_BATCH_SIZE");
    expect(source).toContain("AUTOMATION_GOAL_PLANNING_CONCURRENCY");
    expect(source).toContain("AUTOMATION_GOAL_STEP_BATCH_SIZE");
    expect(source).toContain("goalPlanningLimit:");
    expect(source).toContain("goalStepLimit:");
  });

  it("loads the calendar-sync dependency graph outside the Next.js react-server condition", async () => {
    const backgroundFunction = await import("../../../netlify/functions/run-calendar-sync-background");

    expect(backgroundFunction.default).toBeTypeOf("function");
    expect(backgroundFunction.config).toEqual({ background: true });
  }, 15_000);
});
