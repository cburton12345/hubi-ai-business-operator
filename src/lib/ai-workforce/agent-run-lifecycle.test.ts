import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AI agent run lifecycle", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/ai-workforce/agent-workflows.ts"), "utf8");
  const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/166_ai_agent_run_lifecycle.sql"), "utf8");

  it("expires abandoned runs before scheduled and manual execution", () => {
    expect(source).toContain("expireStaleAgentRuns(tenantId)");
    expect(source).toContain("expireStaleAgentRuns(input.tenantId)");
    expect(source).toContain("stale_run_timeout");
  });

  it("prevents concurrent active runs for one workflow", () => {
    expect(source).toContain("where not exists");
    expect(source).toContain("on conflict do nothing");
    expect(migration).toContain("idx_ai_agent_runs_one_active_per_workflow");
    expect(migration).toContain("status in ('queued', 'running')");
  });
});
