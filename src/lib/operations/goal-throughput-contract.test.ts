import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("persistent operating-goal throughput", () => {
  it("plans several due goals with bounded per-workspace concurrency", () => {
    const planner = source("src/lib/operations/goal-planner.ts");
    expect(planner).toContain("limit = 8");
    expect(planner).toContain("Math.min(Math.floor(limit), 25)");
    expect(planner).toContain("AUTOMATION_GOAL_PLANNING_CONCURRENCY");
    expect(planner).toContain("Math.min(Math.floor(configured), 3)");
    expect(planner).toContain("await Promise.all");
    expect(planner).toContain('"failed" | "stale"');
  });

  it("round-robins due steps across goals instead of exhausting one goal first", () => {
    const runner = source("src/lib/operations/goal-step-runner.ts");
    expect(runner).toContain("limit = 50");
    expect(runner).toContain("partition by step.goal_id");
    expect(runner).toContain("goal_round,goal.next_evaluation_at");
  });

  it("shows the complete active count without rendering an unbounded chat list", () => {
    const page = source("src/app/app/ferocity/page.tsx");
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    expect(page).toContain("count(*) over()::text as active_goal_count");
    expect(page).toContain("limit 8");
    expect(chat).toContain("operatingGoalTotal - operatingGoals.length");
    expect(chat).toContain("more outcome");
  });
});
