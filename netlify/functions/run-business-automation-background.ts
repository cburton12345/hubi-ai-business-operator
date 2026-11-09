import type { Config } from "@netlify/functions";
import { runBusinessAutomationLoop } from "../../src/lib/automation/run-business-automation";

function boundedInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export default async function runBusinessAutomationBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runBusinessAutomationLoop({
    tenantLimit: boundedInt(Netlify.env.get("AUTOMATION_TENANT_BATCH_SIZE"), 4, 4),
    agentLimit: boundedInt(Netlify.env.get("AUTOMATION_AGENT_BATCH_SIZE"), 25, 25),
    tenantConcurrency: boundedInt(Netlify.env.get("AUTOMATION_TENANT_CONCURRENCY"), 1, 1),
    goalPlanningLimit: boundedInt(Netlify.env.get("AUTOMATION_GOAL_PLAN_BATCH_SIZE"), 8, 25),
    goalPlanningConcurrency: boundedInt(Netlify.env.get("AUTOMATION_GOAL_PLANNING_CONCURRENCY"), 1, 1),
    goalStepLimit: boundedInt(Netlify.env.get("AUTOMATION_GOAL_STEP_BATCH_SIZE"), 50, 100)
  });
  console.log("Business automation background run completed", {
    skipped: result.skipped,
    skipReason: result.skipped ? result.skipReason : null,
    tenantsChecked: "tenantsChecked" in result ? result.tenantsChecked : 0,
    tenantFailures: "tenantFailures" in result ? result.tenantFailures.length : 0,
    elapsedMs: result.elapsedMs
  });

  return new Response(null, { status: 204 });
}

export const config: Config = {
  background: true
};
