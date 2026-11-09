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
    expect(source).toContain("skipReason: result.skipped ? result.skipReason : null");
    expect(source).toContain('AUTOMATION_TENANT_BATCH_SIZE"), 4, 4');
    expect(source).toContain('AUTOMATION_AGENT_BATCH_SIZE"), 25, 25');
    expect(source).toContain('AUTOMATION_TENANT_CONCURRENCY"), 1, 1');
    expect(source).toContain('AUTOMATION_GOAL_PLANNING_CONCURRENCY"), 1, 1');
  });

  it("spaces the database-heavy business automation schedule beyond its observed runtime", async () => {
    const scheduledFunction = await import("../../../netlify/functions/run-business-automation");
    expect(scheduledFunction.config).toEqual({ schedule: "*/20 * * * *" });
  });

  it("loads the calendar-sync dependency graph outside the Next.js react-server condition", async () => {
    const backgroundFunction = await import("../../../netlify/functions/run-calendar-sync-background");

    expect(backgroundFunction.default).toBeTypeOf("function");
    expect(backgroundFunction.config).toEqual({ background: true });
  }, 15_000);
});
